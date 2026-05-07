/**
 * Fan-out builder tests — validates tree reconstruction from events.
 */

import { describe, expect, it } from 'vitest';

import { processEvents } from '../src/event-handlers';
import { buildFanoutTurns } from '../src/fanout-builder';
import type { RawEvent } from '../src/types';

describe('buildFanoutTurns', () => {
  it('groups tool calls and messages by turnId', () => {
    const events: RawEvent[] = [
      {
        type: 'session.start',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: { selectedModel: 'claude-sonnet-4-20250514' },
      },
      {
        type: 'assistant.message',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-1',
        data: {
          interactionId: 'int-1',
          requestId: 'req-1',
          outputTokens: 50,
          inputTokens: 200,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          content: 'Dispatching tools',
          reasoningText: '',
          turnId: '0',
        },
      },
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:02.000Z',
        id: 'evt-2',
        data: { toolCallId: 'tc-1', toolName: 'grep', turnId: '0' },
      },
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:02.000Z',
        id: 'evt-3',
        data: { toolCallId: 'tc-2', toolName: 'view', turnId: '0' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:03.000Z',
        id: 'evt-4',
        data: { toolCallId: 'tc-1', toolName: 'grep', success: true, turnId: '0' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:04.000Z',
        id: 'evt-5',
        data: { toolCallId: 'tc-2', toolName: 'view', success: true, turnId: '0' },
      },
    ];

    const sb = processEvents(events);
    const fanout = buildFanoutTurns(sb);

    expect(fanout).toHaveLength(1);
    const turn = fanout[0]!;
    expect(turn.turnId).toBe('0');
    expect(turn.toolCalls).toHaveLength(2);
    expect(turn.assistantMessages).toHaveLength(1);
    expect(turn.model).toBe('claude-sonnet-4-20250514');
    expect(turn.startTs).toBe('2025-01-15T10:00:01.000Z');
    expect(turn.endTs).toBe('2025-01-15T10:00:04.000Z');
  });

  it('attaches sub-agents to their parent turn', () => {
    const events: RawEvent[] = [
      {
        type: 'assistant.message',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-1',
        data: {
          interactionId: 'int-1',
          requestId: 'req-1',
          outputTokens: 50,
          inputTokens: 200,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          content: 'Spawning',
          reasoningText: '',
          turnId: '3',
        },
      },
      {
        type: 'subagent.completed',
        timestamp: '2025-01-15T10:00:05.000Z',
        id: 'evt-2',
        parentId: 'evt-1',
        data: {
          totalTokens: 4000,
          messageCount: 5,
          toolCallCount: 3,
          turnId: '3',
          agentName: 'task-agent',
          agentType: 'task',
        },
      },
    ];

    const sb = processEvents(events);
    const fanout = buildFanoutTurns(sb);

    expect(fanout).toHaveLength(1);
    expect(fanout[0]!.subagents).toHaveLength(1);
    expect(fanout[0]!.subagents[0]!.agentName).toBe('task-agent');
  });

  it('sorts turns by numeric ID then timestamp', () => {
    const events: RawEvent[] = [
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:10.000Z',
        data: { toolCallId: 'tc-3', toolName: 'bash', turnId: '10' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:11.000Z',
        data: { toolCallId: 'tc-3', toolName: 'bash', success: true, turnId: '10' },
      },
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:01.000Z',
        data: { toolCallId: 'tc-1', toolName: 'grep', turnId: '0' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:02.000Z',
        data: { toolCallId: 'tc-1', toolName: 'grep', success: true, turnId: '0' },
      },
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:05.000Z',
        data: { toolCallId: 'tc-2', toolName: 'view', turnId: '2' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:06.000Z',
        data: { toolCallId: 'tc-2', toolName: 'view', success: true, turnId: '2' },
      },
    ];

    const sb = processEvents(events);
    const fanout = buildFanoutTurns(sb);

    expect(fanout).toHaveLength(3);
    expect(fanout[0]!.turnId).toBe('0');
    expect(fanout[1]!.turnId).toBe('2');
    expect(fanout[2]!.turnId).toBe('10');
  });

  it('attaches user messages via interactionId match', () => {
    const events: RawEvent[] = [
      {
        type: 'user.message',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: { interactionId: 'int-1', content: 'Fix it', turnId: '0' },
      },
      {
        type: 'assistant.message',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-2',
        data: {
          interactionId: 'int-1',
          requestId: 'req-1',
          outputTokens: 50,
          inputTokens: 200,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          content: 'On it',
          reasoningText: '',
          turnId: '0',
        },
      },
    ];

    const sb = processEvents(events);
    const fanout = buildFanoutTurns(sb);

    expect(fanout).toHaveLength(1);
    expect(fanout[0]!.userMessage).not.toBeNull();
    expect(fanout[0]!.userMessage!.content).toBe('Fix it');
  });
});
