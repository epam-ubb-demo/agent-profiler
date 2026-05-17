/**
 * Tests for CombinedAnalyticsChart – dual-axis SVG chart (cost line + stacked model token areas).
 */

import { screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';

import type { DailyAnalytics } from '../src/renderer/components/CombinedAnalyticsChart';
import { CombinedAnalyticsChart } from '../src/renderer/components/CombinedAnalyticsChart';

import { render } from './test-utils';

afterEach(() => {
  cleanup();
});

function makeDay(
  overrides: Partial<DailyAnalytics> & { date: string },
): DailyAnalytics {
  const base = {
    cost: null,
    avgTokensPerCost: null,
    wallTimeMs: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    modelBreakdown: [],
    ...overrides,
  };
  
  // Auto-compute avgTokensPerCost if cost is provided
  if (base.cost != null && base.cost > 0) {
    const totalTokens = base.inputTokens + base.outputTokens + base.cacheReadTokens + base.cacheWriteTokens;
    base.avgTokensPerCost = totalTokens / base.cost;
  }
  
  return base;
}

describe('CombinedAnalyticsChart', () => {
  // ── Test 1: empty data ───────────────────────────────────────────────────────
  it('renders "No analytics data" when data is empty', async () => {
    await render(<CombinedAnalyticsChart data={[]} />);

    expect(screen.getByText('No analytics data')).toBeDefined();
  });

  // ── Test 2: all-null cost + no tokens ─────────────────────────────────────
  it('renders "No analytics data" when all costs are null and no tokens', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: null }),
          makeDay({ date: '2024-05-02', cost: null }),
        ]}
      />,
    );

    expect(screen.getByText('No analytics data')).toBeDefined();
  });

  // ── Test 3: basic SVG render ───────────────────────────────────────────────
  it('renders the SVG chart when data has cost values', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 2000 }),
        ]}
      />,
    );

    expect(screen.getByTestId('combined-analytics-chart')).toBeDefined();
  });

  // ── Test 4: avg-tk-cost-line test-id is on first segment ──────────────────
  it('renders avg-tk-cost-line element when avgTokensPerCost data is present', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 2000 }),
        ]}
      />,
    );

    expect(screen.getByTestId('avg-tk-cost-line')).toBeDefined();
  });

  // ── Test 5: no avg-tk-cost-line when all costs null but tokens present ────
  it('omits avg-tk-cost-line when all cost values are null', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: null,
            inputTokens: 1000,
            modelBreakdown: [{ model: 'gpt-4o', totalTokens: 1000, costUsd: null }],
          }),
          makeDay({
            date: '2024-05-02',
            cost: null,
            inputTokens: 2000,
            modelBreakdown: [{ model: 'gpt-4o', totalTokens: 2000, costUsd: null }],
          }),
        ]}
      />,
    );

    // Chart should render (tokens present), but no avg-tk-cost-line
    expect(screen.getByTestId('combined-analytics-chart')).toBeDefined();
    expect(screen.queryByTestId('avg-tk-cost-line')).toBeNull();
  });

  // ── Test 6: model-area elements rendered for each model ───────────────────
  it('renders model-area elements for each stacked model', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.10,
            modelBreakdown: [
              { model: 'gpt-4o', totalTokens: 1000, costUsd: 0.025 },
              { model: 'claude-3-5', totalTokens: 500, costUsd: null },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('model-area-0')).toBeDefined();
    expect(screen.getByTestId('model-area-1')).toBeDefined();
  });

  // ── Test 7: legend is rendered ────────────────────────────────────────────
  it('renders the chart legend', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000, outputTokens: 500 })]}
      />,
    );

    expect(screen.getByTestId('chart-legend')).toBeDefined();
  });

  // ── Test 8: legend includes avg tokens per cost entry ─────────────────────
  it('legend contains an Avg tokens per cost toggle button', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000, outputTokens: 500 })]}
      />,
    );

    const legend = screen.getByTestId('chart-legend');
    const avgTkCostBtn = legend.querySelector('button');
    expect(avgTkCostBtn).toBeDefined();
    expect(avgTkCostBtn?.textContent).toContain('Avg tokens per cost');
    // aria-pressed = true when visible (active)
    expect(avgTkCostBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  // ── Test 9: model legend buttons present ──────────────────────────────────
  it('legend contains a button per model in the breakdown', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.10,
            inputTokens: 1000,
            modelBreakdown: [
              { model: 'gpt-4o', totalTokens: 1000, costUsd: 0.025 },
              { model: 'claude-opus', totalTokens: 500, costUsd: null },
            ],
          }),
        ]}
      />,
    );

    const legend = screen.getByTestId('chart-legend');
    const buttons = legend.querySelectorAll('button');
    // Avg tokens per cost + 2 models = 3
    expect(buttons.length).toBe(3);
  });

  // ── Test 10: clicking avg tokens per cost legend hides line ───────────────
  it('toggles avg tokens per cost line visibility when legend button is clicked', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 2000 }),
        ]}
      />,
    );

    // Initially visible
    expect(screen.getByTestId('avg-tk-cost-line')).toBeDefined();

    const legend = screen.getByTestId('chart-legend');
    const avgTkCostBtn = legend.querySelector('button')!;

    // Click to hide
    fireEvent.click(avgTkCostBtn);
    expect(screen.queryByTestId('avg-tk-cost-line')).toBeNull();
    expect(avgTkCostBtn.getAttribute('aria-pressed')).toBe('false');

    // Click to show again
    fireEvent.click(avgTkCostBtn);
    expect(screen.getByTestId('avg-tk-cost-line')).toBeDefined();
    expect(avgTkCostBtn.getAttribute('aria-pressed')).toBe('true');
  });

  // ── Test 11: clicking model legend button hides area ─────────────────────
  it('toggles model area visibility when a model legend button is clicked', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.10,
            modelBreakdown: [{ model: 'gpt-4o', totalTokens: 1000, costUsd: 0.025 }],
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('model-area-0')).toBeDefined();

    const legend = screen.getByTestId('chart-legend');
    const buttons = legend.querySelectorAll('button');
    // buttons[0] = Cost, buttons[1] = gpt-4o
    fireEvent.click(buttons[1]!);
    expect(screen.queryByTestId('model-area-0')).toBeNull();
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false');
  });

  // ── Test 12: hit columns rendered ────────────────────────────────────────
  it('renders hit-col-N elements for each date column', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 2000 }),
          makeDay({ date: '2024-05-03', cost: 0.15, inputTokens: 1500 }),
        ]}
      />,
    );

    expect(screen.getByTestId('hit-col-0')).toBeDefined();
    expect(screen.getByTestId('hit-col-1')).toBeDefined();
    expect(screen.getByTestId('hit-col-2')).toBeDefined();
  });

  // ── Test 13: tooltip appears on column mouseenter ─────────────────────────
  it('shows tooltip when mouse enters a hit column', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, wallTimeMs: 120_000, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, wallTimeMs: 60_000, inputTokens: 2000 }),
        ]}
      />,
    );

    expect(screen.queryByTestId('chart-tooltip')).toBeNull();

    fireEvent.mouseEnter(screen.getByTestId('hit-col-0'));

    expect(screen.getByTestId('chart-tooltip')).toBeDefined();
  });

  // ── Test 14: tooltip disappears on mouseleave ─────────────────────────────
  it('hides tooltip when mouse leaves a hit column', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 2000 }),
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('hit-col-1'));
    expect(screen.getByTestId('chart-tooltip')).toBeDefined();

    fireEvent.mouseLeave(screen.getByTestId('hit-col-1'));
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  // ── Test 15: null-avgTokensPerCost break creates separate line segment ────
  it('still renders the chart SVG when some avgTokensPerCost values are null (null-break)', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 1000 }),
          makeDay({ date: '2024-05-02', cost: null, inputTokens: 2000 }),
          makeDay({ date: '2024-05-03', cost: 0.30, inputTokens: 3000 }),
        ]}
      />,
    );

    // Chart renders; first segment carries the testid
    expect(screen.getByTestId('combined-analytics-chart')).toBeDefined();
    expect(screen.getByTestId('avg-tk-cost-line')).toBeDefined();
  });

  // ── Test 16: tooltip shows per-model cost alongside token count ───────────
  it('shows per-model cost in tooltip when costUsd is provided', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.10,
            modelBreakdown: [
              { model: 'gpt-4o', totalTokens: 5000, costUsd: 0.05 },
              { model: 'unknown-model', totalTokens: 2000, costUsd: null },
            ],
          }),
          makeDay({ date: '2024-05-02', cost: 0.20 }),
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('hit-col-0'));

    const tooltip = screen.getByTestId('chart-tooltip');
    // Known-cost model: shows token count AND cost
    expect(tooltip.textContent).toContain('5.0K tk');
    expect(tooltip.textContent).toContain('$0.050');
    // Unknown-cost model: shows token count only (no cost)
    expect(tooltip.textContent).toContain('2.0K tk');
  });

  // ── Test 17: tooltip omits cost when costUsd is null ──────────────────────
  it('omits cost suffix in tooltip when costUsd is null', async () => {
    await render(
      <CombinedAnalyticsChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.10,
            modelBreakdown: [
              { model: 'unknown-model', totalTokens: 3000, costUsd: null },
            ],
          }),
          makeDay({ date: '2024-05-02', cost: 0.20 }),
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('hit-col-0'));

    const tooltip = screen.getByTestId('chart-tooltip');
    expect(tooltip.textContent).toContain('3.0K tk');
    // Should not show a dollar sign for the model row (only the total cost row)
    // The total-cost row shows '$0.100'; model row with null costUsd shows no '·'
    expect(tooltip.textContent).not.toContain('·');
  });
});
