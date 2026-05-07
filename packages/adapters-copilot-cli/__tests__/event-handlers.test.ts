/**
 * Event handler tests — validates that each event type produces the
 * correct domain object within the SessionBuilder.
 */

import { describe, expect, it } from 'vitest';

import {
  countPostShutdownEvents,
  createSessionBuilder,
  deriveSessionOutcome,
  processEvents,
} from '../src/event-handlers';
import type { RawEvent } from '../src/types';

describe('processEvents', () => {
  it('processes session.start into session metadata', () => {
    const events: RawEvent[] = [
      {
        type: 'session.start',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        data: {
          sessionId: 'sess-001',
          copilotVersion: '1.2.3',
          selectedModel: 'claude-sonnet-4-20250514',
          reasoningEffort: 'medium',
          startTime: '2025-01-15T10:00:00.000Z',
          context: { repository: 'org/repo', branch: 'main', cwd: '/tmp' },
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.sessionId).toBe('sess-001');
    expect(sb.copilotVersion).toBe('1.2.3');
    expect(sb.selectedModel).toBe('claude-sonnet-4-20250514');
    expect(sb.reasoningEffort).toBe('medium');
    expect(sb.repository).toBe('org/repo');
    expect(sb.branch).toBe('main');
    expect(sb.cwd).toBe('/tmp');
    expect(sb.startTs).toBe('2025-01-15T10:00:00.000Z');
  });

  it('processes session.model_change into modelChanges', () => {
    const events: RawEvent[] = [
      {
        type: 'session.model_change',
        timestamp: '2025-01-15T10:01:00.000Z',
        id: 'evt-1',
        data: { model: 'gpt-4o' },
      },
    ];

    const sb = processEvents(events);

    expect(sb.modelChanges).toHaveLength(1);
    expect(sb.modelChanges[0]).toEqual({
      timestamp: '2025-01-15T10:01:00.000Z',
      model: 'gpt-4o',
    });
  });

  it('links tool.execution_start and tool.execution_complete', () => {
    const events: RawEvent[] = [
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        parentId: 'parent-1',
        data: { toolCallId: 'tc-1', toolName: 'grep', turnId: '0', arguments: { pattern: 'foo' } },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-2',
        parentId: 'parent-1',
        data: { toolCallId: 'tc-1', toolName: 'grep', success: true, turnId: '0' },
      },
    ];

    const sb = processEvents(events);

    expect(sb.toolCalls).toHaveLength(1);
    const tc = sb.toolCalls[0]!;
    expect(tc.toolCallId).toBe('tc-1');
    expect(tc.toolName).toBe('grep');
    expect(tc.startTs).toBe('2025-01-15T10:00:00.000Z');
    expect(tc.endTs).toBe('2025-01-15T10:00:01.000Z');
    expect(tc.durationMs).toBe(1000);
    expect(tc.success).toBe(true);
    expect(tc.argumentsPreview).toContain('pattern');
  });

  it('creates a tool call from orphan tool.execution_complete', () => {
    const events: RawEvent[] = [
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-1',
        data: { toolCallId: 'tc-orphan', toolName: 'bash', success: false, turnId: '1' },
      },
    ];

    const sb = processEvents(events);

    expect(sb.toolCalls).toHaveLength(1);
    const tc = sb.toolCalls[0]!;
    expect(tc.toolCallId).toBe('tc-orphan');
    expect(tc.startTs).toBe('2025-01-15T10:00:01.000Z');
    expect(tc.endTs).toBe('2025-01-15T10:00:01.000Z');
    expect(tc.success).toBe(false);
  });

  it('processes assistant.message', () => {
    const events: RawEvent[] = [
      {
        type: 'session.start',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: { selectedModel: 'claude-sonnet-4-20250514' },
      },
      {
        type: 'assistant.message',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-2',
        parentId: 'parent-1',
        data: {
          interactionId: 'int-1',
          requestId: 'req-1',
          outputTokens: 100,
          inputTokens: 500,
          cacheReadTokens: 200,
          cacheWriteTokens: 0,
          content: 'Hello',
          reasoningText: 'thinking...',
          turnId: '0',
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.assistantMessages).toHaveLength(1);
    const msg = sb.assistantMessages[0]!;
    expect(msg.interactionId).toBe('int-1');
    expect(msg.outputTokens).toBe(100);
    expect(msg.inputTokens).toBe(500);
    expect(msg.content).toBe('Hello');
    expect(msg.model).toBe('claude-sonnet-4-20250514');
  });

  it('processes user.message', () => {
    const events: RawEvent[] = [
      {
        type: 'user.message',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        data: { interactionId: 'int-1', content: 'Fix the bug', turnId: '0' },
      },
    ];

    const sb = processEvents(events);

    expect(sb.userMessages).toHaveLength(1);
    expect(sb.userMessages[0]!.content).toBe('Fix the bug');
    expect(sb.userMessages[0]!.turnId).toBe('0');
  });

  it('processes session.compaction_complete', () => {
    const events: RawEvent[] = [
      {
        type: 'session.compaction_complete',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        data: {
          compactionTokensUsed: {
            inputTokens: 500,
            outputTokens: 100,
            cacheReadTokens: 200,
            cacheWriteTokens: 50,
            model: 'claude-sonnet-4-20250514',
          },
          turnId: '2',
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.compactions).toHaveLength(1);
    const c = sb.compactions[0]!;
    expect(c.inputTokens).toBe(500);
    expect(c.outputTokens).toBe(100);
    expect(c.cacheRead).toBe(200);
    expect(c.cacheWrite).toBe(50);
    expect(c.model).toBe('claude-sonnet-4-20250514');
  });

  it('processes subagent.completed', () => {
    const events: RawEvent[] = [
      {
        type: 'subagent.completed',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        parentId: 'parent-1',
        data: {
          totalTokens: 5000,
          messageCount: 3,
          toolCallCount: 2,
          turnId: '1',
          agentName: 'explorer',
          agentType: 'explore',
          childSessionRef: 'child-sess-001',
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.subagents).toHaveLength(1);
    const sa = sb.subagents[0]!;
    expect(sa.totalTokens).toBe(5000);
    expect(sa.agentName).toBe('explorer');
    expect(sa.agentType).toBe('explore');
    expect(sa.childSessionRef).toBe('child-sess-001');
  });

  it('processes session.task_complete', () => {
    const events: RawEvent[] = [
      {
        type: 'session.task_complete',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: { success: true },
      },
    ];

    const sb = processEvents(events);

    expect(sb.success).toBe(true);
    expect(sb.terminalEvents).toHaveLength(1);
  });

  it('processes abort event', () => {
    const events: RawEvent[] = [
      { type: 'abort', timestamp: '2025-01-15T10:00:00.000Z', data: {} },
    ];

    const sb = processEvents(events);

    expect(sb.terminalEvents).toHaveLength(1);
    expect(sb.terminalEvents[0]!.kind).toBe('abort');
  });

  it('processes session.shutdown', () => {
    const events: RawEvent[] = [
      {
        type: 'session.shutdown',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: {
          totalPremiumRequests: 5,
          totalApiDurationMs: 10000,
          modelMetrics: {
            'claude-sonnet-4-20250514': {
              requests: { count: 5, cost: 3 },
              usage: {
                inputTokens: 8000,
                outputTokens: 400,
                cacheReadTokens: 5000,
                cacheWriteTokens: 100,
              },
            },
          },
          currentTokens: 7000,
          systemTokens: 2000,
          conversationTokens: 4000,
          toolDefinitionsTokens: 1000,
          codeChanges: { 'src/file.ts': 1 },
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.shutdown).not.toBeNull();
    expect(sb.shutdown!.totalPremiumRequests).toBe(5);
    expect(sb.shutdown!.modelMetrics).toHaveLength(1);
    expect(sb.shutdown!.modelMetrics[0]!.model).toBe('claude-sonnet-4-20250514');
    expect(sb.shutdown!.modelMetrics[0]!.inputTokens).toBe(8000);
    expect(sb.shutdown!.modelMetrics[0]!.outputTokens).toBe(400);
    expect(sb.shutdown!.modelMetrics[0]!.cacheReadTokens).toBe(5000);
    expect(sb.shutdown!.modelMetrics[0]!.cacheWriteTokens).toBe(100);
    expect(sb.shutdown!.modelMetrics[0]!.requestCount).toBe(5);
    expect(sb.shutdown!.modelMetrics[0]!.premiumRequestCost).toBe(3);
  });

  it('processes session.shutdown with legacy flat modelMetrics format', () => {
    const events: RawEvent[] = [
      {
        type: 'session.shutdown',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: {
          totalPremiumRequests: 2,
          totalApiDurationMs: 5000,
          modelMetrics: {
            'gpt-4o': {
              inputTokens: 4000,
              outputTokens: 200,
              cacheReadTokens: 2000,
              cacheWriteTokens: 0,
              requestCount: 2,
              apiDurationMs: 5000,
            },
          },
          currentTokens: 3000,
          systemTokens: 1000,
          conversationTokens: 1500,
          toolDefinitionsTokens: 500,
          codeChanges: {},
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.shutdown).not.toBeNull();
    expect(sb.shutdown!.modelMetrics).toHaveLength(1);
    const m = sb.shutdown!.modelMetrics[0]!;
    expect(m.model).toBe('gpt-4o');
    expect(m.inputTokens).toBe(4000);
    expect(m.outputTokens).toBe(200);
    expect(m.cacheReadTokens).toBe(2000);
    expect(m.cacheWriteTokens).toBe(0);
    expect(m.requestCount).toBe(2);
    expect(m.apiDurationMs).toBe(5000);
    expect(m.premiumRequestCost).toBe(0);
  });

  it('handles malformed modelMetrics sub-objects gracefully', () => {
    const events: RawEvent[] = [
      {
        type: 'session.shutdown',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: {
          totalPremiumRequests: 1,
          totalApiDurationMs: 1000,
          modelMetrics: {
            'broken-model': {
              usage: null,
              requests: 'bad',
            },
          },
          currentTokens: 0,
          systemTokens: 0,
          conversationTokens: 0,
          toolDefinitionsTokens: 0,
          codeChanges: {},
        },
      },
    ];

    const sb = processEvents(events);

    expect(sb.shutdown).not.toBeNull();
    expect(sb.shutdown!.modelMetrics).toHaveLength(1);
    const m = sb.shutdown!.modelMetrics[0]!;
    expect(m.model).toBe('broken-model');
    expect(m.inputTokens).toBe(0);
    expect(m.outputTokens).toBe(0);
    expect(m.premiumRequestCost).toBe(0);
  });

  it('flushes pending starts without matching completes', () => {
    const events: RawEvent[] = [
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        data: { toolCallId: 'tc-inflight', toolName: 'bash', turnId: '0' },
      },
    ];

    const sb = processEvents(events);

    expect(sb.toolCalls).toHaveLength(1);
    expect(sb.toolCalls[0]!.toolCallId).toBe('tc-inflight');
    expect(sb.toolCalls[0]!.endTs).toBeNull();
    expect(sb.toolCalls[0]!.success).toBeNull();
  });
});

describe('countPostShutdownEvents', () => {
  it('returns 0 when no events after shutdown', () => {
    const sb = createSessionBuilder();
    sb.shutdown = {
      totalPremiumRequests: 1,
      totalApiDurationMs: 1000,
      modelMetrics: [],
      currentTokens: 100,
      systemTokens: 50,
      conversationTokens: 40,
      toolDefinitionsTokens: 10,
      codeChanges: {},
      timestamp: '2025-01-15T10:00:10.000Z',
    };
    sb.assistantMessages = [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 10,
        inputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: null,
        timestamp: '2025-01-15T10:00:05.000Z',
        turnId: null,
        eventId: null,
        parentId: null,
        content: '',
        reasoningText: '',
      },
    ];

    expect(countPostShutdownEvents(sb)).toBe(0);
  });

  it('counts events after shutdown', () => {
    const sb = createSessionBuilder();
    sb.shutdown = {
      totalPremiumRequests: 1,
      totalApiDurationMs: 1000,
      modelMetrics: [],
      currentTokens: 100,
      systemTokens: 50,
      conversationTokens: 40,
      toolDefinitionsTokens: 10,
      codeChanges: {},
      timestamp: '2025-01-15T10:00:05.000Z',
    };
    sb.assistantMessages = [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 10,
        inputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: null,
        timestamp: '2025-01-15T10:00:10.000Z',
        turnId: null,
        eventId: null,
        parentId: null,
        content: '',
        reasoningText: '',
      },
    ];

    expect(countPostShutdownEvents(sb)).toBe(1);
  });
});

describe('deriveSessionOutcome', () => {
  it('returns null when no terminal events', () => {
    const sb = createSessionBuilder();
    expect(deriveSessionOutcome(sb)).toBeNull();
  });

  it('returns true for successful task_complete', () => {
    const sb = createSessionBuilder();
    sb.terminalEvents = [{ kind: 'task_complete', timestamp: '2025-01-15T10:00:00.000Z', success: true }];
    expect(deriveSessionOutcome(sb)).toBe(true);
  });

  it('returns false for abort', () => {
    const sb = createSessionBuilder();
    sb.terminalEvents = [{ kind: 'abort', timestamp: '2025-01-15T10:00:00.000Z', success: null }];
    expect(deriveSessionOutcome(sb)).toBe(false);
  });

  it('uses the last terminal event when multiple exist', () => {
    const sb = createSessionBuilder();
    sb.terminalEvents = [
      { kind: 'task_complete', timestamp: '2025-01-15T10:00:00.000Z', success: true },
      { kind: 'abort', timestamp: '2025-01-15T10:00:01.000Z', success: null },
    ];
    expect(deriveSessionOutcome(sb)).toBe(false);
  });
});
