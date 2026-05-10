import { DefaultAzureCredential } from '@azure/identity';
import type { TokenCredential } from '@azure/identity';
import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query-logs';

import type { AppInsightsConfig, QueryResult, TimeRange } from './types';
import {
  AppInsightsError,
  AuthenticationError,
  QueryTimeoutError,
  WorkspaceNotFoundError,
} from './types';

const DEFAULT_TIMEOUT_MS = 60_000;

/** Default maximum span count per session before truncation is flagged. */
export const DEFAULT_MAX_SPAN_COUNT = 10_000;

/**
 * Thin wrapper around the Azure Monitor Logs Query client.
 *
 * Provides typed KQL execution against a Log Analytics workspace
 * and maps Azure SDK errors to domain-specific error types.
 */
export class QueryClient {
  private readonly logsClient: LogsQueryClient;
  private readonly config: AppInsightsConfig;
  private readonly timeoutMs: number;
  private readonly maxSpanCount: number;

  constructor(config: AppInsightsConfig) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxSpanCount = Math.max(1, config.maxSpanCount ?? DEFAULT_MAX_SPAN_COUNT);

    const credential: TokenCredential =
      config.credential ?? new DefaultAzureCredential();
    this.logsClient = new LogsQueryClient(credential);
  }

  /**
   * Execute a KQL query against the configured workspace.
   *
   * @param kql - Kusto Query Language expression.
   * @param timeRange - Start and end timestamps for the query window.
   * @returns Typed query result with row records.
   */
  async query(kql: string, timeRange: TimeRange): Promise<QueryResult> {
    try {
      const result = await this.logsClient.queryWorkspace(
        this.config.workspaceId,
        kql,
        timeRange,
        { serverTimeoutInSeconds: Math.ceil(this.timeoutMs / 1_000) },
      );

      // Partial results are acceptable — map whatever tables we received.
      const rows: Record<string, unknown>[] = [];

      // LogsQueryPartialResult stores rows in partialTables,
      // LogsQuerySuccessfulResult stores rows in tables.
      const tables =
        result.status === LogsQueryResultStatus.PartialFailure
          ? result.partialTables
          : result.tables;

      for (const table of tables) {
        for (const row of table.rows) {
          const record: Record<string, unknown> = {};
          for (const [i, col] of table.columnDescriptors.entries()) {
            if (col.name !== undefined) {
              record[col.name] = row[i];
            }
          }
          rows.push(record);
        }
      }

      return { rows };
    } catch (error: unknown) {
      if (error instanceof AppInsightsError) {
        throw error;
      }
      throw this.mapError(error);
    }
  }

  /**
   * Execute a KQL query and detect whether the result set was truncated.
   *
   * This method performs a single KQL query. Log Analytics imposes a
   * server-side row limit (typically 30 000 rows). The truncation flag
   * indicates when the result set reaches the configured
   * {@link maxSpanCount} threshold, signalling potential data loss.
   * For sessions exceeding this limit, callers should narrow the time
   * window or increase {@link maxSpanCount}.
   *
   * @param kql - Kusto Query Language expression.
   * @param timeRange - Start and end timestamps for the query window.
   * @returns Query result with an additional `truncated` flag.
   */
  async queryWithTruncationCheck(
    kql: string,
    timeRange: TimeRange,
  ): Promise<QueryResult & { truncated: boolean }> {
    const result = await this.query(kql, timeRange);
    const truncated = result.rows.length >= this.maxSpanCount;
    return { ...result, truncated };
  }

  /**
   * Verify connectivity to the configured workspace.
   *
   * Runs a trivial KQL statement and returns `true` on success.
   */
  async testConnection(): Promise<boolean> {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);
      await this.query('print connected=true', {
        startTime: fiveMinutesAgo,
        endTime: now,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Map an unknown SDK error to the appropriate domain error. */
  private mapError(error: unknown): AppInsightsError {
    const message =
      error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';

    if (
      name.includes('CredentialUnavailable') ||
      name.includes('Authentication') ||
      message.includes('authentication') ||
      message.includes('credential')
    ) {
      return new AuthenticationError(message);
    }

    if (
      (message.toLowerCase().includes('workspace') &&
        (message.toLowerCase().includes('not found') ||
          message.includes('404'))) ||
      message.toLowerCase().includes('workspace not found')
    ) {
      return new WorkspaceNotFoundError(this.config.workspaceId);
    }

    if (
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('timed out') ||
      name === 'AbortError'
    ) {
      return new QueryTimeoutError(this.timeoutMs);
    }

    return new AppInsightsError(message, 'UNKNOWN');
  }
}
