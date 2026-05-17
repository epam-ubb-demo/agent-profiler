/**
 * T12.4.2 — DCR push E2E test.
 *
 * Pushes golden fixture events for all three AI coding tools to the live
 * Azure Monitor AgentSessionEvents_CL table via the DCR Logs Ingestion API
 * and verifies that every event is accepted without rejection.
 *
 * Tests are skipped automatically when Azure environment variables are absent.
 */

import {
  loadClaudeCodeFixture,
  loadCopilotCliFixture,
  loadVsCodeChatFixture,
} from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

import { AZURE_AVAILABLE, createTestDcrSink } from './azure-helpers.js';

describe.skipIf(!AZURE_AVAILABLE)('DCR push — golden fixtures', () => {
  it(
    'copilot-cli fixture: all events accepted',
    async () => {
      const sink = createTestDcrSink();
      const fixture = loadCopilotCliFixture();
      const testRunId = `e2e-${Date.now()}`;

      const taggedEvents = fixture.expectedEvents.map(e => ({
        ...e,
        tenantId: testRunId,
      }));

      const result = await sink.push(taggedEvents);

      expect(result.rejected).toHaveLength(0);
      expect(result.acceptedOrdinals).toHaveLength(fixture.expectedEvents.length);
      // Verify all ordinals are present in the accepted set
      for (const event of taggedEvents) {
        expect(result.acceptedOrdinals).toContain(event.ordinal);
      }
    },
    60_000,
  );

  it(
    'vscode-chat fixture: all events accepted',
    async () => {
      const sink = createTestDcrSink();
      const fixture = loadVsCodeChatFixture();
      const testRunId = `e2e-${Date.now()}`;

      const taggedEvents = fixture.expectedEvents.map(e => ({
        ...e,
        tenantId: testRunId,
      }));

      const result = await sink.push(taggedEvents);

      expect(result.rejected).toHaveLength(0);
      expect(result.acceptedOrdinals).toHaveLength(fixture.expectedEvents.length);
      for (const event of taggedEvents) {
        expect(result.acceptedOrdinals).toContain(event.ordinal);
      }
    },
    60_000,
  );

  it(
    'claude-code fixture: all events accepted',
    async () => {
      const sink = createTestDcrSink();
      const fixture = loadClaudeCodeFixture();
      const testRunId = `e2e-${Date.now()}`;

      const taggedEvents = fixture.expectedEvents.map(e => ({
        ...e,
        tenantId: testRunId,
      }));

      const result = await sink.push(taggedEvents);

      expect(result.rejected).toHaveLength(0);
      expect(result.acceptedOrdinals).toHaveLength(fixture.expectedEvents.length);
      for (const event of taggedEvents) {
        expect(result.acceptedOrdinals).toContain(event.ordinal);
      }
    },
    60_000,
  );
});
