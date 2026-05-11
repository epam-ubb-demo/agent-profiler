/**
 * Tests for TurnPanel component.
 */

import type { Turn } from '@agent-profiler/core';
import { fireEvent, screen, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';

import { TurnPanel } from '../src/panels/TurnPanel';

import { render } from './test-utils';

afterEach(cleanup);

function makeTurn(overrides?: Partial<Turn>): Turn {
  return {
    turnId: 'turn-1',
    startTs: '2024-01-01T00:00:10Z',
    endTs: '2024-01-01T00:00:30Z',
    userMessage: {
      interactionId: null,
      timestamp: '2024-01-01T00:00:10Z',
      turnId: 'turn-1',
      content: 'Hello, please help me with this task.',
    },
    assistantMessages: [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 150,
        inputTokens: 50,
        cacheReadTokens: 10,
        cacheWriteTokens: 0,
        model: 'claude-sonnet',
        timestamp: '2024-01-01T00:00:15Z',
        turnId: 'turn-1',
        eventId: null,
        parentId: null,
        content: 'Sure, I can help with that.',
        reasoningText: '',
      },
    ],
    toolCalls: [
      {
        toolCallId: 'tc-1',
        toolName: 'read_file',
        model: 'claude-sonnet',
        startTs: '2024-01-01T00:00:16Z',
        endTs: '2024-01-01T00:00:18Z',
        durationMs: 2000,
        success: true,
        parentId: null,
        turnId: 'turn-1',
        eventId: null,
        argumentsPreview: '{"path": "/src/main.ts"}',
      },
    ],
    subagents: [],
    ...overrides,
  };
}

describe('TurnPanel', () => {
  it('renders turn header with turn ID', () => {
    render(<TurnPanel turn={makeTurn()} />);
    expect(screen.getByTestId('turn-panel-header')).toBeInTheDocument();
    expect(screen.getByText('#turn-1')).toBeInTheDocument();
  });

  it('renders relative timestamp when sessionStartTs is provided', () => {
    render(<TurnPanel turn={makeTurn()} sessionStartTs="2024-01-01T00:00:00Z" />);
    expect(screen.getByText('+10s')).toBeInTheDocument();
  });

  it('expands and collapses on header click', () => {
    render(<TurnPanel turn={makeTurn()} />);
    expect(screen.queryByTestId('turn-panel-body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('turn-panel-header'));
    expect(screen.getByTestId('turn-panel-body')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('turn-panel-header'));
    expect(screen.queryByTestId('turn-panel-body')).not.toBeInTheDocument();
  });

  it('shows tool calls when expanded', () => {
    render(<TurnPanel turn={makeTurn()} />);
    fireEvent.click(screen.getByTestId('turn-panel-header'));
    expect(screen.getByTestId('tool-calls-list')).toBeInTheDocument();
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });

  it('calls onToolCallClick when tool call is clicked', () => {
    const onToolCallClick = vi.fn();
    const turn = makeTurn();
    render(<TurnPanel turn={turn} onToolCallClick={onToolCallClick} />);
    fireEvent.click(screen.getByTestId('turn-panel-header'));
    fireEvent.click(screen.getByText('read_file'));
    expect(onToolCallClick).toHaveBeenCalledWith(turn.toolCalls[0]);
  });

  it('shows token summary when expanded', () => {
    render(<TurnPanel turn={makeTurn()} />);
    fireEvent.click(screen.getByTestId('turn-panel-header'));
    expect(screen.getByTestId('token-summary')).toBeInTheDocument();
    expect(screen.getByText('In: 50')).toBeInTheDocument();
    expect(screen.getByText('Out: 150')).toBeInTheDocument();
  });

  it('handles turn with empty messages gracefully', () => {
    const turn = makeTurn({
      userMessage: null,
      assistantMessages: [],
      toolCalls: [],
    });
    render(<TurnPanel turn={turn} />);
    fireEvent.click(screen.getByTestId('turn-panel-header'));
    expect(screen.getByTestId('turn-panel-body')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-calls-list')).not.toBeInTheDocument();
  });

  it('highlights when isSelected is true', () => {
    const { container } = render(<TurnPanel turn={makeTurn()} isSelected={true} />);
    const panel = container.querySelector('[data-testid="turn-panel"]');
    expect(panel).toHaveStyle({ border: '1px solid var(--uui-info-50)' });
  });
});
