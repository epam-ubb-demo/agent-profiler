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
    expect(['known', 'estimated', 'unknown']).toContain(result?.costConfidence);
  });

  it('returns null for failed sessions', () => {
    const session = makeSession({
      parseStatus: { status: 'failed', error: 'parse error' },
    });

    const result = extractSessionListMetrics(session);

    expect(result).toBeNull();
  });
});
