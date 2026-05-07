/**
 * Tests for the Timeline component.
 */

import type { Session } from '@agent-profiler/core';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';

import { Timeline } from '../src/timeline/Timeline';


afterEach(cleanup);

function makeEmptySession(): Session {
  return {
    sessionId: 'test-session',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:01:00Z',
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
  };
}

describe('Timeline', () => {
  it('renders without crashing for an empty session', () => {
    const session = makeEmptySession();
    const { container } = render(<Timeline session={session} />);
    expect(container.querySelector('[data-testid="timeline"]')).toBeInTheDocument();
  });

  it('renders all lane sub-components', () => {
    const session = makeEmptySession();
    render(<Timeline session={session} />);
    expect(screen.getByTestId('token-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('model-lane')).toBeInTheDocument();
    expect(screen.getByTestId('tool-lane')).toBeInTheDocument();
    expect(screen.getByTestId('message-lane')).toBeInTheDocument();
    expect(screen.getByTestId('compaction-lane')).toBeInTheDocument();
    expect(screen.getByTestId('adaptive-ticks')).toBeInTheDocument();
  });

  it('renders timeline controls', () => {
    const session = makeEmptySession();
    render(<Timeline session={session} />);
    expect(screen.getByTestId('timeline-controls')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('1.0x');
  });

  it('renders the fixed gutter with lane labels', () => {
    const session = makeEmptySession();
    render(<Timeline session={session} />);
    expect(screen.getByTestId('timeline-gutter')).toBeInTheDocument();
  });

  it('zoom state changes on button clicks', () => {
    const session = makeEmptySession();
    render(<Timeline session={session} />);
    const zoomInBtn = screen.getByLabelText('Zoom in');
    fireEvent.click(zoomInBtn);
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('1.5x');
  });

  it('zoom resets on reset button click', () => {
    const session = makeEmptySession();
    render(<Timeline session={session} />);
    const zoomInBtn = screen.getByLabelText('Zoom in');
    const resetBtn = screen.getByLabelText('Reset zoom');
    fireEvent.click(zoomInBtn);
    fireEvent.click(resetBtn);
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('1.0x');
  });
});
