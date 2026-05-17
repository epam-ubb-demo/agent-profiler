/**
 * T12.4.3 — KQL query-back E2E test.
 *
 * Pushes the golden Copilot CLI fixture events to the live Azure Monitor
 * AgentSessionEvents_CL table, waits for ingestion, then queries them back
 * via KQL and verifies that all envelope fields round-trip correctly.
 *
 * Tests are skipped automatically when Azure environment variables are absent.
 */

import { loadCopilotCliFixture } from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  AZURE_AVAILABLE,
  INGESTION_DELAY_MS,
  createTestDcrSink,
  createTestQueryClient,
  waitForIngestion,
} from './azure-helpers.js';

describe.skipIf(!AZURE_AVAILABLE)('KQL query-back — envelope field round-trip', () => {
  it(
    'all envelope fields round-trip for copilot-cli fixture',
    async () => {
      const sink = createTestDcrSink();
      const queryClient = createTestQueryClient();
      const fixture = loadCopilotCliFixture();
      const testRunId = `e2e-${crypto.randomUUID()}`;

      const taggedEvents = fixture.expectedEvents.map(e => ({
        ...e,
        tenantId: testRunId,
      }));

      // Push all events to the DCR sink.
      const pushResult = await sink.push(taggedEvents);
      expect(pushResult.rejected).toHaveLength(0);

      // Wait for Azure Monitor ingestion (up to 5 minutes).
      const kql = `AgentSessionEvents_CL | where TenantId == "${testRunId}" | order by Ordinal asc`;
      const rows = await waitForIngestion(
        queryClient,
        kql,
        taggedEvents.length,
        INGESTION_DELAY_MS,
      );

      expect(rows.length).toBe(taggedEvents.length);

      // Verify each expected event round-trips correctly.
      for (const expectedEvent of taggedEvents) {
        const row = rows.find(r => r['EventId'] === expectedEvent.eventId);

        expect(row).toBeDefined();
        if (row === undefined) continue;

        // Core envelope fields
        expect(row['EventId']).toBe(expectedEvent.eventId);
        expect(row['SessionId']).toBe(expectedEvent.sessionId);
        expect(row['Tool']).toBe(expectedEvent.tool);
        expect(row['ToolVersion']).toBe(expectedEvent.toolVersion);
        expect(row['Category']).toBe(expectedEvent.category);
        expect(row['Ordinal']).toBe(expectedEvent.ordinal);
        expect(row['PayloadSchema']).toBe(expectedEvent.payloadSchema);
        expect(row['SchemaVersion']).toBe(expectedEvent.schemaVersion);
        expect(row['SourceMachine']).toBe(expectedEvent.sourceMachine);

        // Optional fields use empty string as sentinel when absent.
        expect(row['SourceUser']).toBe(expectedEvent.userId ?? '');
        expect(row['TenantId']).toBe(testRunId);

        // Payload must be valid JSON and contain all expected top-level keys.
        const payloadStr = row['Payload'];
        expect(typeof payloadStr).toBe('string');
        const payload = JSON.parse(payloadStr as string) as Record<string, unknown>;
        for (const key of Object.keys(expectedEvent.payload)) {
          expect(key in payload).toBe(true);
        }
      }
    },
    INGESTION_DELAY_MS + 60_000,
  );
});
