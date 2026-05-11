/**
 * Tests for per-tab KPI compute functions and severity functions.
 *
 * Covers:
 *   - computeCostKpis / costKpiSeverity
 *   - computeToolKpis / toolKpiSeverity
 *   - computeTimelineKpis / timelineKpiSeverity
 */

import type { ModelMetrics, Session, ShutdownMetrics } from '@agent-profiler/core';
import { describe, expect, it, vi } from 'vitest';

import { computeCostKpis, costKpiSeverity } from '../src/session-detail/cost-kpis';
import type { HotConsumptionResult } from '../src/session-detail/hot-consumption';
import type { ModelSpendResult } from '../src/session-detail/model-spend';
import type { StatEntry } from '../src/session-detail/session-stats';
import { computeTimelineKpis, timelineKpiSeverity } from '../src/session-detail/timeline-kpis';
import type { ToolInventoryResult } from '../src/session-detail/tool-inventory';
import { computeToolKpis, toolKpiSeverity } from '../src/session-detail/tool-kpis';
import type { ToolFrequencyRow, ToolStatsResult } from '../src/session-detail/tool-stats';

// ---------------------------------------------------------------------------
// CSS module mock — returns class name as-is
// ---------------------------------------------------------------------------

vi.mock('../src/session-detail/session-detail.module.css', () => ({
  default: new Proxy({}, { get: (_, p) => String(p) }),
}));

// ---------------------------------------------------------------------------
// Fixture helpers
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
    sessionId: 'test-session-001',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp/test',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:15:00Z',
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: makeShutdown(),
    success: true,
    fanoutTurns: [],
    turns: [{ turnId: 't1' }, { turnId: 't2' }, { turnId: 't3' }],
    parseStatus: { status: 'ok' as const, error: null },
    utilisation: [],
    ...overrides,
  } as Session;
}

function makeModelSpend(overrides?: Partial<ModelSpendResult>): ModelSpendResult {
  return {
    rows: [
      {
        model: 'claude-sonnet-4-20250514',
        requestCount: 5,
        premiumRequests: null,
        premiumRequestCostUsd: 3.5,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
        estimatedUsd: 3.5,
      },
    ],
    totals: {
      requestCount: 5,
      premiumRequests: 0,
      premiumRequestCostUsd: 3.5,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 100,
      estimatedUsd: 3.5,
    },
    confidence: 'estimated',
    source: 'shutdown',
    ...overrides,
  };
}

function makeHotConsumption(overrides?: Partial<HotConsumptionResult>): HotConsumptionResult {
  return {
    entries: [
      {
        rank: 1,
        time: '2025-01-15T10:01:00Z',
        type: 'turn',
        where: 'Turn #1',
        model: 'claude-sonnet-4-20250514',
        tokens: 5000,
        estimatedUsd: 0.5,
        proportion: 1,
        detail: 'First turn',
        childSessionRef: null,
      },
    ],
    totalEntries: 1,
    totalTokens: 5000,
    topNTokens: 5000,
    ...overrides,
  };
}

function makeToolStats(): ToolStatsResult {
  return {
    tokenStats: [],
    frequencyStats: [],
    tokenTotals: { callCount: 0, totalTokens: 0, totalUsd: null },
  };
}

function makeToolInventory(overrides?: Partial<ToolInventoryResult>): ToolInventoryResult {
  return {
    categories: [],
    totalTools: 12,
    totalCalls: 45,
    toolDefinitionsTokens: 25000,
    ...overrides,
  };
}

function makeFrequencyRows(callCount: number): readonly ToolFrequencyRow[] {
  return [{ tool: 'bash', callCount, proportion: 1 }];
}

// ===========================================================================
//  computeCostKpis
// ===========================================================================

describe('computeCostKpis', () => {
  it('returns correct labels, values, and display for happy path', () => {
    const result = computeCostKpis(makeModelSpend(), makeHotConsumption(), false);
    expect(result).toHaveLength(5);

    expect(result[0]!.label).toBe('Total Cost');
    expect(result[0]!.value).toBe(3.5);
    expect(result[0]!.display).toBe('$3.50');

    expect(result[1]!.label).toBe('Models Used');
    expect(result[1]!.value).toBe(1);

    expect(result[2]!.label).toBe('API Requests');
    expect(result[2]!.value).toBe(5);

    expect(result[3]!.label).toBe('Cache Hit Rate');
    // 200 / 1000 = 20%
    expect(result[3]!.value).toBeCloseTo(20, 0);
    expect(result[3]!.display).toBe('20%');

    expect(result[4]!.label).toBe('Hottest Turn');
    expect(result[4]!.value).toBe(5000);
    expect(result[4]!.display).toBe('5K');
  });

  it('handles null modelSpend gracefully', () => {
    const result = computeCostKpis(null, makeHotConsumption(), false);

    expect(result[0]!.value).toBeNull();
    expect(result[0]!.display).toBe('—');

    expect(result[1]!.value).toBe(0);
    expect(result[2]!.value).toBe(0);

    expect(result[3]!.value).toBeNull();
    expect(result[3]!.display).toBe('—');
  });

  it('handles empty hotConsumption entries', () => {
    const result = computeCostKpis(
      makeModelSpend(),
      makeHotConsumption({ entries: [] }),
      false,
    );
    expect(result[4]!.value).toBeNull();
    expect(result[4]!.display).toBe('—');
  });

  it('marks Total Cost as pending when isLive', () => {
    const result = computeCostKpis(makeModelSpend(), makeHotConsumption(), true);
    expect(result[0]!.pending).toBe(true);
  });

  it('does not mark Total Cost as pending when not live', () => {
    const result = computeCostKpis(makeModelSpend(), makeHotConsumption(), false);
    expect(result[0]!.pending).toBeUndefined();
  });

  describe('cache hit rate edge cases', () => {
    it('returns null when denominator is zero', () => {
      const spend = makeModelSpend({
        totals: {
          requestCount: 0,
          premiumRequests: 0,
          premiumRequestCostUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedUsd: 0,
        },
      });
      const result = computeCostKpis(spend, makeHotConsumption(), false);
      expect(result[3]!.value).toBeNull();
      expect(result[3]!.display).toBe('—');
    });

    it('returns 100% when all input is cache read', () => {
      const spend = makeModelSpend({
        totals: {
          requestCount: 1,
          premiumRequests: 0,
          premiumRequestCostUsd: 0,
          inputTokens: 500,
          outputTokens: 100,
          cacheReadTokens: 500,
          cacheWriteTokens: 0,
          estimatedUsd: 0,
        },
      });
      const result = computeCostKpis(spend, makeHotConsumption(), false);
      expect(result[3]!.value).toBe(100);
      expect(result[3]!.display).toBe('100%');
    });

    it('returns 0% when no cache reads', () => {
      const spend = makeModelSpend({
        totals: {
          requestCount: 1,
          premiumRequests: 0,
          premiumRequestCostUsd: 0,
          inputTokens: 500,
          outputTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedUsd: 0,
        },
      });
      const result = computeCostKpis(spend, makeHotConsumption(), false);
      expect(result[3]!.value).toBe(0);
      expect(result[3]!.display).toBe('0%');
    });
  });
});

// ===========================================================================
//  costKpiSeverity
// ===========================================================================

describe('costKpiSeverity', () => {
  it('returns pending class for index 0 when pending', () => {
    const stat: StatEntry = { value: 1, display: '$1.00', label: 'Total Cost', pending: true };
    expect(costKpiSeverity(0, stat)).toBe('statCardPending');
  });

  it('returns critical for index 0 when cost > $20', () => {
    const stat: StatEntry = { value: 25, display: '$25.00', label: 'Total Cost' };
    expect(costKpiSeverity(0, stat)).toBe('statCardCritical');
  });

  it('returns warning for index 0 when cost > $5 but <= $20', () => {
    const stat: StatEntry = { value: 10, display: '$10.00', label: 'Total Cost' };
    expect(costKpiSeverity(0, stat)).toBe('statCardWarning');
  });

  it('returns empty for index 0 when cost <= $5', () => {
    const stat: StatEntry = { value: 3, display: '$3.00', label: 'Total Cost' };
    expect(costKpiSeverity(0, stat)).toBe('');
  });

  it('returns warning for index 3 when cache hit rate < 30', () => {
    const stat: StatEntry = { value: 15, display: '15%', label: 'Cache Hit Rate' };
    expect(costKpiSeverity(3, stat)).toBe('statCardWarning');
  });

  it('returns empty for index 3 when cache hit rate >= 30', () => {
    const stat: StatEntry = { value: 50, display: '50%', label: 'Cache Hit Rate' };
    expect(costKpiSeverity(3, stat)).toBe('');
  });

  it('returns empty for unhandled indices', () => {
    const stat: StatEntry = { value: 999, display: '999', label: 'Other' };
    expect(costKpiSeverity(1, stat)).toBe('');
    expect(costKpiSeverity(2, stat)).toBe('');
    expect(costKpiSeverity(4, stat)).toBe('');
  });
});

// ===========================================================================
//  computeToolKpis
// ===========================================================================

describe('computeToolKpis', () => {
  it('returns correct labels and values for happy path', () => {
    const result = computeToolKpis(
      makeToolStats(),
      makeFrequencyRows(20),
      makeToolInventory(),
    );
    expect(result).toHaveLength(4);

    expect(result[0]!.label).toBe('Unique Tools');
    expect(result[0]!.value).toBe(12);

    expect(result[1]!.label).toBe('Total Calls');
    expect(result[1]!.value).toBe(45);

    expect(result[2]!.label).toBe('Top Tool');
    expect(result[2]!.value).toBe(20);
    expect(result[2]!.display).toBe('20');

    expect(result[3]!.label).toBe('Def. Tokens');
    expect(result[3]!.value).toBe(25000);
    expect(result[3]!.display).toBe('25K');
  });

  it('handles empty frequency rows', () => {
    const result = computeToolKpis(makeToolStats(), [], makeToolInventory());
    expect(result[2]!.value).toBeNull();
    expect(result[2]!.display).toBe('—');
  });

  it('handles null toolDefinitionsTokens', () => {
    const result = computeToolKpis(
      makeToolStats(),
      makeFrequencyRows(5),
      makeToolInventory({ toolDefinitionsTokens: null }),
    );
    expect(result[3]!.value).toBeNull();
    expect(result[3]!.display).toBe('—');
  });
});

// ===========================================================================
//  toolKpiSeverity
// ===========================================================================

describe('toolKpiSeverity', () => {
  it('returns critical for index 3 when tokens > 60000', () => {
    const stat: StatEntry = { value: 70000, display: '70K', label: 'Def. Tokens' };
    expect(toolKpiSeverity(3, stat)).toBe('statCardCritical');
  });

  it('returns warning for index 3 when tokens > 30000 but <= 60000', () => {
    const stat: StatEntry = { value: 40000, display: '40K', label: 'Def. Tokens' };
    expect(toolKpiSeverity(3, stat)).toBe('statCardWarning');
  });

  it('returns empty for index 3 when tokens <= 30000', () => {
    const stat: StatEntry = { value: 25000, display: '25K', label: 'Def. Tokens' };
    expect(toolKpiSeverity(3, stat)).toBe('');
  });

  it('returns empty for unhandled indices', () => {
    const stat: StatEntry = { value: 999, display: '999', label: 'Other' };
    expect(toolKpiSeverity(0, stat)).toBe('');
    expect(toolKpiSeverity(1, stat)).toBe('');
    expect(toolKpiSeverity(2, stat)).toBe('');
  });
});

// ===========================================================================
//  computeTimelineKpis
// ===========================================================================

describe('computeTimelineKpis', () => {
  it('returns correct labels and values for happy path', () => {
    const session = makeSession();
    const result = computeTimelineKpis(session, false);
    expect(result).toHaveLength(5);

    expect(result[0]!.label).toBe('Turns');
    expect(result[0]!.value).toBe(3);

    expect(result[1]!.label).toBe('Duration');
    // 15 minutes = 900_000ms
    expect(result[1]!.value).toBe(900_000);
    expect(result[1]!.display).toBe('15m');

    expect(result[2]!.label).toBe('Compactions');
    expect(result[2]!.value).toBe(0);

    expect(result[3]!.label).toBe('Fan-outs');
    expect(result[3]!.value).toBe(0);

    expect(result[4]!.label).toBe('Avg Turn');
    // 900_000 / 3 = 300_000ms = 5m
    expect(result[4]!.value).toBe(300_000);
    expect(result[4]!.display).toBe('5m');
  });

  it('handles session with no turns (avg turn guard)', () => {
    const session = makeSession({ turns: [] });
    const result = computeTimelineKpis(session, false);

    expect(result[0]!.value).toBe(0);
    expect(result[4]!.value).toBeNull();
    expect(result[4]!.display).toBe('—');
  });

  it('handles null timestamps', () => {
    const session = makeSession({ startTs: null, endTs: null });
    const result = computeTimelineKpis(session, false);

    expect(result[1]!.value).toBeNull();
    expect(result[1]!.display).toBe('—');
    expect(result[4]!.value).toBeNull();
    expect(result[4]!.display).toBe('—');
  });

  it('prefixes duration with ~ when isLive', () => {
    const session = makeSession({
      startTs: new Date(Date.now() - 60000).toISOString(),
      endTs: null,
      shutdown: null,
    });
    const result = computeTimelineKpis(session, true);

    expect(result[1]!.display).toMatch(/^~/);
    expect(result[1]!.value).toBeGreaterThan(0);
  });

  it('computes compactions count correctly', () => {
    const session = makeSession({
      compactions: [
        { timestamp: '2025-01-15T10:05:00Z', inputTokens: 5000, outputTokens: 2000, cacheRead: 0, cacheWrite: 0, model: null, turnId: null },
        { timestamp: '2025-01-15T10:10:00Z', inputTokens: 4000, outputTokens: 1500, cacheRead: 0, cacheWrite: 0, model: null, turnId: null },
      ] as Session['compactions'],
    });
    const result = computeTimelineKpis(session, false);
    expect(result[2]!.value).toBe(2);
  });
});

// ===========================================================================
//  timelineKpiSeverity
// ===========================================================================

describe('timelineKpiSeverity', () => {
  it('returns critical for index 2 when compactions > 8', () => {
    const stat: StatEntry = { value: 10, display: '10', label: 'Compactions' };
    expect(timelineKpiSeverity(2, stat)).toBe('statCardCritical');
  });

  it('returns warning for index 2 when compactions > 3 but <= 8', () => {
    const stat: StatEntry = { value: 5, display: '5', label: 'Compactions' };
    expect(timelineKpiSeverity(2, stat)).toBe('statCardWarning');
  });

  it('returns empty for index 2 when compactions <= 3', () => {
    const stat: StatEntry = { value: 2, display: '2', label: 'Compactions' };
    expect(timelineKpiSeverity(2, stat)).toBe('');
  });

  it('returns warning for index 4 when avg turn > 120000ms', () => {
    const stat: StatEntry = { value: 150000, display: '2m 30s', label: 'Avg Turn' };
    expect(timelineKpiSeverity(4, stat)).toBe('statCardWarning');
  });

  it('returns empty for index 4 when avg turn <= 120000ms', () => {
    const stat: StatEntry = { value: 60000, display: '1m', label: 'Avg Turn' };
    expect(timelineKpiSeverity(4, stat)).toBe('');
  });

  it('returns empty for unhandled indices', () => {
    const stat: StatEntry = { value: 999, display: '999', label: 'Other' };
    expect(timelineKpiSeverity(0, stat)).toBe('');
    expect(timelineKpiSeverity(1, stat)).toBe('');
    expect(timelineKpiSeverity(3, stat)).toBe('');
  });
});
