/**
 * Unit tests for multi-session canonical aggregation.
 */

import { describe, expect, it } from 'vitest';

import { aggregateBenchRun } from '../aggregation';
import type { AggregationEntry, CostCalculator } from '../aggregation';
import type { Session } from '../types/index';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4',
    reasoningEffort: 'high',
    repository: 'org/repo',
    branch: 'main',
    cwd: '/tmp/repo',
    startTs: '2025-01-01T00:00:00Z',
    endTs: '2025-01-01T00:05:00Z',
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
}

function makeEntry(overrides: Partial<Session> = {}, meta: Partial<AggregationEntry> = {}): AggregationEntry {
  return {
    session: makeSession(overrides),
    ...meta,
  };
}

const simpleCostCalculator: CostCalculator = (session) => {
  if (!session.shutdown) return null;
  // Trivial: $1 per 1M total tokens
  let totalTokens = 0;
  for (const mm of session.shutdown.modelMetrics) {
    totalTokens += mm.inputTokens + mm.outputTokens + mm.cacheReadTokens + mm.cacheWriteTokens;
  }
  return totalTokens / 1_000_000;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aggregateBenchRun', () => {
  it('returns zeroed result for empty array', () => {
    const result = aggregateBenchRun([]);

    expect(result.sessions).toHaveLength(0);
    expect(result.modelUsage).toHaveLength(0);
    expect(result.toolUsage).toHaveLength(0);
    expect(result.totalCost).toBeNull();
    expect(result.totalWallTimeMs).toBe(0);
    expect(result.variantCount).toBe(0);
    expect(result.sessionCount).toBe(0);
  });

  it('aggregates a single session with shutdown metrics', () => {
    const entry = makeEntry({
      sessionId: 'sess-a',
      startTs: '2025-01-01T00:00:00Z',
      endTs: '2025-01-01T00:02:30Z',
      toolCalls: [
        {
          toolCallId: 'tc-1',
          toolName: 'bash',
          model: 'claude-sonnet-4',
          startTs: '2025-01-01T00:00:10Z',
          endTs: '2025-01-01T00:00:12Z',
          durationMs: 2000,
          success: true,
          parentId: null,
          turnId: 't1',
          eventId: null,
          argumentsPreview: 'ls',
        },
      ],
      turns: [
        {
          turnId: 't1',
          startTs: '2025-01-01T00:00:00Z',
          endTs: '2025-01-01T00:00:30Z',
          userMessage: null,
          assistantMessages: [],
          toolCalls: [],
          subagents: [],
        },
      ],
      shutdown: {
        totalPremiumRequests: 5,
        totalApiDurationMs: 10000,
        modelMetrics: [
          {
            model: 'claude-sonnet-4',
            inputTokens: 10000,
            outputTokens: 5000,
            cacheReadTokens: 2000,
            cacheWriteTokens: 1000,
            requestCount: 5,
            apiDurationMs: 10000,
          },
        ],
        currentTokens: 15000,
        systemTokens: 3000,
        conversationTokens: 10000,
        toolDefinitionsTokens: 2000,
        codeChanges: {},
        timestamp: '2025-01-01T00:02:30Z',
      },
    }, { label: 'test-run' });

    const result = aggregateBenchRun([entry], { calculateCost: simpleCostCalculator });

    expect(result.sessionCount).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]!.sessionId).toBe('sess-a');
    expect(result.sessions[0]!.label).toBe('test-run');
    expect(result.sessions[0]!.wallTimeMs).toBe(150_000); // 2.5 minutes
    expect(result.sessions[0]!.turnCount).toBe(1);
    expect(result.sessions[0]!.toolCallCount).toBe(1);
    expect(result.sessions[0]!.totalInputTokens).toBe(10000);
    expect(result.sessions[0]!.totalOutputTokens).toBe(5000);

    expect(result.modelUsage).toHaveLength(1);
    expect(result.modelUsage[0]!.model).toBe('claude-sonnet-4');
    expect(result.modelUsage[0]!.totalInputTokens).toBe(10000);
    expect(result.modelUsage[0]!.sessionCount).toBe(1);

    expect(result.toolUsage).toHaveLength(1);
    expect(result.toolUsage[0]!.toolName).toBe('bash');
    expect(result.toolUsage[0]!.callCount).toBe(1);
    expect(result.toolUsage[0]!.successCount).toBe(1);
    expect(result.toolUsage[0]!.totalDurationMs).toBe(2000);
  });

  it('aggregates multiple sessions and sums correctly', () => {
    const entries: AggregationEntry[] = [
      makeEntry({
        sessionId: 'sess-1',
        startTs: '2025-01-01T00:00:00Z',
        endTs: '2025-01-01T00:01:00Z',
        shutdown: {
          totalPremiumRequests: 2,
          totalApiDurationMs: 5000,
          modelMetrics: [
            { model: 'gpt-4.1', inputTokens: 8000, outputTokens: 4000, cacheReadTokens: 1000, cacheWriteTokens: 500, requestCount: 2, apiDurationMs: 5000 },
          ],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
        toolCalls: [
          { toolCallId: 'tc-1', toolName: 'edit', model: 'gpt-4.1', startTs: null, endTs: null, durationMs: 100, success: true, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
        ],
        turns: [{ turnId: 't1', startTs: null, endTs: null, userMessage: null, assistantMessages: [], toolCalls: [], subagents: [] }],
      }, { variantId: 'v1' }),
      makeEntry({
        sessionId: 'sess-2',
        startTs: '2025-01-01T00:01:00Z',
        endTs: '2025-01-01T00:03:00Z',
        shutdown: {
          totalPremiumRequests: 3,
          totalApiDurationMs: 8000,
          modelMetrics: [
            { model: 'gpt-4.1', inputTokens: 12000, outputTokens: 6000, cacheReadTokens: 3000, cacheWriteTokens: 1500, requestCount: 3, apiDurationMs: 8000 },
          ],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
        toolCalls: [
          { toolCallId: 'tc-2', toolName: 'edit', model: 'gpt-4.1', startTs: null, endTs: null, durationMs: 200, success: true, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
          { toolCallId: 'tc-3', toolName: 'bash', model: 'gpt-4.1', startTs: null, endTs: null, durationMs: 500, success: false, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
        ],
        turns: [
          { turnId: 't1', startTs: null, endTs: null, userMessage: null, assistantMessages: [], toolCalls: [], subagents: [] },
          { turnId: 't2', startTs: null, endTs: null, userMessage: null, assistantMessages: [], toolCalls: [], subagents: [] },
        ],
      }, { variantId: 'v2' }),
    ];

    const result = aggregateBenchRun(entries, { calculateCost: simpleCostCalculator });

    expect(result.sessionCount).toBe(2);
    expect(result.variantCount).toBe(2);
    expect(result.totalWallTimeMs).toBe(60_000 + 120_000); // 1m + 2m

    // Model roll-up: only gpt-4.1
    expect(result.modelUsage).toHaveLength(1);
    const gpt = result.modelUsage[0]!;
    expect(gpt.model).toBe('gpt-4.1');
    expect(gpt.totalInputTokens).toBe(20000);
    expect(gpt.totalOutputTokens).toBe(10000);
    expect(gpt.totalCacheReadTokens).toBe(4000);
    expect(gpt.totalCacheWriteTokens).toBe(2000);
    expect(gpt.sessionCount).toBe(2);

    // Tool usage
    expect(result.toolUsage).toHaveLength(2);
    const editTool = result.toolUsage.find(t => t.toolName === 'edit')!;
    expect(editTool.callCount).toBe(2);
    expect(editTool.totalDurationMs).toBe(300);
    expect(editTool.successCount).toBe(2);

    const bashTool = result.toolUsage.find(t => t.toolName === 'bash')!;
    expect(bashTool.callCount).toBe(1);
    expect(bashTool.failureCount).toBe(1);
    expect(bashTool.successCount).toBe(0);
  });

  it('handles sessions with no shutdownMetrics gracefully', () => {
    const entry = makeEntry({
      sessionId: 'sess-no-metrics',
      shutdown: null,
      assistantMessages: [
        {
          interactionId: null, requestId: null, outputTokens: 200, inputTokens: 1000,
          cacheReadTokens: 0, cacheWriteTokens: 0, model: 'claude-sonnet-4',
          timestamp: null, turnId: null, eventId: null, parentId: null, content: '', reasoningText: '',
        },
      ],
    });

    const result = aggregateBenchRun([entry]);

    expect(result.sessionCount).toBe(1);
    expect(result.modelUsage).toHaveLength(0); // No shutdown metrics
    expect(result.sessions[0]!.totalInputTokens).toBe(1000); // fallback from assistant messages
    expect(result.sessions[0]!.totalOutputTokens).toBe(200);
  });

  it('groups model roll-up by model name correctly', () => {
    const entries: AggregationEntry[] = [
      makeEntry({
        sessionId: 'sess-1',
        shutdown: {
          totalPremiumRequests: 5, totalApiDurationMs: 10000,
          modelMetrics: [
            { model: 'claude-sonnet-4', inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 100, cacheWriteTokens: 50, requestCount: 3, apiDurationMs: 6000 },
            { model: 'gpt-4.1', inputTokens: 3000, outputTokens: 1000, cacheReadTokens: 200, cacheWriteTokens: 100, requestCount: 2, apiDurationMs: 4000 },
          ],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
      }),
      makeEntry({
        sessionId: 'sess-2',
        shutdown: {
          totalPremiumRequests: 2, totalApiDurationMs: 5000,
          modelMetrics: [
            { model: 'claude-sonnet-4', inputTokens: 7000, outputTokens: 3000, cacheReadTokens: 300, cacheWriteTokens: 150, requestCount: 2, apiDurationMs: 5000 },
          ],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
      }),
    ];

    const result = aggregateBenchRun(entries);

    expect(result.modelUsage).toHaveLength(2);

    const claude = result.modelUsage.find(m => m.model === 'claude-sonnet-4')!;
    expect(claude.totalInputTokens).toBe(12000);
    expect(claude.totalOutputTokens).toBe(5000);
    expect(claude.totalCacheReadTokens).toBe(400);
    expect(claude.totalCacheWriteTokens).toBe(200);
    expect(claude.sessionCount).toBe(2);

    const gpt = result.modelUsage.find(m => m.model === 'gpt-4.1')!;
    expect(gpt.totalInputTokens).toBe(3000);
    expect(gpt.sessionCount).toBe(1);
  });

  it('counts tool success and failure correctly', () => {
    const entry = makeEntry({
      toolCalls: [
        { toolCallId: 'tc-1', toolName: 'bash', model: 'gpt-4.1', startTs: null, endTs: null, durationMs: 100, success: true, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
        { toolCallId: 'tc-2', toolName: 'bash', model: 'gpt-4.1', startTs: null, endTs: null, durationMs: 200, success: false, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
        { toolCallId: 'tc-3', toolName: 'bash', model: 'claude-sonnet-4', startTs: null, endTs: null, durationMs: 50, success: true, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
        { toolCallId: 'tc-4', toolName: 'bash', model: null, startTs: null, endTs: null, durationMs: null, success: null, parentId: null, turnId: null, eventId: null, argumentsPreview: '' },
      ],
    });

    const result = aggregateBenchRun([entry]);

    expect(result.toolUsage).toHaveLength(1);
    const bash = result.toolUsage[0]!;
    expect(bash.callCount).toBe(4);
    expect(bash.successCount).toBe(2);
    expect(bash.failureCount).toBe(1);
    expect(bash.totalDurationMs).toBe(350); // 100+200+50+0
    expect(bash.models).toContain('gpt-4.1');
    expect(bash.models).toContain('claude-sonnet-4');
    expect(bash.models).toHaveLength(2);
  });

  it('totalCost is null when any session has unknown pricing', () => {
    const entries: AggregationEntry[] = [
      makeEntry({
        sessionId: 'sess-1',
        shutdown: {
          totalPremiumRequests: 1, totalApiDurationMs: 1000,
          modelMetrics: [{ model: 'gpt-4.1', inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0, requestCount: 1, apiDurationMs: 1000 }],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
      }),
      makeEntry({
        sessionId: 'sess-2',
        shutdown: null, // no metrics → cost = null
      }),
    ];

    // Cost calculator returns null for sessions without shutdown
    const result = aggregateBenchRun(entries, { calculateCost: simpleCostCalculator });

    expect(result.totalCost).toBeNull();
  });

  it('computes wall time correctly from startTs/endTs', () => {
    const entry = makeEntry({
      startTs: '2025-06-15T10:00:00.000Z',
      endTs: '2025-06-15T10:03:45.500Z',
    });

    const result = aggregateBenchRun([entry]);

    // 3 minutes 45.5 seconds = 225500ms
    expect(result.sessions[0]!.wallTimeMs).toBe(225_500);
    expect(result.totalWallTimeMs).toBe(225_500);
  });

  it('wall time is 0 when timestamps are missing', () => {
    const entry = makeEntry({ startTs: null, endTs: null });

    const result = aggregateBenchRun([entry]);

    expect(result.sessions[0]!.wallTimeMs).toBe(0);
    expect(result.totalWallTimeMs).toBe(0);
  });

  it('uses sessionId as label when label not provided', () => {
    const entry = makeEntry({ sessionId: 'my-session-id' });

    const result = aggregateBenchRun([entry]);

    expect(result.sessions[0]!.label).toBe('my-session-id');
  });

  it('totalCost sums correctly when all sessions have known costs', () => {
    const entries: AggregationEntry[] = [
      makeEntry({
        sessionId: 'sess-1',
        shutdown: {
          totalPremiumRequests: 1, totalApiDurationMs: 1000,
          modelMetrics: [{ model: 'gpt-4.1', inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requestCount: 1, apiDurationMs: 1000 }],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
      }),
      makeEntry({
        sessionId: 'sess-2',
        shutdown: {
          totalPremiumRequests: 1, totalApiDurationMs: 1000,
          modelMetrics: [{ model: 'gpt-4.1', inputTokens: 500_000, outputTokens: 500_000, cacheReadTokens: 0, cacheWriteTokens: 0, requestCount: 1, apiDurationMs: 1000 }],
          currentTokens: 0, systemTokens: 0, conversationTokens: 0, toolDefinitionsTokens: 0, codeChanges: {}, timestamp: null,
        },
      }),
    ];

    const result = aggregateBenchRun(entries, { calculateCost: simpleCostCalculator });

    // sess-1: 1M tokens → $1; sess-2: 1M tokens → $1 → total $2
    expect(result.totalCost).toBeCloseTo(2.0, 6);
  });
});
