import type { EnrichmentRow } from '@agent-profiler/core';
import { DefaultAzureCredential } from '@azure/identity';
import { LogsIngestionClient } from '@azure/monitor-ingestion';

export interface LogsIngestionConfig {
  /** Data Collection Endpoint URL, e.g. https://dce-xxx.westeurope-1.ingest.monitor.azure.com */
  dceEndpoint: string;
  /** DCR immutable ID, e.g. dcr-xxx */
  dcrImmutableId: string;
  /** DCR stream name, e.g. Custom-AgentProfilerEnrichment_CL */
  dcrStreamName: string;
}

export class LogsIngestionWriter {
  private client: LogsIngestionClient;
  private config: LogsIngestionConfig;

  constructor(config: LogsIngestionConfig) {
    this.config = config;
    this.client = new LogsIngestionClient(
      config.dceEndpoint,
      new DefaultAzureCredential(),
    );
  }

  /**
   * Push enrichment rows to the custom Logs table.
   * Stamps each row with the current ISO timestamp as PushedAt.
   * Returns the number of rows successfully pushed.
   * Throws on unrecoverable errors (auth failure, invalid config).
   */
  async push(rows: readonly EnrichmentRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    const enrichedRows = rows.map(row => ({ ...row, PushedAt: now }));

    // The SDK handles batching and retries internally.
    await this.client.upload(
      this.config.dcrImmutableId,
      this.config.dcrStreamName,
      enrichedRows,
    );

    return enrichedRows.length;
  }

  /**
   * Validate config by attempting a zero-row upload (tests auth + config).
   * Returns true if the configuration is valid, or an error message string if not.
   */
  async validate(): Promise<true | string> {
    try {
      await this.client.upload(
        this.config.dcrImmutableId,
        this.config.dcrStreamName,
        [],
      );
      return true;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }
}
