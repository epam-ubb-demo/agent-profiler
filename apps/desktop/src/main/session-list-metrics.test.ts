import type { ModelMetrics, Session, ShutdownMetrics } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { extractSessionListMetrics } from './session-list-metrics';

function makeModelMetrics(overrides: Partial<ModelMetrics> = {}): ModelMetrics {
  return {
    model: 'claude-sonnet-4-20250514',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 50,
    reasoningTokens: 0,
    requestCount: 1,
    premiumRequestCost: 0,
    apiDurationMs: 1000,
    ...overrides,
  };
}

function makeShutdown(overrides: Partial<ShutdownMetrics> = {}): ShutdownMetrics {
  return {
    totalPremiumRequests: 1,
    totalApiDurationMs: 1000,
    modelMetrics: [makeModelMetrics()],
    currentTokens: 0,
    systemTokens: 0,
    conversationTokens: 0,
    toolDefinitionsTokens: 0,
    codeChanges: { filesCreated: 0, filesChanged: 0, filesDeleted: 0, insertions: 0, deletions: 0 },
    timestamp: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'session-1',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'epam/agent-profiler',
    branch: 'main',
    cwd: '/tmp',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:10:00Z',
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
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  } as Session;
}

describe('extractSessionListMetrics', () => {
  it('uses shutdown metrics when present', () => {
    const session = makeSession({
      shutdown: makeShutdown({
        modelMetrics: [
          makeModelMetrics({ inputTokens: 2000, outputTokens: 800, cacheReadTokens: 300, cacheWriteTokens: 150 }),
        ],
      }),
    });

    const result = extractSessionListMetrics(session);

    expect(result).not.toBeNull();
    expect(result?.totalInputTokens).toBe(2000);
    expect(result?.totalOutputTokens).toBe(800);
    expect(result?.totalCacheReadTokens).toBe(300);
    expect(result?.totalCacheWriteTokens).toBe(150);
    expect(result?.totalCostUsd).toBeTypeOf('number');
    if ((result?.totalCostUsd ?? 0) > 0) {
      expect(result?.avgTokensPerCost).toBeTypeOf('number');
    } else {
      expect(result?.avgTokensPerCost).toBeNull();
    }
    expect(result?.modelUsage).toEqual([
      {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 2000,
        outputTokens: 800,
        cacheReadTokens: 300,
        cacheWriteTokens: 150,
      },
    ]);
  });

  it('falls back to model-attributed assistant messages and skips null-model messages', () => {
    const session = makeSession({
      shutdown: null,
      assistantMessages: [
        {
          interactionId: null,
          requestId: null,
          outputTokens: 100,
          inputTokens: 500,
          cacheReadTokens: 50,
          cacheWriteTokens: 10,
          model: 'claude-sonnet-4-20250514',
          timestamp: '2025-01-15T10:01:00Z',
          turnId: null,
          eventId: null,
          parentId: null,
          content: '',
          reasoningText: '',
        },
        {
          interactionId: null,
          requestId: null,
          outputTokens: 999,
          inputTokens: 999,
          cacheReadTokens: 999,
          cacheWriteTokens: 999,
          model: null,
          timestamp: '2025-01-15T10:02:00Z',
          turnId: null,
          eventId: null,
          parentId: null,
          content: '',
          reasoningText: '',
        },
      ],
    });

    const result = extractSessionListMetrics(session);

    expect(result).not.toBeNull();
    expect(result?.totalInputTokens).toBe(500);
    expect(result?.totalOutputTokens).toBe(100);
    expect(result?.totalCacheReadTokens).toBe(50);
    expect(result?.totalCacheWriteTokens).toBe(10);
    expect(result?.totalCostUsd).toBeTypeOf('number');
    if ((result?.totalCostUsd ?? 0) > 0) {
      expect(result?.avgTokensPerCost).toBeTypeOf('number');
    } else {
      expect(result?.avgTokensPerCost).toBeNull();
    }
    expect(['known', 'estimated', 'unknown']).toContain(result?.costConfidence);
    expect(result?.modelUsage).toEqual([
      {
        model: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 100,
        cacheReadTokens: 50,
        cacheWriteTokens: 10,
      },
    ]);
  });

  it('returns null for failed sessions', () => {
    const session = makeSession({
      parseStatus: { status: 'failed', error: 'parse error' },
    });

    const result = extractSessionListMetrics(session);

    expect(result).toBeNull();
  });

  it('returns all models when shutdown contains multiple model entries', () => {
    const session = makeSession({
      shutdown: makeShutdown({
        modelMetrics: [
          makeModelMetrics({ model: 'claude-sonnet-4-20250514', inputTokens: 1000, outputTokens: 400, cacheReadTokens: 100, cacheWriteTokens: 20 }),
          makeModelMetrics({ model: 'claude-haiku-4-5', inputTokens: 500, outputTokens: 200, cacheReadTokens: 50, cacheWriteTokens: 10 }),
        ],
      }),
    });

    const result = extractSessionListMetrics(session);

    expect(result).not.toBeNull();
    expect(result?.totalInputTokens).toBe(1500);
    expect(result?.totalOutputTokens).toBe(600);
    expect(result?.modelUsage).toHaveLength(2);
    expect(result?.modelUsage).toEqual(
      expect.arrayContaining([
        { model: 'claude-sonnet-4-20250514', inputTokens: 1000, outputTokens: 400, cacheReadTokens: 100, cacheWriteTokens: 20 },
        { model: 'claude-haiku-4-5', inputTokens: 500, outputTokens: 200, cacheReadTokens: 50, cacheWriteTokens: 10 },
      ]),
    );
  });

  it('aggregates modelUsage from assistant messages when shutdown is null', () => {
    const session = makeSession({
      shutdown: null,
      assistantMessages: [
        {
          interactionId: null,
          requestId: null,
          outputTokens: 100,
          inputTokens: 300,
          cacheReadTokens: 30,
          cacheWriteTokens: 5,
          model: 'claude-sonnet-4-20250514',
          timestamp: '2025-01-15T10:01:00Z',
          turnId: null,
          eventId: null,
          parentId: null,
          content: '',
          reasoningText: '',
        },
        {
          interactionId: null,
          requestId: null,
          outputTokens: 200,
          inputTokens: 400,
          cacheReadTokens: 40,
          cacheWriteTokens: 8,
          model: 'claude-sonnet-4-20250514',
          timestamp: '2025-01-15T10:02:00Z',
          turnId: null,
          eventId: null,
          parentId: null,
          content: '',
          reasoningText: '',
        },
        {
          interactionId: null,
          requestId: null,
          outputTokens: 50,
          inputTokens: 150,
          cacheReadTokens: 10,
          cacheWriteTokens: 2,
          model: 'claude-haiku-4-5',
          timestamp: '2025-01-15T10:03:00Z',
          turnId: null,
          eventId: null,
          parentId: null,
          content: '',
          reasoningText: '',
        },
      ],
    });

    const result = extractSessionListMetrics(session);

    expect(result).not.toBeNull();
    expect(result?.modelUsage).toHaveLength(2);
    expect(result?.modelUsage).toEqual(
      expect.arrayContaining([
        { model: 'claude-sonnet-4-20250514', inputTokens: 700, outputTokens: 300, cacheReadTokens: 70, cacheWriteTokens: 13 },
        { model: 'claude-haiku-4-5', inputTokens: 150, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 2 },
      ]),
    );
  });

  it('returns empty modelUsage when session has no usage data', () => {
    const session = makeSession({
      shutdown: null,
      assistantMessages: [],
    });

    const result = extractSessionListMetrics(session);

    expect(result).not.toBeNull();
    expect(result?.modelUsage).toEqual([]);
    expect(result?.avgTokensPerCost).toBeNull();
  });

  it('computes avgTokensPerCost as total tokens divided by cost', () => {
    const session = makeSession({
      shutdown: makeShutdown({
        modelMetrics: [
          makeModelMetrics({
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadTokens: 200,
            cacheWriteTokens: 100,
          }),
        ],
      }),
    });

    const result = extractSessionListMetrics(session);

    expect(result).not.toBeNull();
    if ((result?.totalCostUsd ?? 0) > 0) {
      const expected = (1000 + 500 + 200 + 100) / (result?.totalCostUsd ?? 1);
      expect(result?.avgTokensPerCost).toBeCloseTo(expected, 6);
    } else {
      expect(result?.avgTokensPerCost).toBeNull();
    }
  });
});
