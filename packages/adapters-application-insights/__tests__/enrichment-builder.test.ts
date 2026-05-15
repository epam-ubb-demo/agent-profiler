/**
 * Unit tests for EnrichmentBuilder.
 *
 * Tests the transformation of Session objects into EnrichmentRow arrays,
 * covering all categories, edge cases, and deterministic event ID generation.
 */

import type { Session, ToolCall } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

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

    describe('skill field forwarding', () => {
      it('includes skill fields in payload when present on toolCall', () => {
        const toolCallWithSkills = {
          toolCallId: 'tc-skill-001',
          toolName: 'skill',
          model: 'claude-sonnet-4-20250514',
          startTs: '2025-01-15T10:00:05Z',
          endTs: '2025-01-15T10:00:06Z',
          durationMs: 1000,
          success: true,
          parentId: null,
          turnId: 'turn-1',
          eventId: 'evt-skill-001',
          argumentsPreview: 'invoke skill',
          skillName: 'oss.pick-up-issue',
          skillSource: 'personal-copilot',
          skillContentLength: 1578,
          skillOutcome: 'loaded',
          skillErrorMessage: null,
        };

        const session = makeSession({
          toolCalls: [toolCallWithSkills as unknown as ToolCall],
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
        expect(payload?.skillName).toBe('oss.pick-up-issue');
        expect(payload?.skillSource).toBe('personal-copilot');
        expect(payload?.skillContentLength).toBe(1578);
        expect(payload?.skillOutcome).toBe('loaded');
        expect(Object.prototype.hasOwnProperty.call(payload, 'skillErrorMessage')).toBe(false);
      });

      it('omits skill fields from payload when absent on toolCall', () => {
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
        expect(Object.prototype.hasOwnProperty.call(payload, 'skillName')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(payload, 'skillSource')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(payload, 'skillContentLength')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(payload, 'skillOutcome')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(payload, 'skillErrorMessage')).toBe(false);
      });
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

  describe('turn rows', () => {
    it('returns correct number of turn rows (one per turn)', () => {
      const session = makeSession({
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [],
          },
          {
            turnId: 'turn-2',
            startTs: '2025-01-15T10:00:10Z',
            endTs: '2025-01-15T10:00:20Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [],
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.Category === 'turn')).toBe(true);
    });

    it('handles empty turns array correctly', () => {
      const session = makeSession({
        turns: [],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });

    it('includes all turn fields in payload', () => {
      const session = makeSession({
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: {
              interactionId: null,
              timestamp: '2025-01-15T10:00:00Z',
              turnId: 'turn-1',
              content: 'What is your name?',
            },
            assistantMessages: [],
            toolCalls: [
              {
                toolCallId: 'tc-001',
                toolName: 'bash',
                model: 'claude-sonnet-4-20250514',
                startTs: '2025-01-15T10:00:02Z',
                endTs: '2025-01-15T10:00:03Z',
                durationMs: 1000,
                success: true,
                parentId: null,
                turnId: 'turn-1',
                eventId: 'evt-001',
                argumentsPreview: 'ls -la',
              },
            ],
            subagents: [],
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.turnId).toBe('turn-1');
      expect(payload?.startTs).toBe('2025-01-15T10:00:00Z');
      expect(payload?.endTs).toBe('2025-01-15T10:00:10Z');
      expect(payload?.userMessage).toEqual({
        interactionId: null,
        timestamp: '2025-01-15T10:00:00Z',
        turnId: 'turn-1',
        content: 'What is your name?',
      });
      expect(payload?.toolCallIds).toEqual(['tc-001']);
      expect(payload?.subagentCount).toBe(0);
    });

    it('includes toolCallIds correctly when turn has multiple tool calls', () => {
      const session = makeSession({
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [
              {
                toolCallId: 'tc-001',
                toolName: 'bash',
                model: 'claude-sonnet-4-20250514',
                startTs: '2025-01-15T10:00:02Z',
                endTs: '2025-01-15T10:00:03Z',
                durationMs: 1000,
                success: true,
                parentId: null,
                turnId: 'turn-1',
                eventId: 'evt-001',
                argumentsPreview: 'ls',
              },
              {
                toolCallId: 'tc-002',
                toolName: 'bash',
                model: 'claude-sonnet-4-20250514',
                startTs: '2025-01-15T10:00:04Z',
                endTs: '2025-01-15T10:00:05Z',
                durationMs: 1000,
                success: true,
                parentId: null,
                turnId: 'turn-1',
                eventId: 'evt-002',
                argumentsPreview: 'pwd',
              },
            ],
            subagents: [],
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.toolCallIds).toEqual(['tc-001', 'tc-002']);
    });

    it('includes subagentCount correctly', () => {
      const session = makeSession({
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [
              {
                agentName: 'agent-1',
                agentType: 'agentic-task',
                status: 'succeeded',
                resultSummary: 'completed',
                errorMessage: null,
                parentId: null,
              },
              {
                agentName: 'agent-2',
                agentType: 'agentic-task',
                status: 'succeeded',
                resultSummary: 'completed',
                errorMessage: null,
                parentId: null,
              },
            ],
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.subagentCount).toBe(2);
    });

    it('uses turn startTs as TimeGenerated', () => {
      const session = makeSession({
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [],
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows[0]?.TimeGenerated).toBe('2025-01-15T10:00:00Z');
    });

    it('categories.turns disabled by default (undefined)', () => {
      const session = makeSession({
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [],
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          // turns not specified
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });
  });

  describe('assistant message rows', () => {
    it('returns correct number of assistant message rows (one per message)', () => {
      const session = makeSession({
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:01Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Response 1',
            reasoningText: '',
          },
          {
            interactionId: null,
            requestId: null,
            outputTokens: 75,
            inputTokens: 150,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:02Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Response 2',
            reasoningText: '',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.Category === 'assistant_message')).toBe(true);
    });

    it('handles empty assistantMessages array correctly', () => {
      const session = makeSession({
        assistantMessages: [],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });

    it('includes all assistant message fields in payload', () => {
      const session = makeSession({
        assistantMessages: [
          {
            interactionId: 'interaction-1',
            requestId: 'req-001',
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 10,
            cacheWriteTokens: 5,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:01Z',
            turnId: 'turn-1',
            eventId: 'evt-001',
            parentId: 'parent-001',
            content: 'This is the assistant response',
            reasoningText: 'Internal reasoning here',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.interactionId).toBe('interaction-1');
      expect(payload?.requestId).toBe('req-001');
      expect(payload?.outputTokens).toBe(50);
      expect(payload?.inputTokens).toBe(100);
      expect(payload?.cacheReadTokens).toBe(10);
      expect(payload?.cacheWriteTokens).toBe(5);
      expect(payload?.model).toBe('claude-sonnet-4-20250514');
      expect(payload?.timestamp).toBe('2025-01-15T10:00:01Z');
      expect(payload?.turnId).toBe('turn-1');
      expect(payload?.eventId).toBe('evt-001');
      expect(payload?.parentId).toBe('parent-001');
      expect(payload?.content).toBe('This is the assistant response');
      expect(payload?.reasoningText).toBe('Internal reasoning here');
    });

    it('uses message timestamp as TimeGenerated', () => {
      const session = makeSession({
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:05Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Response',
            reasoningText: '',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows[0]?.TimeGenerated).toBe('2025-01-15T10:00:05Z');
    });

    it('categories.assistantMessages disabled by default (undefined)', () => {
      const session = makeSession({
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:01Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Response',
            reasoningText: '',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          // assistantMessages not specified
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(0);
    });

    it('handles null and optional fields in assistant messages', () => {
      const session = makeSession({
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: null,
            timestamp: null,
            turnId: null,
            eventId: null,
            parentId: null,
            content: '',
            reasoningText: '',
          },
        ],
      });
      const options = {
        categories: {
          metadata: false,
          utilisation: false,
          compactions: false,
          toolResults: false,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      const payload = rows[0]?.Payload;
      expect(payload?.interactionId).toBeNull();
      expect(payload?.requestId).toBeNull();
      expect(payload?.model).toBeNull();
      expect(payload?.timestamp).toBeNull();
      expect(payload?.turnId).toBeNull();
      expect(payload?.eventId).toBeNull();
      expect(payload?.parentId).toBeNull();
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
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [],
          },
        ],
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:01Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Response',
            reasoningText: '',
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: true,
          compactions: true,
          toolResults: true,
          turns: true,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(6);
      expect(rows[0]?.Category).toBe('metadata');
      expect(rows[1]?.Category).toBe('utilisation');
      expect(rows[2]?.Category).toBe('compaction');
      expect(rows[3]?.Category).toBe('tool_result');
      expect(rows[4]?.Category).toBe('turn');
      expect(rows[5]?.Category).toBe('assistant_message');
    });

    it('correctly includes turn and assistant_message rows alongside existing categories', () => {
      const session = makeSession({
        metadata: true,
        turns: [
          {
            turnId: 'turn-1',
            startTs: '2025-01-15T10:00:00Z',
            endTs: '2025-01-15T10:00:10Z',
            userMessage: null,
            assistantMessages: [],
            toolCalls: [],
            subagents: [],
          },
        ],
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 50,
            inputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:01Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Response',
            reasoningText: '',
          },
        ],
      });
      const options = {
        categories: {
          metadata: true,
          utilisation: false,
          compactions: false,
          toolResults: false,
          turns: true,
          assistantMessages: true,
        },
      };

      const rows = buildEnrichmentRows(session, options);

      expect(rows).toHaveLength(3);
      expect(rows.filter((r) => r.Category === 'metadata')).toHaveLength(1);
      expect(rows.filter((r) => r.Category === 'turn')).toHaveLength(1);
      expect(rows.filter((r) => r.Category === 'assistant_message')).toHaveLength(1);
    });
  });
});
