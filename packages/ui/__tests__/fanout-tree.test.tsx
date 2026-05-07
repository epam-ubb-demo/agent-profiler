/**
 * Tests for FanoutTree and FanoutNode components.
 */

import type { FanoutTurn, Session } from '@agent-profiler/core';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';

import { FanoutNode } from '../src/fanout/FanoutNode';
import { FanoutTree } from '../src/fanout/FanoutTree';

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

function makeFanoutTurn(overrides?: Partial<FanoutTurn>): FanoutTurn {
  return {
    turnId: 'ft-1',
    startTs: '2024-01-01T00:00:10Z',
    endTs: '2024-01-01T00:00:20Z',
    model: 'claude-sonnet',
    assistantMessages: [],
    toolCalls: [
      {
        toolCallId: 'tc-f1',
        toolName: 'bash',
        model: 'claude-sonnet',
        startTs: '2024-01-01T00:00:12Z',
        endTs: '2024-01-01T00:00:14Z',
        durationMs: 2000,
        success: true,
        parentId: null,
        turnId: 'ft-1',
        eventId: null,
        argumentsPreview: '{"command": "ls"}',
      },
    ],
    subagents: [
      {
        timestamp: '2024-01-01T00:00:15Z',
        totalTokens: 500,
        messageCount: 3,
        toolCallCount: 2,
        turnId: 'ft-1',
        eventId: null,
        parentId: null,
        agentName: 'explore-agent',
        agentType: 'explore',
        childSessionRef: null,
      },
    ],
    userMessage: null,
    ...overrides,
  };
}

describe('FanoutTree', () => {
  it('renders nothing when session has no fanout turns', () => {
    const session = makeEmptySession();
    const { container } = render(<FanoutTree session={session} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders tree when fanout turns exist', () => {
    const session = { ...makeEmptySession(), fanoutTurns: [makeFanoutTurn()] };
    render(<FanoutTree session={session} />);
    expect(screen.getByTestId('fanout-tree')).toBeInTheDocument();
  });

  it('renders correct number of nodes', () => {
    const session = {
      ...makeEmptySession(),
      fanoutTurns: [makeFanoutTurn(), makeFanoutTurn({ turnId: 'ft-2' })],
    };
    render(<FanoutTree session={session} />);
    const nodes = screen.getAllByTestId('fanout-node');
    expect(nodes).toHaveLength(2);
  });
});

describe('FanoutNode', () => {
  it('renders node header with label', () => {
    render(<FanoutNode turn={makeFanoutTurn()} depth={0} />);
    expect(screen.getByText('explore-agent')).toBeInTheDocument();
  });

  it('shows tool count', () => {
    render(<FanoutNode turn={makeFanoutTurn()} depth={0} />);
    expect(screen.getByText('1 tool')).toBeInTheDocument();
  });

  it('expands to show tool calls on click', () => {
    render(<FanoutNode turn={makeFanoutTurn()} depth={0} />);
    expect(screen.queryByTestId('fanout-node-body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fanout-node-header'));
    expect(screen.getByTestId('fanout-node-body')).toBeInTheDocument();
    expect(screen.getByText('bash')).toBeInTheDocument();
  });

  it('applies correct indentation based on depth', () => {
    const { container } = render(<FanoutNode turn={makeFanoutTurn()} depth={3} />);
    const node = container.querySelector('[data-testid="fanout-node"]') as HTMLElement;
    expect(node.style.marginLeft).toBe('60px'); // 3 * 20
  });

  it('falls back to model as label when no subagents', () => {
    const turn = makeFanoutTurn({ subagents: [] });
    render(<FanoutNode turn={turn} depth={0} />);
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument();
  });

  it('calls onNodeClick when inspect is clicked', () => {
    const onNodeClick = vi.fn();
    const turn = makeFanoutTurn();
    render(<FanoutNode turn={turn} depth={0} onNodeClick={onNodeClick} />);
    fireEvent.click(screen.getByText('inspect'));
    expect(onNodeClick).toHaveBeenCalledWith(turn);
  });
});
