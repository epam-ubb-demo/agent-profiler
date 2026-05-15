import type { EnrichmentRow } from '@agent-profiler/core';

/** Default batch size: 100 rows per POST to stay well under typical collector limits */
const DEFAULT_BATCH_SIZE = 100;

export interface OtlpLogsWriterConfig {
  /** OTel Gateway URL, e.g. https://ca-otel-gw-demo.azurecontainerapps.io */
  otlpEndpoint: string;
  /** Max rows per OTLP POST request. Defaults to 100. */
  batchSize?: number;
}

export class OtlpLogsWriter {
  private readonly endpoint: string;
  private readonly batchSize: number;

  constructor(config: OtlpLogsWriterConfig) {
    // Normalise: strip trailing slash, append /v1/logs
    const base = config.otlpEndpoint.replace(/\/+$/, '');
    this.endpoint = `${base}/v1/logs`;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  /**
   * Push enrichment rows as OTLP log records to the OTel collector.
   * Splits rows into batches of batchSize and POSTs them sequentially.
   * Stamps each row with the current ISO timestamp as PushedAt.
   * Returns the total number of rows successfully pushed.
   * Throws immediately on first batch failure — remaining batches are not sent.
   */
  async push(rows: readonly EnrichmentRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    const totalBatches = Math.ceil(rows.length / this.batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const chunk = rows.slice(i * this.batchSize, (i + 1) * this.batchSize);
      console.log(`[OtlpLogsWriter] Pushing batch ${i + 1}/${totalBatches} (${chunk.length} rows)`);

      const body = this.buildOtlpPayload(chunk, now);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `OTLP push failed (${response.status} ${response.statusText}): ${text}`,
        );
      }
    }

    return rows.length;
  }

  /**
   * Transform EnrichmentRow[] into the OTLP JSON ExportLogsServiceRequest format.
   */
  private buildOtlpPayload(
    rows: readonly EnrichmentRow[],
    pushedAt: string,
  ): OtlpExportLogsServiceRequest {
    const logRecords: OtlpLogRecord[] = rows.map((row) => ({
      timeUnixNano: String(new Date(row.TimeGenerated).getTime() * 1_000_000),
      severityNumber: 9,
      severityText: 'INFO',
      body: { stringValue: JSON.stringify(row.Payload) },
      attributes: [
        { key: 'agent_profiler.enrichment', value: { boolValue: true } },
        { key: 'agent_profiler.session_id', value: { stringValue: row.SessionId } },
        { key: 'agent_profiler.category', value: { stringValue: row.Category } },
        { key: 'agent_profiler.event_id', value: { stringValue: row.EventId } },
        { key: 'agent_profiler.schema_version', value: { intValue: String(row.SchemaVersion) } },
        { key: 'agent_profiler.source_user', value: { stringValue: row.SourceUser } },
        { key: 'agent_profiler.source_machine', value: { stringValue: row.SourceMachine } },
        { key: 'agent_profiler.pushed_at', value: { stringValue: pushedAt } },
      ],
    }));

    return {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'agent-profiler-desktop' } },
              { key: 'service.namespace', value: { stringValue: 'agent-profiler' } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: 'agent-profiler.enrichment', version: '1' },
              logRecords,
            },
          ],
        },
      ],
    };
  }
}

// ── OTLP JSON type definitions (subset needed for logs) ──────────────────

interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: OtlpAttribute[];
}

interface OtlpExportLogsServiceRequest {
  resourceLogs: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeLogs: Array<{
      scope: { name: string; version: string };
      logRecords: OtlpLogRecord[];
    }>;
  }>;
}
