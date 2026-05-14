/**
 * Unit tests for EnrichmentBuilder.
 *
 * Tests the transformation of Session objects into EnrichmentRow arrays,
 * covering all categories, edge cases, and deterministic event ID generation.
 */

import { describe, expect, it } from 'vitest';
import type { Session, EnrichmentRow } from '@agent-profiler/core';
import { buildEnrichmentRows } from '../src/enrichment-builder';

// ── Fixture builders ────────────────────────────────────────────────────────

/**
 * Create a minimal valid Session fixture.
 * Caller can override any fields via the `overrides` parameter.
 */
function makeSession(overrides: Partial<Session> = {}): Session {
  const baseSession: Session = {
    sessionId: 'sess-test-001',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'test-repo',
    branch: 'main',
    cwd: '/test/cwd',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:05:00Z',
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: true,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  };
  return baseSession;
}

describe('buildEnrichmentRows', () => {
  describe('category toggles', () => {
    it('returns empty array when all categories disabled', () => {
      const session = makeSession();
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toEqual([]);
    });

    it('returns only metadata row when only metadata enabled', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: false,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.Category).toBe('metadata');
    });

    it('respects category toggles — disabled categories produce no rows', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
        compactions: [
          {
            timestamp: '2025-01-15T10:00:15Z',
            inputTokens: 100,
            outputTokens: 50,
            cacheRead: 0,
            cacheWrite: 0,
            model: 'claude-sonnet-4-20250514',
            turnId: 'turn-1',
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: false, // Disabled
          toolResults: false, // Disabled
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows.filter((r) => r.Category === 'compaction')).toHaveLength(0);
      expect(rows.filter((r) => r.Category === 'tool_result')).toHaveLength(0);
    });
  });

  describe('metadata row', () => {
    it('returns correct metadata row when enabled', () => {
      const session = makeSession({
        selectedModel: 'gpt-4-turbo',
        reasoningEffort: 'high',
        modelChanges: [
          {
            timestamp: '2025-01-15T10:01:00Z',
            model: 'claude-sonnet-4-20250514',
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: false,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(1);
      const metadataRow = rows[0]!;
      expect(metadataRow.Category).toBe('metadata');
      expect(metadataRow.EventId).toBe('sess-test-001:metadata:0');
      expect(metadataRow.Payload.selectedModel).toBe('gpt-4-turbo');
      expect(metadataRow.Payload.reasoningEffort).toBe('high');
      expect(metadataRow.Payload.success).toBe(true);
      expect(metadataRow.Payload.repository).toBe('test-repo');
    });

    it('uses session startTs as TimeGenerated for metadata row', () => {
      const session = makeSession({
        startTs: '2025-01-15T10:00:00Z',
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: false,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows[0]?.TimeGenerated).toBe('2025-01-15T10:00:00Z');
    });
  });

  describe('utilisation rows', () => {
    it('returns correct number of utilisation rows (one per sample)', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
          {
            timestamp: '2025-01-15T10:00:20Z',
            percentage: 60,
            used: 4096,
            total: 8192,
            buckets: {},
          },
          {
            timestamp: '2025-01-15T10:00:30Z',
            percentage: 55,
            used: 3500,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.Category === 'utilisation')).toBe(true);
    });

    it('handles empty utilisation array correctly', () => {
      const session = makeSession({
        utilisation: [],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });

    it('uses sample timestamp as TimeGenerated for utilisation rows', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows[0]?.TimeGenerated).toBe('2025-01-15T10:00:10Z');
    });

    it('includes all utilisation fields in payload', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: { 'bucket-1': 100 },
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.timestamp).toBe('2025-01-15T10:00:10Z');
      expect(payload?.percentage).toBe(45);
      expect(payload?.used).toBe(2048);
      expect(payload?.total).toBe(8192);
      expect(payload?.buckets).toEqual({ 'bucket-1': 100 });
    });
  });

  describe('compaction rows', () => {
    it('returns correct number of compaction rows', () => {
      const session = makeSession({
        compactions: [
          {
            timestamp: '2025-01-15T10:00:15Z',
            inputTokens: 100,
            outputTokens: 50,
            cacheRead: 10,
            cacheWrite: 5,
            model: 'claude-sonnet-4-20250514',
            turnId: 'turn-1',
          },
          {
            timestamp: '2025-01-15T10:00:25Z',
            inputTokens: 200,
            outputTokens: 100,
            cacheRead: 20,
            cacheWrite: 10,
            model: 'claude-sonnet-4-20250514',
            turnId: 'turn-2',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: true,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.Category === 'compaction')).toBe(true);
    });

    it('handles empty compactions array correctly', () => {
      const session = makeSession({
        compactions: [],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: true,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });

    it('includes all compaction fields in payload', () => {
      const session = makeSession({
        compactions: [
          {
            timestamp: '2025-01-15T10:00:15Z',
            inputTokens: 100,
            outputTokens: 50,
            cacheRead: 10,
            cacheWrite: 5,
            model: 'claude-sonnet-4-20250514',
            turnId: 'turn-1',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: true,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.inputTokens).toBe(100);
      expect(payload?.outputTokens).toBe(50);
      expect(payload?.cacheRead).toBe(10);
      expect(payload?.cacheWrite).toBe(5);
      expect(payload?.model).toBe('claude-sonnet-4-20250514');
      expect(payload?.turnId).toBe('turn-1');
    });
  });

  describe('tool result rows', () => {
    it('returns correct number of tool result rows', () => {
      const session = makeSession({
        toolCalls: [
          {
            toolCallId: 'tc-001',
            toolName: 'bash',
            model: 'claude-sonnet-4-20250514',
            startTs: '2025-01-15T10:00:05Z',
            endTs: '2025-01-15T10:00:06Z',
            durationMs: 1000,
            success: true,
            parentId: null,
            turnId: 'turn-1',
            eventId: 'evt-001',
            argumentsPreview: 'ls -la',
          },
          {
            toolCallId: 'tc-002',
            toolName: 'bash',
            model: 'claude-sonnet-4-20250514',
            startTs: '2025-01-15T10:00:10Z',
            endTs: '2025-01-15T10:00:12Z',
            durationMs: 2000,
            success: false,
            parentId: null,
            turnId: 'turn-2',
            eventId: 'evt-002',
            argumentsPreview: 'npm test',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.Category === 'tool_result')).toBe(true);
    });

    it('handles empty toolCalls array correctly', () => {
      const session = makeSession({
        toolCalls: [],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });

    it('includes all tool result fields in payload', () => {
      const session = makeSession({
        toolCalls: [
          {
            toolCallId: 'tc-001',
            toolName: 'bash',
            model: 'claude-sonnet-4-20250514',
            startTs: '2025-01-15T10:00:05Z',
            endTs: '2025-01-15T10:00:06Z',
            durationMs: 1000,
            success: true,
            parentId: 'parent-001',
            turnId: 'turn-1',
            eventId: 'evt-001',
            argumentsPreview: 'ls -la',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.toolCallId).toBe('tc-001');
      expect(payload?.toolName).toBe('bash');
      expect(payload?.model).toBe('claude-sonnet-4-20250514');
      expect(payload?.startTs).toBe('2025-01-15T10:00:05Z');
      expect(payload?.endTs).toBe('2025-01-15T10:00:06Z');
      expect(payload?.durationMs).toBe(1000);
      expect(payload?.success).toBe(true);
      expect(payload?.parentId).toBe('parent-001');
      expect(payload?.turnId).toBe('turn-1');
      expect(payload?.eventId).toBe('evt-001');
      expect(payload?.argumentsPreview).toBe('ls -la');
    });
  });

  describe('EventId generation', () => {
    it('generates deterministic EventIds of form <sessionId>:<category>:<index>', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows[0]?.EventId).toBe('sess-test-001:metadata:0');
      expect(rows[1]?.EventId).toBe('sess-test-001:utilisation:0');
    });

    it('indexes rows correctly within each category', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
          {
            timestamp: '2025-01-15T10:00:20Z',
            percentage: 60,
            used: 4096,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows[0]?.EventId).toBe('sess-test-001:utilisation:0');
      expect(rows[1]?.EventId).toBe('sess-test-001:utilisation:1');
    });

    it('same session produces same EventIds (deterministic)', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows1 = buildEnrichmentRows(session, options);
      const rows2 = buildEnrichmentRows(session, options);

      expect(rows1.map((r) => r.EventId)).toEqual(rows2.map((r) => r.EventId));
    });
  });

  describe('required fields', () => {
    it('all rows have required fields', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      for (const row of rows) {
        expect(row.TimeGenerated).toBeDefined();
        expect(typeof row.TimeGenerated).toBe('string');
        expect(row.EventId).toBeDefined();
        expect(typeof row.EventId).toBe('string');
        expect(row.SessionId).toBeDefined();
        expect(row.SessionId).toBe('sess-test-001');
        expect(row.Category).toBeDefined();
        expect(['metadata', 'utilisation', 'compaction', 'tool_result']).toContain(row.Category);
        expect(row.Payload).toBeDefined();
        expect(typeof row.Payload).toBe('object');
        expect(row.SchemaVersion).toBe(1);
        expect(row.SourceUser).toBeDefined();
        expect(typeof row.SourceUser).toBe('string');
        expect(row.SourceMachine).toBeDefined();
        expect(typeof row.SourceMachine).toBe('string');
        expect(row.PushedAt).toBeDefined();
        expect(typeof row.PushedAt).toBe('string');
      }
    });
  });

  describe('edge cases', () => {
    it('handles session with all empty arrays', () => {
      const session = makeSession({
        utilisation: [],
        compactions: [],
        toolCalls: [],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: true,
          toolResults: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(1); // Only metadata
      expect(rows[0]?.Category).toBe('metadata');
    });

    it('handles session with null startTs for metadata', () => {
      const session = makeSession({
        startTs: null,
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: false,
          compactions: false,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      // Should fall back to current time (PushedAt)
      expect(rows[0]?.TimeGenerated).toBeDefined();
      expect(typeof rows[0]?.TimeGenerated).toBe('string');
    });

    it('handles session with null startTs for compactions', () => {
      const session = makeSession({
        startTs: null,
        compactions: [
          {
            timestamp: null,
            inputTokens: 100,
            outputTokens: 50,
            cacheRead: 0,
            cacheWrite: 0,
            model: 'claude-sonnet-4-20250514',
            turnId: 'turn-1',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: true,
          toolResults: false,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      // Should fall back to current time
      expect(rows[0]?.TimeGenerated).toBeDefined();
    });

    it('handles tool result with null startTs', () => {
      const session = makeSession({
        startTs: null,
        toolCalls: [
          {
            toolCallId: 'tc-001',
            toolName: 'bash',
            model: 'claude-sonnet-4-20250514',
            startTs: null,
            endTs: null,
            durationMs: null,
            success: false,
            parentId: null,
            turnId: 'turn-1',
            eventId: 'evt-001',
            argumentsPreview: 'cmd',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      // Should fall back to current time
      expect(rows[0]?.TimeGenerated).toBeDefined();
    });
  });

  describe('combined categories', () => {
    it('returns rows in correct order when multiple categories enabled', () => {
      const session = makeSession({
        utilisation: [
          {
            timestamp: '2025-01-15T10:00:10Z',
            percentage: 45,
            used: 2048,
            total: 8192,
            buckets: {},
          },
        ],
        compactions: [
          {
            timestamp: '2025-01-15T10:00:15Z',
            inputTokens: 100,
            outputTokens: 50,
            cacheRead: 0,
            cacheWrite: 0,
            model: 'claude-sonnet-4-20250514',
            turnId: 'turn-1',
          },
        ],
        toolCalls: [
          {
            toolCallId: 'tc-001',
            toolName: 'bash',
            model: 'claude-sonnet-4-20250514',
            startTs: '2025-01-15T10:00:05Z',
            endTs: '2025-01-15T10:00:06Z',
            durationMs: 1000,
            success: true,
            parentId: null,
            turnId: 'turn-1',
            eventId: 'evt-001',
            argumentsPreview: 'ls',
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: true,
          toolResults: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(4);
      expect(rows[0]?.Category).toBe('metadata');
      expect(rows[1]?.Category).toBe('utilisation');
      expect(rows[2]?.Category).toBe('compaction');
      expect(rows[3]?.Category).toBe('tool_result');
    });
  });
});
