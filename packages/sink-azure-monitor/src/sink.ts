import type { EnrichmentRow } from '@agent-profiler/core';
import type { EnrichmentEvent, EnrichmentSink, PushResult } from '@agent-profiler/enrichment-core';

import { mapEventsToRows } from './row-mapper.js';

/** Function that uploads rows to the remote store. Returns number of rows accepted. */
export type RowUploader = (rows: readonly EnrichmentRow[]) => Promise<number>;

export interface AzureMonitorSinkConfig {
  /** Unique sink identifier. Defaults to 'azure-monitor'. */
  id?: string;
  /** Categories this sink supports. Defaults to all ('*'). */
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
    this.supportedCategories = config.supportedCategories ?? ['*'];
    this.upload = config.upload;
  }

  async availability(): Promise<boolean> {
    // Try a no-op push to verify connectivity. If the uploader throws, not available.
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

    const pushTimestamp = new Date().toISOString();
    const rows = mapEventsToRows(batch, pushTimestamp);

    try {
      await this.upload(rows);
      return {
        acceptedOrdinals: batch.map(e => e.ordinal),
        rejected: [],
      };
    } catch (error) {
      // On failure, report all events as rejected
      const reason = error instanceof Error ? error.message : String(error);
      return {
        acceptedOrdinals: [],
        rejected: batch.map(e => ({ ordinal: e.ordinal, reason })),
      };
    }
  }
}
