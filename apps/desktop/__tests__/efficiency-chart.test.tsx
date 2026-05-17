/**
 * Tests for EfficiencyChart — hand-crafted SVG line chart showing cost efficiency % over time.
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

  // ── Test 4: efficiency computation is correct ─────────────────────────────
  it('displays the correct efficiency percentage in the tooltip', async () => {
    // TEST_PRICING: input=10, output=30 per million tokens
    // maxInputRate=10, maxOutputRate=30
    // inputTokens=100_000, outputTokens=100_000
    // naïveCost = (100_000 * 10 + 100_000 * 30) / 1_000_000 = 1.0 + 3.0 = 4.0
    // actualCost = 2.0
    // efficiency = 1 - (2.0 / 4.0) = 0.50 → 50.0%
    const { container } = await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 2.0, inputTokens: 100_000, outputTokens: 100_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    const dot = container.querySelector('[data-testid="efficiency-dot-0"]');
    expect(dot).not.toBeNull();

    fireEvent.mouseEnter(dot!);

    const tooltip = container.querySelector('[data-testid="efficiency-tooltip"]');
    expect(tooltip).not.toBeNull();
    const text = tooltip!.textContent ?? '';
    expect(text).toContain('50.0%');
    expect(text).toContain('Actual: $2.00');
    expect(text).toContain('Naïve: $4.00');
    expect(text).toContain('Savings: $2.00');
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

    // Only 2 dots for the 2 non-null days
    expect(container.querySelector('[data-testid="efficiency-dot-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="efficiency-dot-1"]')).toBeNull();
    expect(container.querySelector('[data-testid="efficiency-dot-2"]')).not.toBeNull();
  });

  // ── Test 6: tooltip appears and disappears correctly ──────────────────────
  it('shows tooltip on mouseEnter and hides on mouseLeave', async () => {
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

    const dot = container.querySelector('[data-testid="efficiency-dot-0"]')!;
    fireEvent.mouseEnter(dot);
    expect(container.querySelector('[data-testid="efficiency-tooltip"]')).not.toBeNull();

    fireEvent.mouseLeave(dot);
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

    // Zero-token day should produce no dot (naïveCost is 0, efficiency is null)
    expect(container.querySelector('[data-testid="efficiency-dot-0"]')).toBeNull();
    // Normal day does render
    expect(container.querySelector('[data-testid="efficiency-dot-1"]')).not.toBeNull();
  });

  // ── Test 8: chart title is rendered ──────────────────────────────────────
  it('renders the "Cost Efficiency" chart title', async () => {
    await render(
      <EfficiencyChart
        data={[
          makeDay({ date: '2024-05-01', cost: 0.10, inputTokens: 100_000, outputTokens: 50_000 }),
        ]}
        pricingTable={TEST_PRICING}
      />,
    );

    expect(screen.getByText('Cost Efficiency')).toBeDefined();
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

    const dot = container.querySelector('[data-testid="efficiency-dot-0"]')!;
    fireEvent.mouseEnter(dot);

    const tooltip = container.querySelector('[data-testid="efficiency-tooltip"]')!;
    // Month granularity should produce "May 2024" style label
    expect(tooltip.textContent).toContain('2024');
  });
});
