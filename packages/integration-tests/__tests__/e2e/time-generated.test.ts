/**
 * T12.4.4 — TimeGenerated / EventTs timestamp E2E test.
 *
 * Pushes golden fixture events and verifies that:
 * - `TimeGenerated` is a recent timestamp (within 10 minutes of the push time).
 * - `EventTs` round-trips the original event timestamp from the fixture.
 * - `TimeGenerated` and `EventTs` differ (push time ≠ event time).
 * - `PushedAt` is approximately equal to `TimeGenerated` (both set at push time).
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

describe.skipIf(!AZURE_AVAILABLE)('TimeGenerated — timestamp preservation', () => {
  it(
    'TimeGenerated is recent, EventTs round-trips, PushedAt ≈ TimeGenerated',
    async () => {
      const sink = createTestDcrSink();
      const queryClient = createTestQueryClient();
      const fixture = loadCopilotCliFixture();
      const testRunId = `e2e-${crypto.randomUUID()}`;

      const taggedEvents = fixture.expectedEvents.map(e => ({
        ...e,
        tenantId: testRunId,
      }));

      // Record the wall-clock time immediately before the push.
      const pushTimestamp = new Date();
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

      expect(rows.length).toBeGreaterThan(0);

      // Validate timestamp semantics on every returned row.
      // The Azure SDK may return datetime columns as Date objects or ISO strings.
      // Normalise both forms to Date for safe arithmetic.
      const toDate = (value: unknown): Date =>
        value instanceof Date ? value : new Date(String(value));

      for (const row of rows) {
        // TimeGenerated must be a recent timestamp close to when we pushed.
        const timeGenerated = toDate(row['TimeGenerated']);
        const timeGeneratedDiffMs = Math.abs(
          timeGenerated.getTime() - pushTimestamp.getTime(),
        );
        expect(timeGeneratedDiffMs).toBeLessThan(10 * 60_000); // within 10 minutes

        // EventTs must be the original event timestamp from the fixture.
        const eventId = row['EventId'];
        const matchingEvent = taggedEvents.find(e => e.eventId === eventId);
        expect(matchingEvent).toBeDefined();
        if (matchingEvent !== undefined) {
          expect(row['EventTs']).toBe(matchingEvent.eventTs);
        }

        // Push time and event time must differ — the fixture events are from the
        // past, so TimeGenerated (≈ now) must not equal EventTs.
        expect(row['TimeGenerated']).not.toBe(row['EventTs']);

        // PushedAt is set to the same value as TimeGenerated at push time.
        // After Azure Monitor processing, they may diverge slightly — allow 1 minute.
        const pushedAt = toDate(row['PushedAt']);
        const pushedAtDiffMs = Math.abs(pushedAt.getTime() - timeGenerated.getTime());
        expect(pushedAtDiffMs).toBeLessThan(60_000); // within 1 minute
      }
    },
    INGESTION_DELAY_MS + 60_000,
  );
});
