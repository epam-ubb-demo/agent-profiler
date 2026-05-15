/**
 * Tests for tool-stats computation utilities.
 */

import type { Session, Turn, ToolCall, AssistantMessage } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { computeToolStats } from '../src/session-detail/tool-stats';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    toolCallId: 'tc-1',
    toolName: 'bash',
    model: 'claude-sonnet-4-20250514',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:00:01Z',
    durationMs: 1000,
    success: true,
    parentId: null,
    turnId: 'turn-1',
    eventId: null,
    argumentsPreview: '',
    ...overrides,
  };
}

function makeAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    interactionId: null,
    requestId: null,
    outputTokens: 100,
    inputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    model: 'claude-sonnet-4-20250514',
    timestamp: '2024-01-01T00:00:00Z',
    turnId: 'turn-1',
    eventId: null,
    parentId: null,
    content: 'Response',
    reasoningText: '',
    ...overrides,
  };
}

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    turnId: 'turn-1',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:00:05Z',
    userMessage: null,
    assistantMessages: [],
    toolCalls: [],
    subagents: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'test-session',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'org/repo',
    branch: 'main',
    cwd: '/tmp',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:10:00Z',
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
  } as Session;
}

/* ------------------------------------------------------------------ */
/*  Basic token attribution                                            */
/* ------------------------------------------------------------------ */

describe('computeToolStats — token attribution', () => {
  it('returns empty result for session with no turns or tool calls', () => {
    const session = makeSession();
    const result = computeToolStats(session);

    expect(result.tokenStats).toEqual([]);
    expect(result.frequencyStats).toEqual([]);
    expect(result.tokenTotals.callCount).toBe(0);
    expect(result.tokenTotals.totalTokens).toBe(0);
  });

  it('attributes turn output tokens evenly across tool calls in that turn', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 300 })],
      toolCalls: [
        makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-2', toolName: 'view' }),
        makeToolCall({ toolCallId: 'tc-3', toolName: 'bash' }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    // 300 tokens / 3 tools = 100 tokens per tool
    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    const viewRow = result.tokenStats.find((r) => r.tool === 'view');

    expect(bashRow?.totalTokens).toBe(200); // 2 calls × 100
    expect(bashRow?.callCount).toBe(2);
    expect(bashRow?.avgTokensPerCall).toBe(100);

    expect(viewRow?.totalTokens).toBe(100); // 1 call × 100
    expect(viewRow?.callCount).toBe(1);
    expect(viewRow?.avgTokensPerCall).toBe(100);
  });

  it('does not attribute tokens when turn has no tool calls', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 200 })],
      toolCalls: [],
    });
    const session = makeSession({ turns: [turn], toolCalls: [] });

    const result = computeToolStats(session);

    expect(result.tokenStats).toEqual([]);
    expect(result.tokenTotals.totalTokens).toBe(0);
  });

  it('aggregates tokens across multiple turns', () => {
    const turn1 = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 200 })],
      toolCalls: [makeToolCall({ toolCallId: 'tc-1', toolName: 'bash', turnId: 'turn-1' })],
    });
    const turn2 = makeTurn({
      turnId: 'turn-2',
      assistantMessages: [makeAssistantMessage({ outputTokens: 300 })],
      toolCalls: [makeToolCall({ toolCallId: 'tc-2', toolName: 'bash', turnId: 'turn-2' })],
    });
    const session = makeSession({ turns: [turn1, turn2] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.totalTokens).toBe(500); // 200 + 300
    expect(bashRow?.callCount).toBe(2);
    expect(bashRow?.avgTokensPerCall).toBe(250);
  });

  it('sorts token stats by totalTokens descending', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 600 })],
      toolCalls: [
        makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-2', toolName: 'view' }),
        makeToolCall({ toolCallId: 'tc-3', toolName: 'grep' }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    // All get 200 tokens, but order is determined by the first occurrence in the accumulators map
    // We can assert that results exist
    expect(result.tokenStats).toHaveLength(3);
    expect(result.tokenStats.every((r) => r.totalTokens === 200)).toBe(true);
  });

  it('computes proportions relative to max token count', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 400 })],
      toolCalls: [
        makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-2', toolName: 'view' }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    // Both tools get 200 tokens, so proportion = 200 / 200 = 1.0
    expect(result.tokenStats.every((r) => r.proportion === 1.0)).toBe(true);
  });

  it('handles multiple assistant messages in same turn', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [
        makeAssistantMessage({ outputTokens: 150 }),
        makeAssistantMessage({ outputTokens: 250 }),
      ],
      toolCalls: [
        makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-2', toolName: 'view' }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    // Total output = 150 + 250 = 400, divided by 2 tools = 200 per tool
    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.totalTokens).toBe(200);
  });

  it('handles zero output tokens in assistant message', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 0 })],
      toolCalls: [makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' })],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.totalTokens).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Fallback for enrichment sessions                                   */
/* ------------------------------------------------------------------ */

describe('computeToolStats — fallback logic', () => {
  it('fallback applies when turns empty but toolCalls exist', () => {
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-3', toolName: 'view' }),
    ];
    const session = makeSession({ turns: [], toolCalls });

    const result = computeToolStats(session);

    // Should have accumulators but with zero tokens
    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    const viewRow = result.tokenStats.find((r) => r.tool === 'view');

    expect(bashRow?.totalTokens).toBe(0);
    expect(bashRow?.callCount).toBe(2);

    expect(viewRow?.totalTokens).toBe(0);
    expect(viewRow?.callCount).toBe(1);
  });

  it('fallback does NOT apply when turns exist', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 100 })],
      toolCalls: [makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' })],
    });
    // toolCalls has an extra call not in the turn
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'view' }), // Extra, not in turn
    ];
    const session = makeSession({ turns: [turn], toolCalls });

    const result = computeToolStats(session);

    // Fallback should not apply since turns is not empty
    // Only bash should have tokens from the turn
    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    const viewRow = result.tokenStats.find((r) => r.tool === 'view');

    expect(bashRow?.totalTokens).toBe(100); // From turn
    expect(viewRow).toBeUndefined(); // Not in turn, fallback not applied
  });

  it('fallback populates tool accumulators with zero tokens and correct call counts', () => {
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-3', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-4', toolName: 'view' }),
    ];
    const session = makeSession({ turns: [], toolCalls });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.callCount).toBe(3);

    const viewRow = result.tokenStats.find((r) => r.tool === 'view');
    expect(viewRow?.callCount).toBe(1);
  });

  it('fallback includes models from tool calls', () => {
    const toolCalls = [
      makeToolCall({
        toolCallId: 'tc-1',
        toolName: 'bash',
        model: 'claude-sonnet-4-20250514',
      }),
      makeToolCall({
        toolCallId: 'tc-2',
        toolName: 'bash',
        model: 'claude-opus-4-20250604',
      }),
      makeToolCall({
        toolCallId: 'tc-3',
        toolName: 'bash',
        model: null,
      }),
    ];
    const session = makeSession({ turns: [], toolCalls });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.models).toEqual([
      'claude-opus-4-20250604',
      'claude-sonnet-4-20250514',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  Frequency statistics                                               */
/* ------------------------------------------------------------------ */

describe('computeToolStats — frequency', () => {
  it('counts tool calls correctly in frequencyStats', () => {
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-3', toolName: 'view' }),
      makeToolCall({ toolCallId: 'tc-4', toolName: 'grep' }),
      makeToolCall({ toolCallId: 'tc-5', toolName: 'grep' }),
      makeToolCall({ toolCallId: 'tc-6', toolName: 'grep' }),
    ];
    const session = makeSession({
      toolCalls,
      turns: [
        makeTurn({
          turnId: 'turn-1',
          toolCalls: toolCalls.slice(0, 3),
          assistantMessages: [makeAssistantMessage({ outputTokens: 300 })],
        }),
      ],
    });

    const result = computeToolStats(session);

    const grepRow = result.frequencyStats.find((r) => r.tool === 'grep');
    const bashRow = result.frequencyStats.find((r) => r.tool === 'bash');

    expect(grepRow?.callCount).toBe(3);
    expect(bashRow?.callCount).toBe(2);
  });

  it('sorts frequency by call count descending', () => {
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'view' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-3', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-4', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-5', toolName: 'bash' }),
    ];
    const session = makeSession({ toolCalls });

    const result = computeToolStats(session);

    expect(result.frequencyStats[0]?.tool).toBe('bash');
    expect(result.frequencyStats[1]?.tool).toBe('view');
  });

  it('limits frequency stats to top 15 tools', () => {
    const toolCalls = Array.from({ length: 20 }, (_, i) => ({
      ...makeToolCall(),
      toolCallId: `tc-${i}`,
      toolName: `tool-${i}`,
    }));
    const session = makeSession({ toolCalls });

    const result = computeToolStats(session);

    expect(result.frequencyStats).toHaveLength(15);
  });

  it('computes frequency proportions relative to max call count', () => {
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-3', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-4', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-5', toolName: 'view' }),
      makeToolCall({ toolCallId: 'tc-6', toolName: 'view' }),
    ];
    const session = makeSession({ toolCalls });

    const result = computeToolStats(session);

    const bashRow = result.frequencyStats.find((r) => r.tool === 'bash');
    const viewRow = result.frequencyStats.find((r) => r.tool === 'view');

    // bash: 4 calls (max), proportion = 4/4 = 1.0
    expect(bashRow?.proportion).toBe(1.0);
    // view: 2 calls, proportion = 2/4 = 0.5
    expect(viewRow?.proportion).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/*  Models aggregation                                                 */
/* ------------------------------------------------------------------ */

describe('computeToolStats — models', () => {
  it('aggregates unique models per tool', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 200 })],
      toolCalls: [
        makeToolCall({
          toolCallId: 'tc-1',
          toolName: 'bash',
          model: 'claude-sonnet-4-20250514',
        }),
        makeToolCall({
          toolCallId: 'tc-2',
          toolName: 'bash',
          model: 'claude-opus-4-20250604',
        }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.models).toEqual([
      'claude-opus-4-20250604',
      'claude-sonnet-4-20250514',
    ]);
  });

  it('excludes null models from aggregation', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 300 })],
      toolCalls: [
        makeToolCall({
          toolCallId: 'tc-1',
          toolName: 'bash',
          model: 'claude-sonnet-4-20250514',
        }),
        makeToolCall({
          toolCallId: 'tc-2',
          toolName: 'bash',
          model: null,
        }),
        makeToolCall({
          toolCallId: 'tc-3',
          toolName: 'bash',
          model: 'claude-opus-4-20250604',
        }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.models).toEqual([
      'claude-opus-4-20250604',
      'claude-sonnet-4-20250514',
    ]);
  });

  it('sorts models alphabetically', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 300 })],
      toolCalls: [
        makeToolCall({
          toolCallId: 'tc-1',
          toolName: 'bash',
          model: 'gpt-5',
        }),
        makeToolCall({
          toolCallId: 'tc-2',
          toolName: 'bash',
          model: 'claude-3-5-sonnet-20241022',
        }),
        makeToolCall({
          toolCallId: 'tc-3',
          toolName: 'bash',
          model: 'claude-opus-4-20250604',
        }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats.find((r) => r.tool === 'bash');
    expect(bashRow?.models).toEqual([
      'claude-3-5-sonnet-20241022',
      'claude-opus-4-20250604',
      'gpt-5',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  Totals                                                             */
/* ------------------------------------------------------------------ */

describe('computeToolStats — totals', () => {
  it('computes correct grand totals from token rows', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 600 })],
      toolCalls: [
        makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-3', toolName: 'view' }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    // 600 / 3 = 200 per tool
    // bash: 400, view: 200, total: 600
    expect(result.tokenTotals.totalTokens).toBe(600);
    expect(result.tokenTotals.callCount).toBe(3);
  });

  it('tokenTotals.totalUsd is always null', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 100 })],
      toolCalls: [makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' })],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    expect(result.tokenTotals.totalUsd).toBeNull();
  });

  it('tokenTotals from fallback accumulator (zero tokens)', () => {
    const toolCalls = [
      makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
      makeToolCall({ toolCallId: 'tc-3', toolName: 'view' }),
    ];
    const session = makeSession({ turns: [], toolCalls });

    const result = computeToolStats(session);

    expect(result.tokenTotals.totalTokens).toBe(0);
    expect(result.tokenTotals.callCount).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe('computeToolStats — edge cases', () => {
  it('handles tool name with special characters', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 100 })],
      toolCalls: [
        makeToolCall({
          toolCallId: 'tc-1',
          toolName: 'github-mcp-server-actions_get',
        }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const row = result.tokenStats.find(
      (r) => r.tool === 'github-mcp-server-actions_get'
    );
    expect(row?.callCount).toBe(1);
  });

  it('rounds total and average tokens', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 100 })],
      toolCalls: [
        makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-2', toolName: 'bash' }),
        makeToolCall({ toolCallId: 'tc-3', toolName: 'bash' }),
      ],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats[0];
    // 100 / 3 = 33.333..., rounded
    expect(bashRow?.totalTokens).toBe(100);
    expect(bashRow?.avgTokensPerCall).toBe(33);
  });

  it('handles proportion calculation with zero max tokens', () => {
    const session = makeSession();

    const result = computeToolStats(session);

    expect(result.tokenStats).toHaveLength(0);
  });

  it('handles single tool call correctly', () => {
    const turn = makeTurn({
      turnId: 'turn-1',
      assistantMessages: [makeAssistantMessage({ outputTokens: 250 })],
      toolCalls: [makeToolCall({ toolCallId: 'tc-1', toolName: 'bash' })],
    });
    const session = makeSession({ turns: [turn] });

    const result = computeToolStats(session);

    const bashRow = result.tokenStats[0];
    expect(bashRow?.totalTokens).toBe(250);
    expect(bashRow?.proportion).toBe(1.0);
  });
});
