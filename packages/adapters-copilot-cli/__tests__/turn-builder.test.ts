/**
 * Turn builder tests — validates grouping by turnId.
 */

import { describe, expect, it } from 'vitest';

import { processEvents } from '../src/event-handlers';
import { buildTurns } from '../src/turn-builder';
import type { RawEvent } from '../src/types';

describe('buildTurns', () => {
  it('groups events by turnId into Turn objects', () => {
    const events: RawEvent[] = [
      {
        type: 'user.message',
        timestamp: '2025-01-15T10:00:00.000Z',
        data: { interactionId: 'int-1', content: 'Hello', turnId: '0' },
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
          content: 'Hi',
          reasoningText: '',
          turnId: '0',
        },
      },
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:02.000Z',
        id: 'evt-3',
        data: { toolCallId: 'tc-1', toolName: 'grep', turnId: '0' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:03.000Z',
        id: 'evt-4',
        data: { toolCallId: 'tc-1', toolName: 'grep', success: true, turnId: '0' },
      },
      {
        type: 'tool.execution_start',
        timestamp: '2025-01-15T10:00:04.000Z',
        id: 'evt-5',
        data: { toolCallId: 'tc-2', toolName: 'view', turnId: '1' },
      },
      {
        type: 'tool.execution_complete',
        timestamp: '2025-01-15T10:00:05.000Z',
        id: 'evt-6',
        data: { toolCallId: 'tc-2', toolName: 'view', success: true, turnId: '1' },
      },
    ];

    const sb = processEvents(events);
    const turns = buildTurns(sb);

    expect(turns).toHaveLength(2);

    // Turn 0
    expect(turns[0]!.turnId).toBe('0');
    expect(turns[0]!.toolCalls).toHaveLength(1);
    expect(turns[0]!.assistantMessages).toHaveLength(1);
    expect(turns[0]!.userMessage).not.toBeNull();
    expect(turns[0]!.userMessage!.content).toBe('Hello');

    // Turn 1
    expect(turns[1]!.turnId).toBe('1');
    expect(turns[1]!.toolCalls).toHaveLength(1);
    expect(turns[1]!.toolCalls[0]!.toolName).toBe('view');
  });

  it('attaches sub-agents to parent turn via turnId', () => {
    const events: RawEvent[] = [
      {
        type: 'assistant.message',
        timestamp: '2025-01-15T10:00:00.000Z',
        id: 'evt-1',
        data: {
          interactionId: 'int-1',
          requestId: 'req-1',
          outputTokens: 50,
          inputTokens: 200,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          content: 'Spawning sub-agent',
          reasoningText: '',
          turnId: '5',
        },
      },
      {
        type: 'subagent.completed',
        timestamp: '2025-01-15T10:00:01.000Z',
        id: 'evt-2',
        parentId: 'evt-1',
        data: {
          totalTokens: 3000,
          messageCount: 2,
          toolCallCount: 1,
          turnId: '5',
          agentName: 'explorer',
          agentType: 'explore',
        },
      },
    ];

    const sb = processEvents(events);
    const turns = buildTurns(sb);

    expect(turns).toHaveLength(1);
    expect(turns[0]!.turnId).toBe('5');
    expect(turns[0]!.subagents).toHaveLength(1);
    expect(turns[0]!.subagents[0]!.agentName).toBe('explorer');
  });

  it('sorts turns by numeric ID', () => {
    const events: RawEvent[] = [
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
    ];

    const sb = processEvents(events);
    const turns = buildTurns(sb);

    expect(turns[0]!.turnId).toBe('0');
    expect(turns[1]!.turnId).toBe('2');
  });
});
