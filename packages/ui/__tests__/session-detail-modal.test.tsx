/**
 * Tests for SessionDetailModal and deep link hook.
 */

import type { Session } from '@agent-profiler/core';
import { screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';

import { SessionDetailModal } from '../src/comparative/SessionDetailModal';
import { useDeepLink } from '../src/hooks/useDeepLink';

import { render } from './test-utils';

afterEach(() => {
  cleanup();
  // Reset hash after each test
  history.replaceState(null, '', window.location.pathname + window.location.search);
});

// Mock HTMLDialogElement methods for jsdom
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

function makeSession(overrides?: Partial<Session>): Session {
  return {
    sessionId: 'sess-123',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:05:30Z',
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: true,
    fanoutTurns: [],
    turns: [
      {
        turnId: 'turn-1',
        startTs: '2024-01-01T00:00:10Z',
        endTs: '2024-01-01T00:00:30Z',
        userMessage: {
          interactionId: null,
          timestamp: '2024-01-01T00:00:10Z',
          turnId: 'turn-1',
          content: 'Hello',
        },
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 100,
            inputTokens: 50,
            cacheReadTokens: 10,
            cacheWriteTokens: 0,
            model: 'claude-sonnet',
            timestamp: '2024-01-01T00:00:15Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Hi there!',
            reasoningText: '',
          },
        ],
        toolCalls: [],
        subagents: [],
      },
    ],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  };
}

describe('SessionDetailModal', () => {
  it('opens modal when rendered', async () => {
    const session = makeSession();
    const loader = vi.fn().mockResolvedValue(session);

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('session-detail-modal')).toBeInTheDocument();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('shows loading state initially', () => {
    const loader = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('session-detail-loading')).toBeInTheDocument();
  });

  it('renders session content when loaded', async () => {
    const session = makeSession();
    const loader = vi.fn().mockResolvedValue(session);

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('session-detail-content')).toBeInTheDocument();
    });
  });

  it('closes on Escape key (via dialog onClose)', () => {
    const session = makeSession();
    const loader = vi.fn().mockResolvedValue(session);
    const onClose = vi.fn();

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={onClose} />,
    );

    // Simulate the dialog's native close event (triggered by Escape)
    const dialog = screen.getByTestId('session-detail-modal');
    fireEvent(dialog, new Event('close', { bubbles: false }));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    const session = makeSession();
    const loader = vi.fn().mockResolvedValue(session);
    const onClose = vi.fn();

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={onClose} />,
    );

    const dialog = screen.getByTestId('session-detail-modal');
    fireEvent.click(dialog);

    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on content click', () => {
    const session = makeSession();
    const loader = vi.fn().mockResolvedValue(session);
    const onClose = vi.fn();

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={onClose} />,
    );

    const body = screen.getByTestId('session-detail-body');
    fireEvent.click(body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on close button click', () => {
    const session = makeSession();
    const loader = vi.fn().mockResolvedValue(session);
    const onClose = vi.fn();

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId('session-detail-modal-close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows error state on load failure', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('Network error'));
    const onClose = vi.fn();

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('session-detail-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows error state when session is null', async () => {
    const loader = vi.fn().mockResolvedValue(null);
    const onClose = vi.fn();

    render(
      <SessionDetailModal sessionId="sess-123" sessionLoader={loader} onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('session-detail-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Session not found')).toBeInTheDocument();
  });

  it('displays session title with session ID', () => {
    const loader = vi.fn().mockReturnValue(new Promise(() => {}));

    render(
      <SessionDetailModal sessionId="sess-abc" sessionLoader={loader} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('session-detail-title')).toHaveTextContent('Session: sess-abc');
  });
});

// ─── useDeepLink tests ────────────────────────────────────────────────────────

function DeepLinkHarness({ onHook }: { onHook: (hook: ReturnType<typeof useDeepLink>) => void }) {
  const hook = useDeepLink();
  onHook(hook);
  return (
    <div>
      <span data-testid="linked-id">{hook.linkedSessionId ?? 'none'}</span>
      <button data-testid="set-hash" onClick={() => hook.setSessionHash('sess-xyz')}>
        Set
      </button>
      <button data-testid="clear-hash" onClick={() => hook.clearSessionHash()}>
        Clear
      </button>
    </div>
  );
}

describe('useDeepLink', () => {
  it('reads session ID from initial hash', () => {
    window.location.hash = '#session/sess-initial';

    let hookResult: ReturnType<typeof useDeepLink> | undefined;
    render(<DeepLinkHarness onHook={(h) => { hookResult = h; }} />);

    expect(hookResult?.linkedSessionId).toBe('sess-initial');
  });

  it('sets hash when setSessionHash is called', () => {
    render(<DeepLinkHarness onHook={() => {}} />);

    fireEvent.click(screen.getByTestId('set-hash'));

    expect(window.location.hash).toBe('#session/sess-xyz');
  });

  it('clears hash when clearSessionHash is called', () => {
    window.location.hash = '#session/sess-clear';

    render(<DeepLinkHarness onHook={() => {}} />);

    fireEvent.click(screen.getByTestId('clear-hash'));

    expect(window.location.hash).toBe('');
  });

  it('responds to hashchange events', async () => {
    render(<DeepLinkHarness onHook={() => {}} />);

    act(() => {
      window.location.hash = '#session/sess-event';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('linked-id')).toHaveTextContent('sess-event');
    });
  });

  it('returns null when hash is not a session hash', () => {
    window.location.hash = '#other-thing';

    let hookResult: ReturnType<typeof useDeepLink> | undefined;
    render(<DeepLinkHarness onHook={(h) => { hookResult = h; }} />);

    expect(hookResult?.linkedSessionId).toBeNull();
  });
});
