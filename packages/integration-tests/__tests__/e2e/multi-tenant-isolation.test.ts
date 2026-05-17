/**
 * T12.5 — Multi-tenant isolation E2E tests.
 *
 * Verifies that the KQL filter helpers in `@agent-profiler/enrichment-core`
 * correctly partition data by tenant and user in a live Azure Log Analytics
 * workspace.
 *
 * - T12.5.1  Push fixture events for two tenants (tenant-A / Alice, tenant-B / Bob).
 * - T12.5.2  Team view filter returns only tenant-A rows.
 * - T12.5.3  User view filter returns only Alice's rows.
 * - T12.5.4  Admin query (no tenant filter) returns rows from both tenants.
 *
 * Tests are skipped automatically when Azure environment variables are absent.
 */

import {
  AGENT_SESSION_EVENTS_TABLE,
  buildTeamViewFilter,
  buildUserViewFilter,
} from '@agent-profiler/enrichment-core';
import { loadCopilotCliFixture, loadVsCodeChatFixture } from '@agent-profiler/test-fixtures';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  AZURE_AVAILABLE,
  INGESTION_DELAY_MS,
  createTestDcrSink,
  createTestQueryClient,
  waitForIngestion,
} from './azure-helpers.js';

describe.skipIf(!AZURE_AVAILABLE)('Multi-tenant isolation', () => {
  // Unique identifiers per test run to prevent cross-run data collisions.
  const tenantA = `tenant-a-${crypto.randomUUID()}`;
  const tenantB = `tenant-b-${crypto.randomUUID()}`;
  const userAlice = `alice-${crypto.randomUUID()}@example.com`;
  const userBob = `bob-${crypto.randomUUID()}@example.com`;

  // Event counts populated in beforeAll and read by individual assertions.
  let copilotEventCount = 0;
  let vsCodeEventCount = 0;

  // T12.5.1 — Push fixture events for both tenants before any assertion test runs.
  beforeAll(async () => {
    const sink = createTestDcrSink();
    const copilotFixture = loadCopilotCliFixture();
    const vsCodeFixture = loadVsCodeChatFixture();

    // Tag Copilot CLI events with tenant-A / Alice.
    const copilotEvents = copilotFixture.expectedEvents.map(e => ({
      ...e,
      tenantId: tenantA,
      userId: userAlice,
    }));

    // Tag VS Code Chat events with tenant-B / Bob.
    const vsCodeEvents = vsCodeFixture.expectedEvents.map(e => ({
      ...e,
      tenantId: tenantB,
      userId: userBob,
    }));

    copilotEventCount = copilotEvents.length;
    vsCodeEventCount = vsCodeEvents.length;

    // Push both tenants' events concurrently — any rejection aborts the suite.
    const [copilotResult, vsCodeResult] = await Promise.all([
      sink.push(copilotEvents),
      sink.push(vsCodeEvents),
    ]);

    expect(copilotResult.rejected).toHaveLength(0);
    expect(vsCodeResult.rejected).toHaveLength(0);
  }, 60_000);

  // T12.5.2 — Team view filter: only tenant-A events must appear.
  it(
    'team view filter (buildTeamViewFilter) returns only tenant-A rows',
    async () => {
      const queryClient = createTestQueryClient();

      // Exercise the KQL helper under test directly.
      const kql = [AGENT_SESSION_EVENTS_TABLE, buildTeamViewFilter(tenantA)].join('\n');
      const rows = await waitForIngestion(queryClient, kql, copilotEventCount);

      expect(rows).toHaveLength(copilotEventCount);

      for (const row of rows) {
        expect(row['TenantId']).toBe(tenantA);
      }
    },
    INGESTION_DELAY_MS + 60_000,
  );

  // T12.5.3 — User view filter: only Alice's events must appear.
  it(
    'user view filter (buildUserViewFilter) returns only Alice rows',
    async () => {
      const queryClient = createTestQueryClient();

      // Chain tenant and user filters: validates the "team member sees only own
      // sessions within their tenant" scenario and guards against a matching
      // SourceUser appearing in an unrelated tenant.
      const kql = [
        AGENT_SESSION_EVENTS_TABLE,
        buildTeamViewFilter(tenantA),
        buildUserViewFilter(userAlice),
      ].join('\n');
      const rows = await waitForIngestion(queryClient, kql, copilotEventCount);

      expect(rows).toHaveLength(copilotEventCount);

      for (const row of rows) {
        expect(row['SourceUser']).toBe(userAlice);
      }
    },
    INGESTION_DELAY_MS + 60_000,
  );

  // T12.5.4 — Admin query: an unrestricted scan must surface data from both tenants.
  it(
    'admin query (no tenant filter) returns rows from both tenant-A and tenant-B',
    async () => {
      const queryClient = createTestQueryClient();

      // Scope to this test run via tenant IDs so the assertion is deterministic,
      // but intentionally apply no buildTeamViewFilter / buildUserViewFilter.
      const kql = [
        AGENT_SESSION_EVENTS_TABLE,
        `| where TenantId in ("${tenantA}", "${tenantB}")`,
      ].join('\n');

      const totalEvents = copilotEventCount + vsCodeEventCount;
      const rows = await waitForIngestion(queryClient, kql, totalEvents);

      // Both tenant identifiers must be represented in the result set.
      const hasTenantA = rows.some(r => r['TenantId'] === tenantA);
      const hasTenantB = rows.some(r => r['TenantId'] === tenantB);

      expect(hasTenantA).toBe(true);
      expect(hasTenantB).toBe(true);
    },
    INGESTION_DELAY_MS + 60_000,
  );
});
