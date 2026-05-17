import type {
  EnrichmentCursor,
  EnrichmentEvent,
  EnrichmentSink,
  Marker,
  MarkerStore,
  PushResult,
  SessionEnrichmentSource,
  SyncPlan,
  TenantConfig,
} from '@agent-profiler/enrichment-core';
import { buildEventId, RetriableSinkError } from '@agent-profiler/enrichment-core';

export interface JobUpdate {
  readonly sessionId: string;
  readonly tool: string;
  readonly state: 'pushing' | 'retrying' | 'done' | 'error';
  readonly categoriesTotal: number;
  readonly categoriesDone: number;
  readonly eventsAccepted: number;
  readonly eventsRejected: number;
  readonly error?: string | undefined;
}

export interface SyncOrchestratorOptions {
  /** Max events per sink push call. Default 256. */
  readonly batchSize?: number | undefined;
  /** Max retries on RetriableSinkError. Default 3. */
  readonly maxRetries?: number | undefined;
  /** Base backoff delay in ms. Default 1000. Uses exponential backoff. */
  readonly baseRetryDelayMs?: number | undefined;
  /** Cross-cutting tenant/user identity injected into every event before push. */
  readonly tenantConfig?: TenantConfig | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DefaultSyncOrchestrator {
  constructor(
    private readonly markerStore: MarkerStore,
    private readonly options?: SyncOrchestratorOptions,
  ) {}

  async runPlan(
    plan: SyncPlan,
    source: SessionEnrichmentSource,
    sinks: readonly EnrichmentSink[],
    onUpdate?: (update: JobUpdate) => void,
  ): Promise<JobUpdate> {
    const batchSize = this.options?.batchSize ?? 256;
    const maxRetries = this.options?.maxRetries ?? 3;
    const baseRetryDelayMs = this.options?.baseRetryDelayMs ?? 1000;

    const { ref } = plan;
    let eventsAccepted = 0;
    let eventsRejected = 0;
    let categoriesDone = 0;
    let lastError: string | undefined;

    const buildUpdate = (state: JobUpdate['state']): JobUpdate => ({
      sessionId: ref.sessionId,
      tool: ref.tool,
      state,
      categoriesTotal: plan.categories.length,
      categoriesDone,
      eventsAccepted,
      eventsRejected,
      ...(lastError !== undefined ? { error: lastError } : {}),
    });

    const sendUpdate = (state: JobUpdate['state']): void => {
      onUpdate?.(buildUpdate(state));
    };

    for (const plannedCat of plan.categories) {
      const { category, fromOrdinal, resetCursor } = plannedCat;
      const supportingSinks = sinks.filter((s) => s.supportsCategory(category));

      if (supportingSinks.length === 0) {
        categoriesDone++;
        continue;
      }

      const existingMarker = await this.markerStore.read(ref);
      const existingCursor: EnrichmentCursor | undefined = resetCursor
        ? undefined
        : existingMarker?.cursors[category];

      const cursorRecord: Record<string, EnrichmentCursor | undefined> = {
        [category]: existingCursor,
      };

      let batch: EnrichmentEvent[] = [];
      let categoryError: string | undefined;

      const flushBatch = async (batchToFlush: readonly EnrichmentEvent[]): Promise<void> => {
        const lastRaw = batchToFlush.at(-1);
        if (lastRaw === undefined) return;

        // Enrich events with tenant/user config if provided.
        // Creates new event objects — originals are never mutated.
        const configTenantId = this.options?.tenantConfig?.tenantId;
        const configUserId = this.options?.tenantConfig?.userId;
        const pushBatch: readonly EnrichmentEvent[] =
          configTenantId !== undefined || configUserId !== undefined
            ? batchToFlush.map((event) => {
                const newTenantId = configTenantId ?? event.tenantId;
                const newUserId = configUserId ?? event.userId;
                return {
                  ...event,
                  ...(configTenantId !== undefined ? { tenantId: configTenantId } : {}),
                  ...(configUserId !== undefined ? { userId: configUserId } : {}),
                  eventId: buildEventId({
                    ...(newTenantId !== undefined ? { tenantId: newTenantId } : {}),
                    ...(newUserId !== undefined ? { userId: newUserId } : {}),
                    tool: event.tool,
                    sessionId: event.sessionId,
                    category: event.category,
                    ordinal: event.ordinal,
                  }),
                };
              })
            : batchToFlush;

        // lastRaw is always defined (batch non-empty), and pushBatch has the same
        // length, so the fallback to lastRaw is purely for TypeScript's benefit.
        const lastEvent = pushBatch.at(-1) ?? lastRaw;

        let firstResult: PushResult | undefined;

        // Push to every supporting sink (at-least-once delivery).
        // Each sink is retried independently; a failure in one sink does NOT
        // suppress delivery to subsequent sinks — the error propagates and
        // the entire batch is retried by the caller.
        for (const sink of supportingSinks) {
          let attempt = 0;
          while (true) {
            try {
              sendUpdate('pushing');
              const result = await sink.push(pushBatch);
              if (firstResult === undefined) {
                firstResult = result;
              }
              break;
            } catch (err) {
              if (err instanceof RetriableSinkError && attempt < maxRetries) {
                attempt++;
                sendUpdate('retrying');
                const delay =
                  err.retryAfterMs ?? baseRetryDelayMs * Math.pow(2, attempt - 1);
                await sleep(delay);
              } else {
                throw err;
              }
            }
          }
        }

        if (firstResult !== undefined) {
          eventsAccepted += firstResult.acceptedOrdinals.length;
          eventsRejected += firstResult.rejected.length;
        }

        // Build and persist updated marker
        const currentMarker = await this.markerStore.read(ref);
        const newCursor: EnrichmentCursor = {
          tool: lastEvent.tool,
          sessionId: lastEvent.sessionId,
          category: lastEvent.category,
          lastOrdinal: lastEvent.ordinal,
          lastEventId: lastEvent.eventId,
          lastEventTs: lastEvent.eventTs,
          lastIngestedAt: new Date().toISOString(),
        };

        const baseCursors = currentMarker?.cursors ?? {};
        const basePayloadSchemaVersions = currentMarker?.payloadSchemaVersions ?? {};
        const tenantId = currentMarker?.tenantId ?? lastEvent.tenantId;
        const userId = currentMarker?.userId ?? lastEvent.userId;
        const existingLastFullReuploadAt = currentMarker?.lastFullReuploadAt;

        const updatedMarker: Marker = {
          schemaVersion: 2,
          tool: ref.tool,
          sessionId: ref.sessionId,
          cursors: { ...baseCursors, [category]: newCursor },
          payloadSchemaVersions: {
            ...basePayloadSchemaVersions,
            [category]: lastEvent.payloadSchema,
          },
          ...(tenantId !== undefined ? { tenantId } : {}),
          ...(userId !== undefined ? { userId } : {}),
          ...(existingLastFullReuploadAt !== undefined
            ? { lastFullReuploadAt: existingLastFullReuploadAt }
            : {}),
        };

        await this.markerStore.write(ref, updatedMarker);
      };

      try {
        for await (const event of source.readEvents(ref, cursorRecord)) {
          if (event.category !== category) continue;
          if (event.ordinal < fromOrdinal) continue;

          batch.push(event);

          if (batch.length >= batchSize) {
            await flushBatch(batch);
            batch = [];
          }
        }

        if (batch.length > 0) {
          await flushBatch(batch);
          batch = [];
        }
      } catch (err) {
        categoryError = err instanceof Error ? err.message : String(err);
        lastError = categoryError;
      }

      categoriesDone++;
      if (categoryError !== undefined) {
        sendUpdate('error');
      }
    }

    // After a full plan, stamp lastFullReuploadAt on the marker
    if (plan.mode === 'full') {
      const now = new Date().toISOString();
      const currentMarker = await this.markerStore.read(ref);
      if (currentMarker !== undefined) {
        const fullMarker: Marker = {
          schemaVersion: 2,
          tool: currentMarker.tool,
          sessionId: currentMarker.sessionId,
          cursors: currentMarker.cursors,
          payloadSchemaVersions: currentMarker.payloadSchemaVersions,
          ...(currentMarker.tenantId !== undefined ? { tenantId: currentMarker.tenantId } : {}),
          ...(currentMarker.userId !== undefined ? { userId: currentMarker.userId } : {}),
          lastFullReuploadAt: now,
        };
        await this.markerStore.write(ref, fullMarker);
      }
    }

    const finalState: JobUpdate['state'] = lastError !== undefined ? 'error' : 'done';
    const finalUpdate = buildUpdate(finalState);
    onUpdate?.(finalUpdate);
    return finalUpdate;
  }
}
