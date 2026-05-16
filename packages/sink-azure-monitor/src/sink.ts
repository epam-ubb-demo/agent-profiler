import type { EnrichmentRow } from '@agent-profiler/core';
import type { EnrichmentEvent, EnrichmentSink, PushResult, RejectInfo } from '@agent-profiler/enrichment-core';

import { mapEventsToRows, VALID_CATEGORIES } from './row-mapper.js';

/**
 * Function that uploads rows to the remote store.
 *
 * **Contract for availability probing:** {@link AzureMonitorEnrichmentSink.availability}
 * calls this function with an empty array (`[]`) to test connectivity. Implementations
 * MUST NOT short-circuit empty arrays — they must attempt to contact the remote service
 * so that any auth or network failure is surfaced.
 */
export type RowUploader = (rows: readonly EnrichmentRow[]) => Promise<void>;

export interface AzureMonitorSinkConfig {
  /** Unique sink identifier. Defaults to 'azure-monitor'. */
  id?: string;
  /**
   * Categories this sink supports. Defaults to the 4 known DCR categories:
   * `metadata`, `utilisation`, `compaction`, `tool_result`.
   * Pass `['*']` to accept any category.
   */
  supportedCategories?: readonly string[];
  /** The upload function — injected to decouple from Azure SDK. */
  upload: RowUploader;
}

export class AzureMonitorEnrichmentSink implements EnrichmentSink {
  readonly id: string;
  private readonly supportedCategories: readonly string[];
  private readonly upload: RowUploader;

  constructor(config: AzureMonitorSinkConfig) {
    this.id = config.id ?? 'azure-monitor';
    this.supportedCategories = config.supportedCategories ?? [...VALID_CATEGORIES];
    this.upload = config.upload;
  }

  /**
   * Checks whether the sink can reach the remote service.
   *
   * Calls the injected {@link RowUploader} with an empty array as a connectivity
   * probe. The uploader MUST attempt to contact the remote service even for an
   * empty batch — see the {@link RowUploader} contract.
   *
   * @returns `true` if the uploader completes without throwing; `false` otherwise.
   */
  async availability(): Promise<boolean> {
    try {
      await this.upload([]);
      return true;
    } catch {
      return false;
    }
  }

  supportsCategory(category: string): boolean {
    return this.supportedCategories.includes('*') || this.supportedCategories.includes(category);
  }

  async push(batch: readonly EnrichmentEvent[]): Promise<PushResult> {
    if (batch.length === 0) {
      return { acceptedOrdinals: [], rejected: [] };
    }

    // Split the batch: events whose category this sink supports vs. those it doesn't.
    const supported: EnrichmentEvent[] = [];
    const categoryRejected: RejectInfo[] = [];
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
    const rows = mapEventsToRows(supported, pushTimestamp);

    try {
      await this.upload(rows);
      return {
        acceptedOrdinals: supported.map(e => e.ordinal),
        rejected: categoryRejected,
      };
    } catch (error) {
      // On upload failure, report all supported events as rejected too.
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

