/**
 * Tests for SubagentTable — clickable agent name links.
 */

import type { SubagentInvocation } from '@agent-profiler/core';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SubagentTable } from '../src/session-detail/SubagentTable';

import { render } from './test-utils';

afterEach(cleanup);

function makeSub(overrides?: Partial<SubagentInvocation>): SubagentInvocation {
  return {
    timestamp: '2024-06-01T10:00:00Z',
    totalTokens: 1_000,
    messageCount: 5,
    toolCallCount: 3,
    turnId: null,
    eventId: 'evt-1',
    parentId: null,
    agentName: 'explore',
    agentType: 'explore',
    childSessionRef: null,
    ...overrides,
  };
}

describe('SubagentTable', () => {
  it('renders agent name as plain text when childSessionRef is null', () => {
    render(<SubagentTable subagents={[makeSub({ agentName: 'plain-agent' })]} />);

    const cell = screen.getByText('plain-agent');
    expect(cell.tagName).toBe('CODE');
    // No wrapping button
    expect(cell.closest('button')).toBeNull();
  });

  it('renders agent name as clickable link when childSessionRef and onSessionNavigate are provided', () => {
    const navigate = vi.fn();

    render(
      <SubagentTable
        subagents={[makeSub({ childSessionRef: 'child-session-1' })]}
        onSessionNavigate={navigate}
      />,
    );

    const btn = screen.getByTitle('Open session child-session-1');
    expect(btn.tagName).toBe('BUTTON');
    expect(within(btn).getByText('explore')).toBeDefined();

    fireEvent.click(btn);
    expect(navigate).toHaveBeenCalledWith('child-session-1');
  });

  it('renders agent name as plain text when childSessionRef exists but onSessionNavigate is not provided', () => {
    render(
      <SubagentTable subagents={[makeSub({ agentName: 'solo-agent', childSessionRef: 'child-session-1' })]} />,
    );

    const cell = screen.getByText('solo-agent');
    expect(cell.tagName).toBe('CODE');
    expect(cell.closest('button')).toBeNull();
  });

  it('does not render a separate "Open session" column', () => {
    const navigate = vi.fn();

    render(
      <SubagentTable
        subagents={[makeSub({ childSessionRef: 'child-session-1' })]}
        onSessionNavigate={navigate}
      />,
    );

    // The table should have exactly 6 column headers (Agent, Type, Time, Tokens, Messages, Tool calls)
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(6);

    // No "Open session" text in the table body
    expect(screen.queryByText('Open session ↗')).toBeNull();
  });

  it('renders a mix of clickable and plain agent names', () => {
    const navigate = vi.fn();

    render(
      <SubagentTable
        subagents={[
          makeSub({ eventId: 'e1', agentName: 'agent-a', childSessionRef: 'sess-a' }),
          makeSub({ eventId: 'e2', agentName: 'agent-b', childSessionRef: null }),
        ]}
        onSessionNavigate={navigate}
      />,
    );

    // agent-a should be clickable
    const linkBtn = screen.getByTitle('Open session sess-a');
    expect(within(linkBtn).getByText('agent-a')).toBeDefined();

    // agent-b should be plain text
    const plain = screen.getByText('agent-b');
    expect(plain.tagName).toBe('CODE');
    expect(plain.closest('button')).toBeNull();
  });
});
