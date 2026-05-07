/**
 * Tests for session-detail computation utilities.
 *
 * Covers the five remaining pure-function modules:
 *   - computeSessionStats
 *   - computeModelSpend
 *   - computeContextWindow
 *   - computeToolStats
 *   - computeEventTypeStats
 */

import type { ModelMetrics, Session, ShutdownMetrics } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { computeContextWindow } from '../src/session-detail/context-window';
import { computeEventTypeStats } from '../src/session-detail/event-type-stats';
import { computeModelSpend } from '../src/session-detail/model-spend';
import { computeSessionStats } from '../src/session-detail/session-stats';
import { computeToolStats } from '../src/session-detail/tool-stats';

// ---------------------------------------------------------------------------
// Helpers to build minimal fixtures
// ---------------------------------------------------------------------------

function makeMetrics(overrides?: Partial<ModelMetrics>): ModelMetrics {
  return {
    model: 'claude-sonnet-4-20250514',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
    requestCount: 5,
    apiDurationMs: 3000,
    ...overrides,
  };
}

function makeShutdown(overrides?: Partial<ShutdownMetrics>): ShutdownMetrics {
  return {
    totalPremiumRequests: 10,
    totalApiDurationMs: 30000,
    modelMetrics: [makeMetrics()],
    currentTokens: 5000,
    systemTokens: 1000,
    conversationTokens: 3000,
    toolDefinitionsTokens: 1000,
    codeChanges: { filesCreated: 0, filesChanged: 0, filesDeleted: 0, insertions: 0, deletions: 0 },
    timestamp: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

function makeSession(overrides?: Partial<Session>): Session {
  return {
    sessionId: 'test-session-001',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp/test',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:15:00Z',
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: makeShutdown(),
    success: true,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'ok' as const, error: null },
    utilisation: [],
    ...overrides,
  } as Session;
}

/** Build a minimal ToolCall fixture. */
function makeToolCall(name: string, model: string | null = 'claude-sonnet-4-20250514') {
  return {
    toolCallId: `tc-${name}-${Math.random().toString(36).slice(2, 6)}`,
    toolName: name,
    model,
    startTs: '2025-01-15T10:01:00Z',
    endTs: '2025-01-15T10:01:05Z',
    durationMs: 5000,
    success: true,
    parentId: null,
    turnId: null,
    eventId: null,
    argumentsPreview: '',
  };
}

/** Build a minimal AssistantMessage fixture. */
function makeAssistantMessage(outputTokens = 100) {
  return {
    interactionId: null,
    requestId: null,
    outputTokens,
    inputTokens: 200,
    cacheReadTokens: 50,
    cacheWriteTokens: 10,
    model: 'claude-sonnet-4-20250514',
    timestamp: '2025-01-15T10:01:00Z',
    turnId: null,
    eventId: null,
    parentId: null,
    content: '',
    reasoningText: '',
  };
}

/** Build a minimal Turn fixture. */
function makeTurn(
  toolNames: string[],
  outputTokens: number,
  turnId = 'turn-1',
) {
  return {
    turnId,
    startTs: '2025-01-15T10:01:00Z',
    endTs: '2025-01-15T10:02:00Z',
    userMessage: null,
    assistantMessages: [makeAssistantMessage(outputTokens)],
    toolCalls: toolNames.map((name) => makeToolCall(name)),
    subagents: [],
  };
}

// ---------------------------------------------------------------------------
// computeSessionStats
// ---------------------------------------------------------------------------

describe('computeSessionStats', () => {
  it('returns all 11 stat entries for a basic session', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('read_file'), makeToolCall('write_file')],
      assistantMessages: [makeAssistantMessage(), makeAssistantMessage()],
      turns: [makeTurn(['read_file'], 100)],
      compactions: [
        { timestamp: null, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, model: null, turnId: null },
      ],
      subagents: [
        {
          timestamp: null, totalTokens: 1000, messageCount: 3, toolCallCount: 2,
          turnId: null, eventId: null, parentId: null, agentName: 'test', agentType: 'general', childSessionRef: null,
        },
      ],
    });

    const stats = computeSessionStats(session);

    // Verify all 11 fields exist
    const keys = [
      'duration', 'toolCallCount', 'assistantMessageCount', 'turnCount',
      'compactionCount', 'subagentCount', 'estimatedCost',
      'avgTokensPerToolCall', 'premiumRequests', 'apiTime', 'taskSuccess',
    ] as const;
    for (const key of keys) {
      expect(stats[key]).toBeDefined();
      expect(stats[key]).toHaveProperty('value');
      expect(stats[key]).toHaveProperty('display');
      expect(stats[key]).toHaveProperty('label');
    }

    // Verify count-based fields
    expect(stats.toolCallCount.value).toBe(2);
    expect(stats.assistantMessageCount.value).toBe(2);
    expect(stats.turnCount.value).toBe(1);
    expect(stats.compactionCount.value).toBe(1);
    expect(stats.subagentCount.value).toBe(1);
  });

  it('handles an empty session with zero/null values gracefully', () => {
    const session = makeSession({
      startTs: null,
      endTs: null,
      toolCalls: [],
      assistantMessages: [],
      turns: [],
      compactions: [],
      subagents: [],
      shutdown: null,
      success: null,
    });

    const stats = computeSessionStats(session);

    expect(stats.duration.value).toBeNull();
    expect(stats.duration.display).toBe('—');
    expect(stats.toolCallCount.value).toBe(0);
    expect(stats.assistantMessageCount.value).toBe(0);
    expect(stats.turnCount.value).toBe(0);
    expect(stats.compactionCount.value).toBe(0);
    expect(stats.subagentCount.value).toBe(0);
    expect(stats.estimatedCost.value).toBeNull();
    expect(stats.estimatedCost.display).toBe('—');
    expect(stats.avgTokensPerToolCall.value).toBeNull();
    expect(stats.avgTokensPerToolCall.display).toBe('—');
    expect(stats.premiumRequests.value).toBeNull();
    expect(stats.premiumRequests.display).toBe('—');
    expect(stats.apiTime.value).toBeNull();
    expect(stats.apiTime.display).toBe('—');
    expect(stats.taskSuccess.value).toBeNull();
    expect(stats.taskSuccess.display).toBe('—');
  });

  it('derives cost, premium requests, and API time from shutdown metrics', () => {
    const session = makeSession({
      shutdown: makeShutdown({
        totalPremiumRequests: 42,
        totalApiDurationMs: 12345,
      }),
    });

    const stats = computeSessionStats(session);

    expect(stats.premiumRequests.value).toBe(42);
    expect(stats.premiumRequests.display).toBe('42');
    expect(stats.apiTime.value).toBe(12345);
    // Cost should be a non-null number (exact value depends on pricing table)
    expect(stats.estimatedCost.value).toBeTypeOf('number');
  });

  it('falls back gracefully when shutdown is null', () => {
    const session = makeSession({ shutdown: null });

    const stats = computeSessionStats(session);

    expect(stats.estimatedCost.value).toBeNull();
    expect(stats.premiumRequests.value).toBeNull();
    expect(stats.apiTime.value).toBeNull();
    expect(stats.avgTokensPerToolCall.value).toBeNull();
  });

  it('formats task success: true → "✓", false → "✗", null → "—"', () => {
    const trueStats = computeSessionStats(makeSession({ success: true }));
    expect(trueStats.taskSuccess.display).toBe('✓');
    expect(trueStats.taskSuccess.value).toBe(1);

    const falseStats = computeSessionStats(makeSession({ success: false }));
    expect(falseStats.taskSuccess.display).toBe('✗');
    expect(falseStats.taskSuccess.value).toBe(0);

    const nullStats = computeSessionStats(makeSession({ success: null }));
    expect(nullStats.taskSuccess.display).toBe('—');
    expect(nullStats.taskSuccess.value).toBeNull();
  });

  it('computes duration from start/end timestamps', () => {
    const session = makeSession({
      startTs: '2025-01-15T10:00:00Z',
      endTs: '2025-01-15T10:15:00Z',
    });

    const stats = computeSessionStats(session);

    // 15 minutes = 900,000 ms
    expect(stats.duration.value).toBe(900_000);
    expect(stats.duration.display).toBe('15m');
  });

  it('computes avg tokens per tool call correctly', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('a'), makeToolCall('b')],
      shutdown: makeShutdown({
        modelMetrics: [makeMetrics({ outputTokens: 1000 })],
      }),
    });

    const stats = computeSessionStats(session);

    // 1000 output tokens / 2 tool calls = 500
    expect(stats.avgTokensPerToolCall.value).toBe(500);
  });

  it('returns 0 avg tokens per tool call when there are no tool calls but shutdown exists', () => {
    const session = makeSession({
      toolCalls: [],
      shutdown: makeShutdown({
        modelMetrics: [makeMetrics({ outputTokens: 1000 })],
      }),
    });

    const stats = computeSessionStats(session);

    expect(stats.avgTokensPerToolCall.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeModelSpend
// ---------------------------------------------------------------------------

describe('computeModelSpend', () => {
  it('returns null for null shutdown', () => {
    expect(computeModelSpend(null)).toBeNull();
  });

  it('returns a single row with correct token counts for one model', () => {
    const shutdown = makeShutdown({
      modelMetrics: [makeMetrics({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 2000,
        outputTokens: 800,
        cacheReadTokens: 300,
        cacheWriteTokens: 150,
        requestCount: 7,
      })],
    });

    const result = computeModelSpend(shutdown)!;

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.model).toBe('claude-sonnet-4-20250514');
    expect(row.inputTokens).toBe(2000);
    expect(row.outputTokens).toBe(800);
    expect(row.cacheReadTokens).toBe(300);
    expect(row.cacheWriteTokens).toBe(150);
    expect(row.requestCount).toBe(7);
    expect(row.estimatedUsd).toBe(row.premiumCostUsd);
  });

  it('sorts multiple models by USD descending', () => {
    const shutdown = makeShutdown({
      modelMetrics: [
        makeMetrics({ model: 'cheap-model', inputTokens: 10, outputTokens: 5 }),
        makeMetrics({ model: 'expensive-model', inputTokens: 100000, outputTokens: 50000 }),
      ],
    });

    const result = computeModelSpend(shutdown)!;

    expect(result.rows).toHaveLength(2);
    // The model with more tokens should appear first (higher USD)
    expect(result.rows[0]!.estimatedUsd).toBeGreaterThanOrEqual(result.rows[1]!.estimatedUsd);
  });

  it('aggregates totals correctly across multiple models', () => {
    const shutdown = makeShutdown({
      modelMetrics: [
        makeMetrics({ model: 'model-a', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 100, cacheWriteTokens: 50, requestCount: 3 }),
        makeMetrics({ model: 'model-b', inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 200, cacheWriteTokens: 100, requestCount: 5 }),
      ],
    });

    const result = computeModelSpend(shutdown)!;

    expect(result.totals.inputTokens).toBe(3000);
    expect(result.totals.outputTokens).toBe(1500);
    expect(result.totals.cacheReadTokens).toBe(300);
    expect(result.totals.cacheWriteTokens).toBe(150);
    expect(result.totals.requestCount).toBe(8);
    expect(result.totals.estimatedUsd).toBe(result.totals.premiumCostUsd);
  });

  it('includes confidence from the pricing calculator', () => {
    const result = computeModelSpend(makeShutdown())!;

    expect(result.confidence).toBeDefined();
    expect(['known', 'estimated', 'unknown']).toContain(result.confidence);
  });
});

// ---------------------------------------------------------------------------
// computeContextWindow
// ---------------------------------------------------------------------------

describe('computeContextWindow', () => {
  it('returns null for null shutdown', () => {
    expect(computeContextWindow(null)).toBeNull();
  });

  it('returns segments with correct proportions summing to ~1', () => {
    const shutdown = makeShutdown({
      systemTokens: 1000,
      conversationTokens: 3000,
      toolDefinitionsTokens: 1000,
      currentTokens: 5000,
    });

    const result = computeContextWindow(shutdown)!;

    expect(result.currentTokens).toBe(5000);
    expect(result.segments).toHaveLength(3);

    const proportionSum = result.segments.reduce((sum, s) => sum + s.proportion, 0);
    expect(proportionSum).toBeCloseTo(1, 10);

    // Verify individual proportions: 1000/5000, 3000/5000, 1000/5000
    const system = result.segments.find((s) => s.label === 'System prompt')!;
    expect(system.proportion).toBeCloseTo(0.2, 10);
    expect(system.tokens).toBe(1000);

    const convo = result.segments.find((s) => s.label === 'Conversation')!;
    expect(convo.proportion).toBeCloseTo(0.6, 10);
    expect(convo.tokens).toBe(3000);

    const tools = result.segments.find((s) => s.label === 'Tool definitions')!;
    expect(tools.proportion).toBeCloseTo(0.2, 10);
    expect(tools.tokens).toBe(1000);
  });

  it('returns empty segments when all token counts are zero', () => {
    const shutdown = makeShutdown({
      systemTokens: 0,
      conversationTokens: 0,
      toolDefinitionsTokens: 0,
      currentTokens: 0,
    });

    const result = computeContextWindow(shutdown)!;

    expect(result).not.toBeNull();
    expect(result.segments).toHaveLength(0);
  });

  it('uses the expected segment labels', () => {
    const result = computeContextWindow(makeShutdown())!;

    const labels = result.segments.map((s) => s.label);
    expect(labels).toContain('System prompt');
    expect(labels).toContain('Conversation');
    expect(labels).toContain('Tool definitions');
  });

  it('excludes segments with zero tokens', () => {
    const shutdown = makeShutdown({
      systemTokens: 500,
      conversationTokens: 0,
      toolDefinitionsTokens: 500,
    });

    const result = computeContextWindow(shutdown)!;

    expect(result.segments).toHaveLength(2);
    const labels = result.segments.map((s) => s.label);
    expect(labels).not.toContain('Conversation');
  });
});

// ---------------------------------------------------------------------------
// computeToolStats
// ---------------------------------------------------------------------------

describe('computeToolStats', () => {
  it('groups tools correctly and sorts by tokens descending', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('read_file'), makeToolCall('read_file'), makeToolCall('write_file')],
      turns: [
        makeTurn(['read_file', 'read_file'], 600, 'turn-1'),
        makeTurn(['write_file'], 100, 'turn-2'),
      ],
    });

    const result = computeToolStats(session);

    expect(result.tokenStats.length).toBeGreaterThanOrEqual(2);

    // read_file: 2 calls, 600 tokens distributed evenly → 300 each → 600 total
    // write_file: 1 call, 100 tokens
    const readRow = result.tokenStats.find((r) => r.tool === 'read_file')!;
    expect(readRow.callCount).toBe(2);
    expect(readRow.totalTokens).toBe(600);

    const writeRow = result.tokenStats.find((r) => r.tool === 'write_file')!;
    expect(writeRow.callCount).toBe(1);
    expect(writeRow.totalTokens).toBe(100);

    // Sorted desc by tokens — read_file should be first
    expect(result.tokenStats[0]!.tool).toBe('read_file');
  });

  it('returns empty arrays for a session with no tool calls', () => {
    const session = makeSession({
      toolCalls: [],
      turns: [],
    });

    const result = computeToolStats(session);

    expect(result.tokenStats).toHaveLength(0);
    expect(result.frequencyStats).toHaveLength(0);
    expect(result.tokenTotals.callCount).toBe(0);
    expect(result.tokenTotals.totalTokens).toBe(0);
  });

  it('limits frequency stats to top 15', () => {
    // Create 20 distinct tools in toolCalls
    const toolNames = Array.from({ length: 20 }, (_, i) => `tool_${String(i).padStart(2, '0')}`);
    const toolCalls = toolNames.map((name) => makeToolCall(name));

    const session = makeSession({
      toolCalls,
      turns: [],
    });

    const result = computeToolStats(session);

    expect(result.frequencyStats.length).toBeLessThanOrEqual(15);
  });

  it('sorts frequency stats by count descending', () => {
    const toolCalls = [
      makeToolCall('rare_tool'),
      makeToolCall('common_tool'), makeToolCall('common_tool'), makeToolCall('common_tool'),
      makeToolCall('mid_tool'), makeToolCall('mid_tool'),
    ];

    const session = makeSession({ toolCalls, turns: [] });

    const result = computeToolStats(session);

    expect(result.frequencyStats[0]!.tool).toBe('common_tool');
    expect(result.frequencyStats[0]!.callCount).toBe(3);
    expect(result.frequencyStats[1]!.tool).toBe('mid_tool');
    expect(result.frequencyStats[1]!.callCount).toBe(2);
    expect(result.frequencyStats[2]!.tool).toBe('rare_tool');
    expect(result.frequencyStats[2]!.callCount).toBe(1);
  });

  it('distributes output tokens evenly across tools in the same turn', () => {
    // Single turn with 3 tools and 300 output tokens → 100 each
    const session = makeSession({
      toolCalls: [makeToolCall('a'), makeToolCall('b'), makeToolCall('c')],
      turns: [makeTurn(['a', 'b', 'c'], 300, 'turn-1')],
    });

    const result = computeToolStats(session);

    for (const row of result.tokenStats) {
      expect(row.totalTokens).toBe(100);
      expect(row.avgTokensPerCall).toBe(100);
    }
  });

  it('computes proportion relative to the highest-consuming tool', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('big'), makeToolCall('small')],
      turns: [
        makeTurn(['big'], 1000, 'turn-1'),
        makeTurn(['small'], 250, 'turn-2'),
      ],
    });

    const result = computeToolStats(session);
    const big = result.tokenStats.find((r) => r.tool === 'big')!;
    const small = result.tokenStats.find((r) => r.tool === 'small')!;

    expect(big.proportion).toBe(1);
    expect(small.proportion).toBeCloseTo(0.25, 10);
  });

  it('sets totalUsd and avgUsdPerCall to null (placeholder)', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('x')],
      turns: [makeTurn(['x'], 100)],
    });

    const result = computeToolStats(session);

    expect(result.tokenStats[0]!.totalUsd).toBeNull();
    expect(result.tokenStats[0]!.avgUsdPerCall).toBeNull();
    expect(result.tokenTotals.totalUsd).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeEventTypeStats
// ---------------------------------------------------------------------------

describe('computeEventTypeStats', () => {
  it('counts mixed event types and sorts descending by count', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('a'), makeToolCall('b'), makeToolCall('c')],
      assistantMessages: [makeAssistantMessage(), makeAssistantMessage()],
      userMessages: [
        { interactionId: null, timestamp: null, turnId: null, content: 'hello' },
      ],
      compactions: [
        { timestamp: null, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, model: null, turnId: null },
      ],
      subagents: [
        {
          timestamp: null, totalTokens: 0, messageCount: 0, toolCallCount: 0,
          turnId: null, eventId: null, parentId: null, agentName: 'a', agentType: 'g', childSessionRef: null,
        },
      ],
    });

    const result = computeEventTypeStats(session);

    // 3 tool calls, 2 assistant messages, 1 user message, 1 compaction, 1 subagent = 5 types
    expect(result.length).toBe(5);

    // Should be sorted descending by count
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.count).toBeGreaterThanOrEqual(result[i]!.count);
    }

    // The first entry should be tool calls with count 3
    expect(result[0]!.type).toBe('Tool calls');
    expect(result[0]!.count).toBe(3);
  });

  it('excludes types with zero count', () => {
    const session = makeSession({
      toolCalls: [makeToolCall('a')],
      assistantMessages: [],
      userMessages: [],
      compactions: [],
      subagents: [],
      modelChanges: [],
    });

    const result = computeEventTypeStats(session);

    // Only tool calls has a non-zero count
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('Tool calls');
    expect(result[0]!.count).toBe(1);
  });

  it('returns an empty array when the session has no events at all', () => {
    const session = makeSession({
      toolCalls: [],
      assistantMessages: [],
      userMessages: [],
      compactions: [],
      subagents: [],
      modelChanges: [],
    });

    const result = computeEventTypeStats(session);

    expect(result).toHaveLength(0);
  });

  it('includes model changes in the count', () => {
    const session = makeSession({
      toolCalls: [],
      assistantMessages: [],
      userMessages: [],
      compactions: [],
      subagents: [],
      modelChanges: [
        { timestamp: '2025-01-15T10:05:00Z', model: 'gpt-4o' },
        { timestamp: '2025-01-15T10:10:00Z', model: 'claude-sonnet-4' },
      ],
    });

    const result = computeEventTypeStats(session);

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('Model changes');
    expect(result[0]!.count).toBe(2);
  });
});
