/**
 * Tests for comparative table UI components.
 */

import type { BenchRunAggregation, SessionSummaryRow, ModelUsageRollup, ToolUsageSummary } from '@agent-profiler/core';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach, vi } from 'vitest';

import { ComparativeTable } from '../src/comparative/ComparativeTable';
import { CostSummary } from '../src/comparative/CostSummary';
import { ModelBreakdownTable } from '../src/comparative/ModelBreakdownTable';
import { SessionListTable } from '../src/comparative/SessionListTable';
import { ToolFanoutMatrix } from '../src/comparative/ToolFanoutMatrix';

afterEach(cleanup);

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<SessionSummaryRow>): SessionSummaryRow {
  return {
    sessionId: 'sess-1',
    label: 'Variant A / Step 1',
    variantId: 'v1',
    stepIndex: 0,
    wallTimeMs: 330_000,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCost: 1.5,
    turnCount: 10,
    toolCallCount: 5,
    models: ['claude-sonnet'],
    parseStatus: 'ok',
    ...overrides,
  };
}

function makeModelUsage(overrides?: Partial<ModelUsageRollup>): ModelUsageRollup {
  return {
    model: 'claude-sonnet',
    totalInputTokens: 5000,
    totalOutputTokens: 2000,
    totalCacheReadTokens: 1000,
    totalCacheWriteTokens: 500,
    totalCost: 3.5,
    sessionCount: 2,
    ...overrides,
  };
}

function makeToolUsage(overrides?: Partial<ToolUsageSummary>): ToolUsageSummary {
  return {
    toolName: 'bash',
    callCount: 20,
    totalDurationMs: 5000,
    successCount: 18,
    failureCount: 2,
    models: ['claude-sonnet'],
    ...overrides,
  };
}

function makeAggregation(overrides?: Partial<BenchRunAggregation>): BenchRunAggregation {
  return {
    sessions: [
      makeSession({ sessionId: 'sess-1', label: 'Alpha', totalCost: 1.5, wallTimeMs: 60_000, turnCount: 5 }),
      makeSession({ sessionId: 'sess-2', label: 'Beta', totalCost: 2.5, wallTimeMs: 120_000, turnCount: 15 }),
    ],
    modelUsage: [makeModelUsage()],
    toolUsage: [makeToolUsage()],
    totalCost: 4.0,
    totalWallTimeMs: 180_000,
    variantCount: 2,
    sessionCount: 2,
    ...overrides,
  };
}

// ─── SessionListTable ────────────────────────────────────────────────────────

describe('SessionListTable', () => {
  it('renders correct number of rows', () => {
    const sessions = [
      makeSession({ sessionId: 's1', label: 'A' }),
      makeSession({ sessionId: 's2', label: 'B' }),
      makeSession({ sessionId: 's3', label: 'C' }),
    ];
    render(<SessionListTable sessions={sessions} />);
    const rows = screen.getAllByRole('row');
    // 1 header + 3 data rows
    expect(rows).toHaveLength(4);
  });

  it('sorts sessions by column on header click', () => {
    const sessions = [
      makeSession({ sessionId: 's1', label: 'Zebra', turnCount: 3 }),
      makeSession({ sessionId: 's2', label: 'Alpha', turnCount: 10 }),
    ];
    const { container } = render(<SessionListTable sessions={sessions} />);

    // Default sort by label ascending → Alpha first
    const getFirstDataCell = () => container.querySelectorAll('tbody tr td')[0]?.textContent;
    expect(getFirstDataCell()).toBe('Alpha');

    // Click "Turns" header to sort by turnCount ascending → Zebra (3) first
    fireEvent.click(screen.getByText(/^Turns/));
    expect(getFirstDataCell()).toBe('Zebra');
  });

  it('calls onSessionClick when row clicked', () => {
    const handler = vi.fn();
    const sessions = [makeSession({ sessionId: 'click-test', label: 'Test' })];
    render(<SessionListTable sessions={sessions} onSessionClick={handler} />);

    const row = screen.getAllByRole('row')[1]!; // first data row
    fireEvent.click(row);
    expect(handler).toHaveBeenCalledWith('click-test');
  });

  it('shows correct status icons', () => {
    const sessions = [
      makeSession({ sessionId: 's1', label: 'OK', parseStatus: 'ok' }),
      makeSession({ sessionId: 's2', label: 'Partial', parseStatus: 'partial' }),
      makeSession({ sessionId: 's3', label: 'Error', parseStatus: 'error' }),
    ];
    render(<SessionListTable sessions={sessions} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('⚠')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });
});

// ─── ModelBreakdownTable ─────────────────────────────────────────────────────

describe('ModelBreakdownTable', () => {
  it('shows correct totals in footer', () => {
    const usage = [
      makeModelUsage({ model: 'model-a', totalCost: 2.0, totalInputTokens: 1000, sessionCount: 1 }),
      makeModelUsage({ model: 'model-b', totalCost: 3.0, totalInputTokens: 2000, sessionCount: 1 }),
    ];
    render(<ModelBreakdownTable modelUsage={usage} />);

    const totalsRow = screen.getByTestId('model-totals-row');
    expect(totalsRow).toHaveTextContent('$5.00');
    expect(totalsRow).toHaveTextContent('3K'); // 1000+2000 = 3000 → 3K
  });

  it('sorts by cost descending', () => {
    const usage = [
      makeModelUsage({ model: 'cheap', totalCost: 1.0 }),
      makeModelUsage({ model: 'expensive', totalCost: 10.0 }),
    ];
    render(<ModelBreakdownTable modelUsage={usage} />);

    const rows = screen.getAllByRole('row');
    // header, expensive row, cheap row, footer
    expect(rows[1]).toHaveTextContent('expensive');
    expect(rows[2]).toHaveTextContent('cheap');
  });
});

// ─── ToolFanoutMatrix ────────────────────────────────────────────────────────

describe('ToolFanoutMatrix', () => {
  it('computes success rate correctly', () => {
    const tools = [makeToolUsage({ successCount: 8, failureCount: 2 })]; // 80%
    render(<ToolFanoutMatrix toolUsage={tools} />);
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('sorts by call count descending', () => {
    const tools = [
      makeToolUsage({ toolName: 'less-used', callCount: 5 }),
      makeToolUsage({ toolName: 'most-used', callCount: 50 }),
    ];
    render(<ToolFanoutMatrix toolUsage={tools} />);

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('most-used');
    expect(rows[2]).toHaveTextContent('less-used');
  });

  it('shows 100% success rate when no calls', () => {
    const tools = [makeToolUsage({ successCount: 0, failureCount: 0 })];
    render(<ToolFanoutMatrix toolUsage={tools} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

// ─── CostSummary ─────────────────────────────────────────────────────────────

describe('CostSummary', () => {
  it('displays formatted cost values', () => {
    const agg = makeAggregation({ totalCost: 4.0, sessionCount: 2, variantCount: 2, totalWallTimeMs: 180_000 });
    render(<CostSummary aggregation={agg} />);

    expect(screen.getByTestId('total-cost')).toHaveTextContent('$4.00');
    expect(screen.getByTestId('session-count')).toHaveTextContent('2');
    expect(screen.getByTestId('variant-count')).toHaveTextContent('2');
    expect(screen.getByTestId('total-wall-time')).toHaveTextContent('03:00');
    expect(screen.getByTestId('avg-cost')).toHaveTextContent('$2.00');
  });

  it('shows dash when cost is null', () => {
    const agg = makeAggregation({ totalCost: null });
    render(<CostSummary aggregation={agg} />);
    expect(screen.getByTestId('total-cost')).toHaveTextContent('—');
    expect(screen.getByTestId('avg-cost')).toHaveTextContent('—');
  });
});

// ─── ComparativeTable (integration) ─────────────────────────────────────────

describe('ComparativeTable', () => {
  it('renders all sub-sections', () => {
    const agg = makeAggregation();
    render(<ComparativeTable aggregation={agg} />);

    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Model Breakdown' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tool Usage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cost Summary' })).toBeInTheDocument();
  });

  it('handles empty aggregation gracefully', () => {
    const emptyAgg: BenchRunAggregation = {
      sessions: [],
      modelUsage: [],
      toolUsage: [],
      totalCost: null,
      totalWallTimeMs: 0,
      variantCount: 0,
      sessionCount: 0,
    };
    render(<ComparativeTable aggregation={emptyAgg} />);

    expect(screen.getByTestId('total-cost')).toHaveTextContent('—');
    expect(screen.getByTestId('session-count')).toHaveTextContent('0');
  });

  it('passes onSessionClick to session list', () => {
    const handler = vi.fn();
    const agg = makeAggregation();
    render(<ComparativeTable aggregation={agg} onSessionClick={handler} />);

    const rows = screen.getAllByRole('row');
    // Click first data row in sessions table (skip headers from multiple tables)
    const sessionRows = rows.filter((r) => r.textContent?.includes('Alpha') || r.textContent?.includes('Beta'));
    if (sessionRows[0]) fireEvent.click(sessionRows[0]);
    expect(handler).toHaveBeenCalled();
  });
});
