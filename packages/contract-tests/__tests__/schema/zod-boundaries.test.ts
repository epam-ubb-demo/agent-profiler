/**
 * T12.1.4 — Zod schema boundary validation tests.
 *
 * Verifies that:
 * 1. All golden EnrichmentEvents pass enrichmentEventSchema.safeParse().
 * 2. All DcrRows produced from golden events pass dcrRowSchema.safeParse().
 * 3. Invalid payloads are correctly rejected by both schemas.
 */

import { enrichmentEventSchema } from '@agent-profiler/enrichment-core';
import { dcrRowSchema, mapEventsToDcrRows } from '@agent-profiler/sink-dcr';
import {
  expectedClaudeCodeEvents,
  expectedCopilotCliEvents,
  expectedVsCodeChatEvents,
} from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

const PUSH_TS = '2025-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// EnrichmentEvent schema
// ---------------------------------------------------------------------------

describe('enrichmentEventSchema — golden events pass validation', () => {
  it('validates all copilot-cli golden events', () => {
    for (const event of expectedCopilotCliEvents) {
      const result = enrichmentEventSchema.safeParse(event);
      expect(result.success, `copilot-cli event ${event.eventId} failed: ${!result.success ? JSON.stringify(result.error) : ''}`).toBe(true);
    }
  });

  it('validates all vscode-chat golden events', () => {
    for (const event of expectedVsCodeChatEvents) {
      const result = enrichmentEventSchema.safeParse(event);
      expect(result.success, `vscode-chat event ${event.eventId} failed: ${!result.success ? JSON.stringify(result.error) : ''}`).toBe(true);
    }
  });

  it('validates all claude-code golden events', () => {
    for (const event of expectedClaudeCodeEvents) {
      const result = enrichmentEventSchema.safeParse(event);
      expect(result.success, `claude-code event ${event.eventId} failed: ${!result.success ? JSON.stringify(result.error) : ''}`).toBe(true);
    }
  });
});

describe('enrichmentEventSchema — rejects invalid payloads', () => {
  const validBase = expectedCopilotCliEvents[0]!;

  it('rejects schemaVersion other than 1', () => {
    const result = enrichmentEventSchema.safeParse({ ...validBase, schemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown tool identifier', () => {
    const result = enrichmentEventSchema.safeParse({ ...validBase, tool: 'unknown-tool' });
    expect(result.success).toBe(false);
  });

  it('rejects negative ordinal', () => {
    const result = enrichmentEventSchema.safeParse({ ...validBase, ordinal: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { sessionId: _omit, ...withoutSessionId } = validBase;
    const result = enrichmentEventSchema.safeParse(withoutSessionId);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DcrRow schema
// ---------------------------------------------------------------------------

describe('dcrRowSchema — rows produced from golden events pass validation', () => {
  it('validates all DcrRows from copilot-cli golden events', () => {
    const rows = mapEventsToDcrRows(expectedCopilotCliEvents, PUSH_TS);
    for (const row of rows) {
      const result = dcrRowSchema.safeParse(row);
      expect(result.success, `copilot-cli row ${row.EventId} failed: ${!result.success ? JSON.stringify(result.error) : ''}`).toBe(true);
    }
  });

  it('validates all DcrRows from vscode-chat golden events', () => {
    const rows = mapEventsToDcrRows(expectedVsCodeChatEvents, PUSH_TS);
    for (const row of rows) {
      const result = dcrRowSchema.safeParse(row);
      expect(result.success, `vscode-chat row ${row.EventId} failed: ${!result.success ? JSON.stringify(result.error) : ''}`).toBe(true);
    }
  });

  it('validates all DcrRows from claude-code golden events', () => {
    const rows = mapEventsToDcrRows(expectedClaudeCodeEvents, PUSH_TS);
    for (const row of rows) {
      const result = dcrRowSchema.safeParse(row);
      expect(result.success, `claude-code row ${row.EventId} failed: ${!result.success ? JSON.stringify(result.error) : ''}`).toBe(true);
    }
  });
});

describe('dcrRowSchema — rejects invalid rows', () => {
  const validRow = mapEventsToDcrRows([expectedCopilotCliEvents[0]!], PUSH_TS)[0]!;

  it('rejects missing TimeGenerated', () => {
    const { TimeGenerated: _omit, ...withoutTs } = validRow;
    const result = dcrRowSchema.safeParse(withoutTs);
    expect(result.success).toBe(false);
  });

  it('rejects numeric Payload (must be a JSON string)', () => {
    const result = dcrRowSchema.safeParse({ ...validRow, Payload: 42 });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric Ordinal', () => {
    const result = dcrRowSchema.safeParse({ ...validRow, Ordinal: 'first' });
    expect(result.success).toBe(false);
  });
});
