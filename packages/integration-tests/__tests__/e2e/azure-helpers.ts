/**
 * Shared helpers for E2E Azure validation tests.
 *
 * Reads configuration from environment variables and exposes typed factory
 * functions for the DCR sink and KQL query client.  All consumers should
 * guard execution with {@link AZURE_AVAILABLE} so that the tests are
 * skipped automatically in CI environments where Azure credentials are absent.
 */

import { QueryClient } from '@agent-profiler/adapters-application-insights';
import { DcrEnrichmentSink } from '@agent-profiler/sink-dcr';

/** Azure configuration derived from environment variables. */
export const AZURE_CONFIG = {
  dceEndpoint: process.env['AZURE_DCE_ENDPOINT'] ?? '',
  dcrRuleId: process.env['AZURE_DCR_RULE_ID'] ?? '',
  workspaceId: process.env['AZURE_WORKSPACE_ID'] ?? '',
  streamName: 'Custom-AgentSessionEvents_CL',
} as const;

/**
 * `true` when all required Azure environment variables are present and
 * non-empty; `false` otherwise.
 *
 * Use this as the condition for `describe.skipIf(!AZURE_AVAILABLE)` so that
 * E2E tests are silently skipped in CI environments without Azure credentials.
 */
export const AZURE_AVAILABLE =
  AZURE_CONFIG.dceEndpoint !== '' &&
  AZURE_CONFIG.dcrRuleId !== '' &&
  AZURE_CONFIG.workspaceId !== '';

/**
 * Approximate Azure Monitor ingestion SLA in milliseconds (5 minutes).
 *
 * Use as the default `timeoutMs` argument to {@link waitForIngestion}, and add
 * 60 000 ms to test timeouts to allow for assertion time after ingestion.
 */
export const INGESTION_DELAY_MS = 300_000;

/**
 * Create a {@link DcrEnrichmentSink} pointed at the test workspace.
 *
 * Uses {@link AZURE_CONFIG} for the endpoint, rule ID, and stream name.
 * Credentials are resolved via `DefaultAzureCredential` (either a service
 * principal via `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET`,
 * or `az login` for interactive sessions).
 */
export function createTestDcrSink(): DcrEnrichmentSink {
  return new DcrEnrichmentSink({
    endpoint: AZURE_CONFIG.dceEndpoint,
    ruleId: AZURE_CONFIG.dcrRuleId,
    streamName: AZURE_CONFIG.streamName,
  });
}

/**
 * Create a {@link QueryClient} pointed at the test Log Analytics workspace.
 *
 * Credentials are resolved via `DefaultAzureCredential`.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ workspaceId: AZURE_CONFIG.workspaceId });
}

/**
 * Poll the Log Analytics workspace until at least `expectedMinRows` rows are
 * returned by `kql`, or until `timeoutMs` milliseconds have elapsed.
 *
 * Polls every 15 seconds.  Throws if the timeout expires before enough rows
 * appear.
 *
 * @param queryClient - Configured KQL query client.
 * @param kql - Kusto Query Language expression to execute.
 * @param expectedMinRows - Minimum number of rows required to consider
 *   ingestion complete.
 * @param timeoutMs - Maximum time to wait (default: {@link INGESTION_DELAY_MS}).
 * @returns The rows returned by the final successful query.
 */
export async function waitForIngestion(
  queryClient: QueryClient,
  kql: string,
  expectedMinRows: number,
  timeoutMs: number = INGESTION_DELAY_MS,
): Promise<Record<string, unknown>[]> {
  const start = Date.now();
  const pollInterval = 15_000; // poll every 15 s
  const timeRange = {
    startTime: new Date(Date.now() - 3_600_000), // 1 hour ago
    endTime: new Date(Date.now() + 600_000), // 10 min from now (safety buffer)
  };

  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await queryClient.query(kql, timeRange);
      if (result.rows.length >= expectedMinRows) {
        return result.rows;
      }
    } catch (err) {
      // Absorb transient errors (e.g. QueryTimeoutError, network blips) and
      // record the last one for diagnostic output on final timeout.
      lastError = err;
    }
    await new Promise<void>(r => setTimeout(r, pollInterval));
  }

  const errorSuffix =
    lastError !== undefined
      ? `. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      : '';
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${expectedMinRows} rows. KQL: ${kql}${errorSuffix}`,
  );
}
