/**
 * Tests for EfficiencyChart — hand-crafted SVG chart showing cost savings % over time,
 * decomposed into cache savings (green) and routing savings (blue) stacked areas.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { screen, cleanup, fireEvent } from '@testing-library/react';

import type { PricingTable } from '@agent-profiler/pricing';
import type { DailyAnalytics } from '../src/renderer/components/CombinedAnalyticsChart';
import { EfficiencyChart } from '../src/renderer/components/EfficiencyChart';

import { render } from './test-utils';

afterEach(() => {
  cleanup();
});

/** Pricing table with a single model for deterministic test maths. */
const TEST_PRICING: PricingTable = {
  'test-model': { input: 10, cacheRead: 1, cacheWrite: 1, output: 30 },
};

/** Pricing table with two models at different rates, for decomposition tests. */
const MIXED_PRICING: PricingTable = {
  'expensive-model': { input: 10, cacheRead: 1, cacheWrite: 1, output: 30 },
  'cheap-model': { input: 2, cacheRead: 0.5, cacheWrite: 0.5, output: 6 },
};

function makeDay(
  overrides: Partial<DailyAnalytics> & { date: string },
): DailyAnalytics {
  return {
    cost: null,
    wallTimeMs: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    modelBreakdown: [],
    ...overrides,
  };
}

describe('EfficiencyChart', () => {
  // ── Test 1: empty data ───────────────────────────────────────────────────────
  it('renders empty state when data is empty', async () => {
    await render(<EfficiencyChart data={[]} pricingTable={TEST_PRICING} />);

    expect(screen.getByText('No data for efficiency chart.')).toBeDefined();
  });

  // ── Test 2: SVG renders with valid data ───────────────────────────────────
  it('renders the SVG chart with data-testid when data is provided', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 200_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    const svg = container.querySelector('[data-testid="efficiency-chart"]');
    expect(svg).not.toBeNull();
  });

  // ── Test 3: efficiency line path is rendered ──────────────────────────────
  it('renders the efficiency line path when efficiency is computable', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 200_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    const line = container.querySelector('[data-testid="efficiency-line"]');
    expect(line).not.toBeNull();
    // Line should have a non-empty path
    expect(line!.getAttribute('d')).not.toBe('');
  });

  // ── Test 4: savings computation is correct ────────────────────────────────
  it('displays the correct savings percentage in the tooltip', async () => {
    // TEST_PRICING: input=10, output=30 per million tokens
    // maxInputRate=10, maxOutputRate=30
    // inputTokens=100_000, outputTokens=100_000
    // worstCaseCost = (100_000 * 10 + 100_000 * 30) / 1_000_000 = 1.0 + 3.0 = 4.0
    // actualCost = 2.0
    // totalSavingsPct = 1 - (2.0 / 4.0) = 0.50 → 50.0%
    // modelBreakdown=[] → all savings attributed to cache, routing = 0%
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 2.0, inputTokens: 100_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    // Trigger tooltip via hit rect (not dot — dots are non-interactive now)
    const hitCol = container.querySelector('[data-testid="hit-col-0"]');
    expect(hitCol).not.toBeNull();

    fireEvent.mouseEnter(hitCol!);

    const tooltip = container.querySelector('[data-testid="efficiency-tooltip"]');
    expect(tooltip).not.toBeNull();
    const text = tooltip!.textContent ?? '';
    expect(text).toContain('50.0%');
    expect(text).toContain('You paid: $2.00');
    expect(text).toContain('Worst case: $4.00');
    expect(text).toContain('You saved: $2.00');
  });

  // ── Test 5: null-cost days produce no dot (gap in line) ───────────────────
  it('skips dots for null-cost days (gap in line)', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
          makeDay({ date: '2024-05-02', cost: null, inputTokens: 80_000, outputTokens: 40_000 }),
          makeDay({ date: '2024-05-03', cost: 0.20, inputTokens: 200_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    // Only 2 dots for the 2 non-null days (idx uses original array position)
    expect(container.querySelector('[data-testid="efficiency-dot-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="efficiency-dot-1"]')).toBeNull();
    expect(container.querySelector('[data-testid="efficiency-dot-2"]')).not.toBeNull();
  });

  // ── Test 6: tooltip appears and disappears correctly ──────────────────────
  it('shows tooltip on mouseEnter and hides on mouseLeave on hit rect', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 1.0, inputTokens: 100_000, outputTokens: 100_000 }),
          makeDay({ date: '2024-05-02', cost: 2.0, inputTokens: 200_000, outputTokens: 200_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    expect(container.querySelector('[data-testid="efficiency-tooltip"]')).toBeNull();

    const hitCol = container.querySelector('[data-testid="hit-col-0"]')!;
    fireEvent.mouseEnter(hitCol);
    expect(container.querySelector('[data-testid="efficiency-tooltip"]')).not.toBeNull();

    fireEvent.mouseLeave(hitCol);
    expect(container.querySelector('[data-testid="efficiency-tooltip"]')).toBeNull();
  });

  // ── Test 7: zero-token day is handled gracefully ──────────────────────────
  it('handles a zero-token day gracefully (no crash, no dot)', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0, inputTokens: 0, outputTokens: 0 }),
          makeDay({ date: '2024-05-02', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    // Zero-token day should produce no dot (worstCaseCost is 0, savings is null)
    expect(container.querySelector('[data-testid="efficiency-dot-0"]')).toBeNull();
    // Normal day does render
    expect(container.querySelector('[data-testid="efficiency-dot-1"]')).not.toBeNull();
  });

  // ── Test 8: chart title is rendered ──────────────────────────────────────
  it('renders the "Cost Savings" chart title', async () => {
    await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    expect(screen.getByText('Cost Savings')).toBeDefined();
  });

  // ── Test 9: granularity label appears in tooltip ──────────────────────────
  it('uses the granularity hint in the tooltip date label', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 1.0, inputTokens: 100_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
        granularity="month"
      />,
    );

    // Trigger tooltip via hit rect
    const hitCol = container.querySelector('[data-testid="hit-col-0"]')!;
    fireEvent.mouseEnter(hitCol);

    const tooltip = container.querySelector('[data-testid="efficiency-tooltip"]')!;
    // Month granularity should produce "May 2024" style label
    expect(tooltip.textContent).toContain('2024');
  });

  // ── Test 10: decomposition — only expensive model → routing savings ≈ 0% ──
  it('attributes all savings to cache when a single expensive model is used', async () => {
    // MIXED_PRICING maxInputRate = 10 (expensive-model), maxOutputRate = 30
    // inputTokens=100_000, outputTokens=0
    // worstCaseCost = (100_000 * 10) / 1_000_000 = 1.0
    // modelBreakdown: expensive-model with 100_000 tokens
    //   sameModelsNoCacheCost = (100_000 * 10) / 1_000_000 = 1.0 = worstCaseCost → routing = 0%
    // actualCost = 0.5
    //   cacheSavingsPct = (1.0 - 0.5) / 1.0 = 0.5 → 50.0%
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.5,
            inputTokens: 100_000,
            outputTokens: 0,
            modelBreakdown: [{ model: 'expensive-model', totalTokens: 100_000, costUsd: 0.5 }],
          }),
        ]}
        pricingTable={MIXED_PRICING}
      />,
    );

    const hitCol = container.querySelector('[data-testid="hit-col-0"]')!;
    fireEvent.mouseEnter(hitCol);

    const tooltip = container.querySelector('[data-testid="efficiency-tooltip"]')!;
    const text = tooltip.textContent ?? '';
    expect(text).toContain('Routing savings: 0.0%');
    expect(text).toContain('Cache savings: 50.0%');
  });

  // ── Test 11: decomposition — mixed models → routing savings > 0% ─────────
  it('decomposes savings into routing and cache when mixed models are used', async () => {
    // MIXED_PRICING maxInputRate = 10, maxOutputRate = 30
    // inputTokens=100_000, outputTokens=0
    // worstCaseCost = (100_000 * 10) / 1_000_000 = 1.0
    // modelBreakdown: 50k tokens at expensive (input=10) + 50k tokens at cheap (input=2)
    //   sameModelsNoCacheCost = (50_000*10 + 50_000*2) / 1_000_000 = 0.5 + 0.1 = 0.6
    //   routingSavingsPct = (1.0 - 0.6) / 1.0 = 0.4 → 40.0%
    // actualCost = 0.3
    //   cacheSavingsPct = (0.6 - 0.3) / 1.0 = 0.3 → 30.0%
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({
            date: '2024-05-01',
            cost: 0.3,
            inputTokens: 100_000,
            outputTokens: 0,
            modelBreakdown: [
              { model: 'expensive-model', totalTokens: 50_000, costUsd: 0.5 },
              { model: 'cheap-model', totalTokens: 50_000, costUsd: 0.1 },
            ],
          }),
        ]}
        pricingTable={MIXED_PRICING}
      />,
    );

    const hitCol = container.querySelector('[data-testid="hit-col-0"]')!;
    fireEvent.mouseEnter(hitCol);

    const tooltip = container.querySelector('[data-testid="efficiency-tooltip"]')!;
    const text = tooltip.textContent ?? '';
    expect(text).toContain('Routing savings: 40.0%');
    expect(text).toContain('Cache savings: 30.0%');
  });

  // ── Test 12: hit targets rendered ────────────────────────────────────────
  it('renders one hit-col rect per data point', async () => {
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
          makeDay({ date: '2024-05-02', cost: 0.20, inputTokens: 200_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    expect(container.querySelector('[data-testid="hit-col-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hit-col-1"]')).not.toBeNull();
    // No third hit rect for a two-point dataset
    expect(container.querySelector('[data-testid="hit-col-2"]')).toBeNull();
  });
});
