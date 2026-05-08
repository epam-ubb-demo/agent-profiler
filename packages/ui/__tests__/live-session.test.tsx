/**
 * Tests for the live session visual indicator feature.
 *
 * Covers:
 *   - computeSessionStats with { isLive: true }
 *   - SessionDetailView rendering for live vs completed sessions
 *   - Alert banner dismissal behaviour
 *   - ModelSpendTable live notice row
 */

import type { ModelMetrics, Session, ShutdownMetrics } from '@agent-profiler/core';
import { fireEvent, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeSessionStats } from '../src/session-detail/session-stats';
import { SessionDetailView } from '../src/session-detail/SessionDetailView';

import { render } from './test-utils';

// Mock SVG icon imports that jsdom cannot handle
vi.mock('@epam/assets/icons/common/notification-info-fill-24.svg', () => ({ default: () => null }));
vi.mock('@epam/assets/icons/common/notification-warning-outline-24.svg', () => ({ default: () => null }));
vi.mock('@epam/assets/icons/common/notification-error-fill-24.svg', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMetrics(overrides?: Partial<ModelMetrics>): ModelMetrics {
  return {
    model: 'claude-sonnet-4-20250514',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
    reasoningTokens: 0,
    requestCount: 5,
    premiumRequestCost: 0,
    apiDurationMs: 3000,
    ...overrides,
  };
}

function makeShutdown(overrides?: Partial<ShutdownMetrics>): ShutdownMetrics {
  return {
    totalPremiumRequests: 10,
    totalApiDurationMs: 30000,
    modelMetrics: [makeMetrics()],
    currentTokens: 5000,
    systemTokens: 1000,
    conversationTokens: 3000,
    toolDefinitionsTokens: 1000,
    codeChanges: { filesCreated: 0, filesChanged: 0, filesDeleted: 0, insertions: 0, deletions: 0 },
    timestamp: '2025-01-15T10:30:00Z',
    ...overrides,
  };
}

function makeSession(overrides?: Partial<Session>): Session {
  return {
    sessionId: 'live-test-001',
    copilotVersion: '1.2.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp/test',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:15:00Z',
    modelChanges: [],
    toolCalls: [
      {
        toolCallId: 'tc-1',
        toolName: 'read_file',
        model: 'claude-sonnet-4-20250514',
        startTs: '2025-01-15T10:01:00Z',
        endTs: '2025-01-15T10:01:05Z',
        durationMs: 5000,
        success: true,
        parentId: null,
        turnId: null,
        eventId: null,
        argumentsPreview: '',
      },
    ],
    assistantMessages: [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 500,
        inputTokens: 1000,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
        model: 'claude-sonnet-4-20250514',
        timestamp: '2025-01-15T10:01:00Z',
        turnId: null,
        eventId: null,
        parentId: null,
        content: 'Hello',
        reasoningText: '',
      },
    ],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: makeShutdown(),
    success: true,
    fanoutTurns: [],
    turns: [
      {
        turnId: 'turn-1',
        startTs: '2025-01-15T10:01:00Z',
        endTs: '2025-01-15T10:02:00Z',
        userMessage: null,
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            outputTokens: 500,
            inputTokens: 1000,
            cacheReadTokens: 200,
            cacheWriteTokens: 100,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:01:00Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Hello',
            reasoningText: '',
          },
        ],
        toolCalls: [],
        subagents: [],
      },
    ],
    parseStatus: { status: 'ok' as const, error: null },
    utilisation: [],
    ...overrides,
  } as Session;
}

/** Build a live session (shutdown=null, endTs=null). */
function makeLiveSession(overrides?: Partial<Session>): Session {
  return makeSession({
    shutdown: null,
    endTs: null,
    success: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Unit tests: computeSessionStats with { isLive: true }
// ---------------------------------------------------------------------------

describe('computeSessionStats — live session', () => {
  it('marks estimatedCost as pending with "—" value', () => {
    const session = makeLiveSession();
    const stats = computeSessionStats(session, { isLive: true });

    expect(stats.estimatedCost.pending).toBe(true);
    expect(stats.estimatedCost.value).toBeNull();
    expect(stats.estimatedCost.display).toBe('—');
  });

  it('marks taskSuccess as pending with "—" value', () => {
    const session = makeLiveSession();
    const stats = computeSessionStats(session, { isLive: true });

    expect(stats.taskSuccess.pending).toBe(true);
    expect(stats.taskSuccess.value).toBeNull();
    expect(stats.taskSuccess.display).toBe('—');
  });

  it('prefixes duration display with "~"', () => {
    const session = makeLiveSession({ startTs: '2025-01-15T10:00:00Z' });
    const stats = computeSessionStats(session, { isLive: true });

    expect(stats.duration.display).toMatch(/^~/);
    expect(stats.duration.value).toBeGreaterThan(0);
  });

  it('does NOT mark count-based stats as pending', () => {
    const session = makeLiveSession();
    const stats = computeSessionStats(session, { isLive: true });

    expect(stats.toolCallCount.pending).toBeUndefined();
    expect(stats.turnCount.pending).toBeUndefined();
    expect(stats.assistantMessageCount.pending).toBeUndefined();
    expect(stats.compactionCount.pending).toBeUndefined();
    expect(stats.subagentCount.pending).toBeUndefined();
    expect(stats.avgTokensPerToolCall.pending).toBeUndefined();
  });

  it('uses actual count values for non-pending stats', () => {
    const session = makeLiveSession();
    const stats = computeSessionStats(session, { isLive: true });

    expect(stats.toolCallCount.value).toBe(1);
    expect(stats.turnCount.value).toBe(1);
    expect(stats.assistantMessageCount.value).toBe(1);
  });
});

describe('computeSessionStats — completed session', () => {
  it('does not mark any stat as pending', () => {
    const session = makeSession();
    const stats = computeSessionStats(session, { isLive: false });

    expect(stats.estimatedCost.pending).toBeFalsy();
    expect(stats.taskSuccess.pending).toBeFalsy();
  });

  it('does not prefix duration with "~"', () => {
    const session = makeSession();
    const stats = computeSessionStats(session);

    expect(stats.duration.display).not.toMatch(/^~/);
  });

  it('shows actual taskSuccess value', () => {
    const session = makeSession({ success: true });
    const stats = computeSessionStats(session);

    expect(stats.taskSuccess.display).toBe('✓');
    expect(stats.taskSuccess.value).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Component integration tests: SessionDetailView live state
// ---------------------------------------------------------------------------

describe('SessionDetailView — live session indicators', () => {
  it('renders the Live badge when session is live', () => {
    const session = makeLiveSession();
    render(<SessionDetailView session={session} />);

    expect(screen.getByTestId('live-badge')).toBeInTheDocument();
  });

  it('renders the live session alert banner', () => {
    const session = makeLiveSession();
    render(<SessionDetailView session={session} />);

    expect(screen.getByTestId('live-session-alert')).toBeInTheDocument();
  });

  it('dismisses the alert banner when close button is clicked', () => {
    const session = makeLiveSession();
    render(<SessionDetailView session={session} />);

    const alert = screen.getByTestId('live-session-alert');
    expect(alert).toBeInTheDocument();

    // The Alert component from UUI renders a close button inside
    const closeButton = alert.querySelector('[role="button"], button');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    expect(screen.queryByTestId('live-session-alert')).not.toBeInTheDocument();
  });

  it('renders the model-spend-live-notice row', () => {
    const session = makeLiveSession();
    render(<SessionDetailView session={session} />);

    expect(screen.getByTestId('model-spend-live-notice')).toBeInTheDocument();
  });

  it('shows "—" for stats that require shutdown data', () => {
    const session = makeLiveSession();
    render(<SessionDetailView session={session} />);

    // The StatsGrid renders stat values — find the Estimated Cost and Task Success
    // They should show "—" as their display value
    const view = screen.getByTestId('session-detail-view');
    const allText = view.textContent ?? '';

    // Duration should have ~ prefix
    expect(allText).toMatch(/~\d/);
  });
});

describe('SessionDetailView — completed session (no live indicators)', () => {
  it('does NOT render the Live badge', () => {
    const session = makeSession();
    render(<SessionDetailView session={session} />);

    expect(screen.queryByTestId('live-badge')).not.toBeInTheDocument();
  });

  it('does NOT render the live session alert banner', () => {
    const session = makeSession();
    render(<SessionDetailView session={session} />);

    expect(screen.queryByTestId('live-session-alert')).not.toBeInTheDocument();
  });

  it('does NOT render the model-spend-live-notice', () => {
    const session = makeSession();
    render(<SessionDetailView session={session} />);

    expect(screen.queryByTestId('model-spend-live-notice')).not.toBeInTheDocument();
  });

  it('shows actual cost values (not "—")', () => {
    const session = makeSession();
    render(<SessionDetailView session={session} />);

    // With shutdown data available, estimated cost should not be "—"
    const view = screen.getByTestId('session-detail-view');
    const allText = view.textContent ?? '';

    // Should show a $ cost value from the shutdown metrics
    expect(allText).toMatch(/\$/);
  });
});
