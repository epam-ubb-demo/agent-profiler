import type { EnrichmentEvent, EnrichmentSink, PushResult } from '@agent-profiler/enrichment-core';
import { RetriableSinkError } from '@agent-profiler/enrichment-core';
import { DefaultAzureCredential } from '@azure/identity';
import type { TokenCredential } from '@azure/identity';
import { LogsIngestionClient } from '@azure/monitor-ingestion';

import { mapEventsToDcrRows } from './row-mapper.js';

export interface DcrSinkConfig {
  /** Unique sink identifier. Defaults to `'dcr'`. */
  id?: string;
  /**
   * DCE (Data Collection Endpoint) ingestion URL.
   * Example: `https://my-dce-abc123.eastus-1.ingest.monitor.azure.com`
   */
  endpoint: string;
  /** Immutable ID of the DCR (Data Collection Rule). */
  ruleId: string;
  /** Custom stream name declared in the DCR (e.g. `Custom-AgentSessionEvents_CL`). */
  streamName: string;
  /**
   * Categories this sink accepts. Defaults to `['*']` (all categories).
   * Pass an explicit list to filter (e.g. `['metadata', 'utilisation']`).
   */
  supportedCategories?: readonly string[];
  /**
   * Azure credential used to authenticate with the DCE.
   * Defaults to {@link DefaultAzureCredential} when omitted.
   */
  credential?: TokenCredential;
}

/**
 * Duck-type helper that extracts an HTTP status code from an unknown thrown
 * value without requiring an import of `@azure/core-rest-pipeline`'s
 * `RestError`.  Works with any error object that carries a numeric
 * `statusCode` property (including the Azure SDK's `RestError`).
 */
function getStatusCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { statusCode } = err as { statusCode?: unknown };
  return typeof statusCode === 'number' ? statusCode : undefined;
}

/**
 * Attempts to parse a `Retry-After` header (in seconds) from an unknown error
 * and converts it to milliseconds.  Returns `undefined` when the header is
 * absent or unparseable.
 */
function getRetryAfterMs(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  const headers = (response as { headers?: unknown }).headers;
  if (typeof headers !== 'object' || headers === null) return undefined;
  if (typeof (headers as { get?: unknown }).get !== 'function') return undefined;
  const retryAfter = (headers as { get: (name: string) => string | null }).get('Retry-After');
  if (retryAfter === null) return undefined;
  const seconds = parseInt(retryAfter, 10);
  return Number.isNaN(seconds) ? undefined : seconds * 1000;
}

/**
 * An {@link EnrichmentSink} implementation that uploads enrichment events to
 * an Azure Monitor custom table (`AgentSessionEvents_CL`) via the DCR Logs
 * Ingestion API.
 *
 * ### Availability
 * {@link availability} always returns `true`.  The Azure SDK's
 * `LogsIngestionClient.upload()` with an empty array does not make a network
 * call, so there is no useful connectivity probe available — being configured
 * is treated as being available.
 *
 * ### Error handling
 * - HTTP 429 or 5xx responses cause a {@link RetriableSinkError} to be thrown
 *   so the caller can back off and retry.
 * - All other errors cause the affected events to be included in the
 *   `rejected` list of the returned {@link PushResult}.
 */
export class DcrEnrichmentSink implements EnrichmentSink {
  readonly id: string;
  private readonly ruleId: string;
  private readonly streamName: string;
  private readonly supportedCategories: readonly string[];
  private readonly client: LogsIngestionClient;

  constructor(config: DcrSinkConfig) {
    this.id = config.id ?? 'dcr';
    this.ruleId = config.ruleId;
    this.streamName = config.streamName;
    this.supportedCategories = config.supportedCategories ?? ['*'];
    const credential = config.credential ?? new DefaultAzureCredential();
    this.client = new LogsIngestionClient(config.endpoint, credential);
  }

  /**
   * Returns `true` unconditionally.
   *
   * `LogsIngestionClient.upload()` with an empty array does not contact the
   * remote service, so there is no useful connectivity probe.  Being
   * configured is treated as being available.
   */
  async availability(): Promise<boolean> {
    return true;
  }

  supportsCategory(category: string): boolean {
    return this.supportedCategories.includes('*') || this.supportedCategories.includes(category);
  }

  async push(batch: readonly EnrichmentEvent[]): Promise<PushResult> {
    if (batch.length === 0) {
      return { acceptedOrdinals: [], rejected: [] };
    }

    // Partition the batch into supported and unsupported categories.
    const supported: EnrichmentEvent[] = [];
    const categoryRejected: { ordinal: number; reason: string }[] = [];
    for (const event of batch) {
      if (this.supportsCategory(event.category)) {
        supported.push(event);
      } else {
        categoryRejected.push({
          ordinal: event.ordinal,
          reason: `Unsupported category: ${event.category}`,
        });
      }
    }

    if (supported.length === 0) {
      return { acceptedOrdinals: [], rejected: categoryRejected };
    }

    const pushTimestamp = new Date().toISOString();
    const rows = mapEventsToDcrRows(supported, pushTimestamp);

    try {
      await this.client.upload(this.ruleId, this.streamName, rows as unknown as Record<string, unknown>[]);
      return {
        acceptedOrdinals: supported.map(e => e.ordinal),
        rejected: categoryRejected,
      };
    } catch (error) {
      // Throw RetriableSinkError for 429 (rate-limited) and 5xx (server errors).
      const statusCode = getStatusCode(error);
      if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
        const retryAfterMs = getRetryAfterMs(error);
        throw new RetriableSinkError(
          `DCR upload failed with status ${statusCode}`,
          retryAfterMs,
        );
      }

      const reason = error instanceof Error ? error.message : String(error);
      return {
        acceptedOrdinals: [],
        rejected: [
          ...categoryRejected,
          ...supported.map(e => ({ ordinal: e.ordinal, reason })),
        ],
      };
    }
  }
}
