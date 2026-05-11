/**
 * Tests for DetailModal component.
 */

import type { ToolCall, Turn } from '@agent-profiler/core';
import { fireEvent, screen, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';

import { DetailModal } from '../src/panels/DetailModal';

import { render } from './test-utils';

afterEach(cleanup);

// Mock HTMLDialogElement methods for jsdom
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

function makeTurn(): Turn {
  return {
    turnId: 'turn-1',
    startTs: '2024-01-01T00:00:10Z',
    endTs: '2024-01-01T00:00:30Z',
    userMessage: {
      interactionId: null,
      timestamp: '2024-01-01T00:00:10Z',
      turnId: 'turn-1',
      content: 'Please fix the bug in main.ts',
    },
    assistantMessages: [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 200,
        inputTokens: 100,
        cacheReadTokens: 25,
        cacheWriteTokens: 0,
        model: 'claude-sonnet',
        timestamp: '2024-01-01T00:00:15Z',
        turnId: 'turn-1',
        eventId: null,
        parentId: null,
        content: 'I found the issue and fixed it.',
        reasoningText: '',
      },
    ],
    toolCalls: [],
    subagents: [],
  };
}

function makeToolCall(): ToolCall {
  return {
    toolCallId: 'tc-1',
    toolName: 'edit_file',
    model: 'claude-sonnet',
    startTs: '2024-01-01T00:00:16Z',
    endTs: '2024-01-01T00:00:18Z',
    durationMs: 2000,
    success: true,
    parentId: null,
    turnId: 'turn-1',
    eventId: null,
    argumentsPreview: '{"path": "/src/main.ts", "content": "fixed"}',
  };
}

describe('DetailModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DetailModal open={false} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="detail-modal"]')).not.toBeInTheDocument();
  });

  it('renders when open', () => {
    render(<DetailModal open={true} onClose={vi.fn()} turn={makeTurn()} />);
    expect(screen.getByTestId('detail-modal')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<DetailModal open={true} onClose={onClose} turn={makeTurn()} />);
    fireEvent.click(screen.getByTestId('detail-modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows all three tabs', () => {
    render(<DetailModal open={true} onClose={vi.fn()} turn={makeTurn()} />);
    expect(screen.getByTestId('tab-message')).toBeInTheDocument();
    expect(screen.getByTestId('tab-toolcall')).toBeInTheDocument();
    expect(screen.getByTestId('tab-metadata')).toBeInTheDocument();
  });

  it('shows message content by default', () => {
    render(<DetailModal open={true} onClose={vi.fn()} turn={makeTurn()} />);
    expect(screen.getByText('Please fix the bug in main.ts')).toBeInTheDocument();
  });

  it('switches to tool call tab', () => {
    render(
      <DetailModal open={true} onClose={vi.fn()} turn={makeTurn()} toolCall={makeToolCall()} />,
    );
    fireEvent.click(screen.getByTestId('tab-toolcall'));
    expect(screen.getByText('edit_file')).toBeInTheDocument();
    expect(
      screen.getByText('{"path": "/src/main.ts", "content": "fixed"}'),
    ).toBeInTheDocument();
  });

  it('switches to metadata tab and shows token counts', () => {
    render(<DetailModal open={true} onClose={vi.fn()} turn={makeTurn()} />);
    fireEvent.click(screen.getByTestId('tab-metadata'));
    expect(screen.getByTestId('metadata-table')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // input tokens
    expect(screen.getByText('200')).toBeInTheDocument(); // output tokens
  });

  it('handles missing turn and toolCall gracefully', () => {
    render(<DetailModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('No message data available.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-toolcall'));
    expect(screen.getByText('No tool call data available.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-metadata'));
    expect(screen.getByText('No metadata available.')).toBeInTheDocument();
  });

  it('shows tool call title in header when toolCall is provided', () => {
    render(
      <DetailModal open={true} onClose={vi.fn()} toolCall={makeToolCall()} />,
    );
    expect(screen.getByText('Tool: edit_file')).toBeInTheDocument();
  });
});
