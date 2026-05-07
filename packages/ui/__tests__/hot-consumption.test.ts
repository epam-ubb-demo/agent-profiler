/**
 * Tests for hot-consumption ranking utility.
 */

import type { Compaction, Session, SubagentInvocation, Turn } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { computeHotConsumption } from '../src/session-detail/hot-consumption';

// ---------------------------------------------------------------------------
// Helpers to build minimal fixtures
// ---------------------------------------------------------------------------

/** Build a minimal Session with overrides. */
function makeSession(
  overrides: Partial<Pick<Session, 'turns' | 'subagents' | 'compactions'>> = {},
): Session {
  return {
    sessionId: 'test-session',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4',
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

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    turnId: '1',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:02:15Z',
    userMessage: null,
    assistantMessages: [],
    toolCalls: [],
    subagents: [],
    ...overrides,
  };
}

function makeAssistantMessage(
  tokens: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } = {},
) {
  return {
    interactionId: null,
    requestId: null,
    outputTokens: tokens.output ?? 0,
    inputTokens: tokens.input ?? 0,
    cacheReadTokens: tokens.cacheRead ?? 0,
    cacheWriteTokens: tokens.cacheWrite ?? 0,
    model: 'claude-sonnet-4',
    timestamp: '2024-01-01T00:00:01Z',
    turnId: '1',
    eventId: null,
    parentId: null,
    content: '',
    reasoningText: '',
  };
}

function makeSubagent(overrides: Partial<SubagentInvocation> = {}): SubagentInvocation {
  return {
    timestamp: '2024-01-01T00:01:00Z',
    totalTokens: 5000,
    messageCount: 4,
    toolCallCount: 2,
    turnId: '1',
    eventId: null,
    parentId: null,
    agentName: 'task',
    agentType: 'task',
    childSessionRef: null,
    ...overrides,
  };
}

function makeCompaction(overrides: Partial<Compaction> = {}): Compaction {
  return {
    timestamp: '2024-01-01T00:03:00Z',
    inputTokens: 2000,
    outputTokens: 500,
    cacheRead: 1000,
    cacheWrite: 300,
    model: 'claude-sonnet-4',
    turnId: '1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeHotConsumption', () => {
  it('returns empty result for a session with no turns or sub-agents', () => {
    const session = makeSession();
    const result = computeHotConsumption(session);

    expect(result.entries).toHaveLength(0);
    expect(result.totalEntries).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.topNTokens).toBe(0);
  });

  it('ranks turns by total tokens descending', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          turnId: '1',
          assistantMessages: [makeAssistantMessage({ input: 100, output: 50 })],
        }),
        makeTurn({
          turnId: '2',
          assistantMessages: [makeAssistantMessage({ input: 500, output: 200 })],
        }),
        makeTurn({
          turnId: '3',
          assistantMessages: [makeAssistantMessage({ input: 300, output: 100 })],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]!.where).toBe('Turn #2');
    expect(result.entries[0]!.tokens).toBe(700);
    expect(result.entries[0]!.rank).toBe(1);
    expect(result.entries[1]!.where).toBe('Turn #3');
    expect(result.entries[1]!.tokens).toBe(400);
    expect(result.entries[1]!.rank).toBe(2);
    expect(result.entries[2]!.where).toBe('Turn #1');
    expect(result.entries[2]!.tokens).toBe(150);
    expect(result.entries[2]!.rank).toBe(3);
  });

  it('sums all token buckets for turns', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          assistantMessages: [
            makeAssistantMessage({ input: 100, output: 50, cacheRead: 30, cacheWrite: 20 }),
          ],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.tokens).toBe(200); // 100 + 50 + 30 + 20
  });

  it('sums tokens across multiple assistant messages in one turn', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          assistantMessages: [
            makeAssistantMessage({ input: 100, output: 50 }),
            makeAssistantMessage({ input: 200, output: 75 }),
          ],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.tokens).toBe(425); // 150 + 125 + ... all zeroes for cache
  });

  it('includes sub-agents with correct fields', () => {
    const session = makeSession({
      subagents: [
        makeSubagent({
          agentName: 'explore',
          totalTokens: 8000,
          messageCount: 6,
          toolCallCount: 3,
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.type).toBe('sub-agent');
    expect(result.entries[0]!.where).toBe('Sub-agent: explore');
    expect(result.entries[0]!.tokens).toBe(8000);
    expect(result.entries[0]!.model).toBeNull();
    expect(result.entries[0]!.detail).toBe('6 messages · 3 tools');
  });

  it('excludes compactions by default', () => {
    const session = makeSession({
      compactions: [makeCompaction()],
    });
    const result = computeHotConsumption(session);

    expect(result.entries).toHaveLength(0);
  });

  it('includes compactions when includeCompactions is true', () => {
    const compaction = makeCompaction({
      inputTokens: 2000,
      outputTokens: 500,
      cacheRead: 1000,
      cacheWrite: 300,
    });
    const session = makeSession({ compactions: [compaction] });
    const result = computeHotConsumption(session, { includeCompactions: true });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.type).toBe('compaction');
    expect(result.entries[0]!.where).toBe('Compaction');
    expect(result.entries[0]!.tokens).toBe(3800); // 2000 + 500 + 1000 + 300
    expect(result.entries[0]!.model).toBe('claude-sonnet-4');
  });

  it('mixes turns and sub-agents sorted by tokens', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          turnId: '1',
          assistantMessages: [makeAssistantMessage({ input: 100, output: 50 })],
        }),
      ],
      subagents: [makeSubagent({ totalTokens: 5000 })],
    });
    const result = computeHotConsumption(session);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.type).toBe('sub-agent');
    expect(result.entries[0]!.tokens).toBe(5000);
    expect(result.entries[1]!.type).toBe('turn');
    expect(result.entries[1]!.tokens).toBe(150);
  });

  it('computes proportion relative to max entry', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          turnId: '1',
          assistantMessages: [makeAssistantMessage({ input: 1000, output: 0 })],
        }),
        makeTurn({
          turnId: '2',
          assistantMessages: [makeAssistantMessage({ input: 500, output: 0 })],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.proportion).toBe(1); // max entry
    expect(result.entries[1]!.proportion).toBe(0.5); // 500 / 1000
  });

  it('respects the limit option', () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      makeTurn({
        turnId: String(i + 1),
        assistantMessages: [makeAssistantMessage({ input: (i + 1) * 100 })],
      }),
    );
    const session = makeSession({ turns });
    const result = computeHotConsumption(session, { limit: 5 });

    expect(result.entries).toHaveLength(5);
    expect(result.totalEntries).toBe(20);
    expect(result.entries[0]!.rank).toBe(1);
    expect(result.entries[4]!.rank).toBe(5);
    // Top entry should be the turn with 2000 tokens (turn #20)
    expect(result.entries[0]!.tokens).toBe(2000);
  });

  it('defaults limit to 15', () => {
    const turns = Array.from({ length: 20 }, (_, i) =>
      makeTurn({
        turnId: String(i + 1),
        assistantMessages: [makeAssistantMessage({ input: (i + 1) * 10 })],
      }),
    );
    const session = makeSession({ turns });
    const result = computeHotConsumption(session);

    expect(result.entries).toHaveLength(15);
    expect(result.totalEntries).toBe(20);
  });

  it('computes totalTokens across all entries, not just top N', () => {
    const turns = Array.from({ length: 5 }, (_, i) =>
      makeTurn({
        turnId: String(i + 1),
        assistantMessages: [makeAssistantMessage({ input: 100 })],
      }),
    );
    const session = makeSession({ turns });
    const result = computeHotConsumption(session, { limit: 2 });

    expect(result.totalTokens).toBe(500); // 5 × 100
    expect(result.topNTokens).toBe(200); // top 2 × 100
  });

  it('sets estimatedUsd to null', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          assistantMessages: [makeAssistantMessage({ input: 100 })],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.estimatedUsd).toBeNull();
  });

  it('uses first assistant message model for turns', () => {
    const msg1 = makeAssistantMessage({ input: 100 });
    const msg2 = { ...makeAssistantMessage({ input: 200 }), model: 'other-model' };
    const session = makeSession({
      turns: [makeTurn({ assistantMessages: [msg1, msg2] })],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.model).toBe('claude-sonnet-4');
  });

  it('sets model to null when turn has no assistant messages', () => {
    const session = makeSession({
      turns: [makeTurn({ assistantMessages: [] })],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.model).toBeNull();
  });

  it('builds correct detail string for turns with tools and sub-agents', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          startTs: '2024-01-01T00:00:00Z',
          endTs: '2024-01-01T00:02:15Z',
          assistantMessages: [makeAssistantMessage({ input: 100 })],
          toolCalls: [
            {
              toolCallId: 'tc1',
              toolName: 'read',
              model: null,
              startTs: null,
              endTs: null,
              durationMs: null,
              success: true,
              parentId: null,
              turnId: '1',
              eventId: null,
              argumentsPreview: '',
            },
            {
              toolCallId: 'tc2',
              toolName: 'write',
              model: null,
              startTs: null,
              endTs: null,
              durationMs: null,
              success: true,
              parentId: null,
              turnId: '1',
              eventId: null,
              argumentsPreview: '',
            },
            {
              toolCallId: 'tc3',
              toolName: 'grep',
              model: null,
              startTs: null,
              endTs: null,
              durationMs: null,
              success: true,
              parentId: null,
              turnId: '1',
              eventId: null,
              argumentsPreview: '',
            },
          ],
          subagents: [makeSubagent({ totalTokens: 12000 })],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    // "3 tools · 1 sub-agent (12K tok) · 2m 15s"
    expect(result.entries[0]!.detail).toBe('3 tools · 1 sub-agent (12K tok) · 2m 15s');
  });

  it('uses singular "tool" for single tool call', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          startTs: null,
          endTs: null,
          assistantMessages: [makeAssistantMessage({ input: 100 })],
          toolCalls: [
            {
              toolCallId: 'tc1',
              toolName: 'read',
              model: null,
              startTs: null,
              endTs: null,
              durationMs: null,
              success: true,
              parentId: null,
              turnId: '1',
              eventId: null,
              argumentsPreview: '',
            },
          ],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.detail).toBe('1 tool');
  });

  it('omits duration from detail when timestamps are null', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          startTs: null,
          endTs: null,
          assistantMessages: [makeAssistantMessage({ input: 100 })],
          toolCalls: [],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.detail).toBe('0 tools');
  });

  it('uses turn startTs as time field', () => {
    const session = makeSession({
      turns: [
        makeTurn({
          startTs: '2024-06-15T12:30:00Z',
          assistantMessages: [makeAssistantMessage({ input: 100 })],
        }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.time).toBe('2024-06-15T12:30:00Z');
  });

  it('handles proportion correctly when all entries have zero tokens', () => {
    const session = makeSession({
      turns: [
        makeTurn({ turnId: '1', assistantMessages: [] }),
        makeTurn({ turnId: '2', assistantMessages: [] }),
      ],
    });
    const result = computeHotConsumption(session);

    // Both turns have 0 tokens; proportion should be 0 (0 / max where max is at least 1)
    expect(result.entries[0]!.proportion).toBe(0);
    expect(result.entries[1]!.proportion).toBe(0);
  });

  it('handles sub-agent detail with singular forms', () => {
    const session = makeSession({
      subagents: [
        makeSubagent({ messageCount: 1, toolCallCount: 1 }),
      ],
    });
    const result = computeHotConsumption(session);

    expect(result.entries[0]!.detail).toBe('1 message · 1 tool');
  });

  it('builds correct detail for compaction entries', () => {
    const session = makeSession({
      compactions: [
        makeCompaction({
          inputTokens: 15000,
          outputTokens: 3000,
          cacheRead: 8000,
          cacheWrite: 500,
        }),
      ],
    });
    const result = computeHotConsumption(session, { includeCompactions: true });

    expect(result.entries[0]!.detail).toBe('in 15K · out 3K · cacheR 8K · cacheW 500');
  });
});
