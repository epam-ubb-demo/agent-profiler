/**
 * Tests for DailySpendChart – hand-crafted SVG bar chart showing cost per day.
 */

import { screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';

import type { DailyMetrics } from '../src/renderer/components/DailySpendChart';
import { DailySpendChart } from '../src/renderer/components/DailySpendChart';

import { render } from './test-utils';

afterEach(() => {
  cleanup();
});

function makeDay(overrides: Partial<DailyMetrics> & { date: string }): DailyMetrics {
  return {
    cost: 0,
    wallTimeMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    ...overrides,
  };
}

describe('DailySpendChart', () => {
  it('renders "No cost data" when data is empty', async () => {
    await render(<DailySpendChart data={[]} />);

    expect(screen.getByText('No cost data')).toBeDefined();
  });

  it('renders "No cost data" when all costs are zero', async () => {
    await render(
      <DailySpendChart
        data={[
          makeDay({ date: '2024-05-01' }),
          makeDay({ date: '2024-05-02' }),
        ]}
      />,
    );

    expect(screen.getByText('No cost data')).toBeDefined();
  });

  it('renders "No cost data" when all costs are null', async () => {
    await render(
      <DailySpendChart
        data={[
          makeDay({ date: '2024-05-01', cost: null }),
          makeDay({ date: '2024-05-02', cost: null }),
        ]}
      />,
    );

    expect(screen.getByText('No cost data')).toBeDefined();
  });

  it('renders SVG with data-testid when data is provided', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[
          makeDay({ date: '2024-05-10', cost: 0.15 }),
          makeDay({ date: '2024-05-11', cost: 0.32 }),
        ]}
      />,
    );

    const svg = container.querySelector('[data-testid="daily-spend-chart"]');
    expect(svg).not.toBeNull();
  });

  it('renders one bar rect per data point', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[
          makeDay({ date: '2024-05-10', cost: 0.10 }),
          makeDay({ date: '2024-05-11', cost: 0.20 }),
          makeDay({ date: '2024-05-12', cost: 0.30 }),
        ]}
      />,
    );

    const bars = container.querySelectorAll('[data-testid="spend-bar"]');
    expect(bars.length).toBe(3);
  });

  it('bar height is proportional to cost (taller bar for higher cost)', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[
          makeDay({ date: '2024-05-10', cost: 0.10 }),
          makeDay({ date: '2024-05-11', cost: 0.50 }),
        ]}
      />,
    );

    const bars = container.querySelectorAll('[data-testid="spend-bar"]');
    expect(bars.length).toBe(2);

    const h0 = parseFloat((bars[0] as SVGRectElement).getAttribute('height') ?? '0');
    const h1 = parseFloat((bars[1] as SVGRectElement).getAttribute('height') ?? '0');
    expect(h1).toBeGreaterThan(h0);
  });

  it('renders SVG with viewBox and responsive width', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[makeDay({ date: '2024-05-10', cost: 0.15 })]}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 800 200');
    expect(svg!.getAttribute('width')).toBe('100%');
  });

  it('bar tooltip includes all metrics on hover', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[makeDay({ date: '2024-05-10', cost: 0.15, wallTimeMs: 120_000, inputTokens: 5000, outputTokens: 3000, cacheReadTokens: 1000 })]}
      />,
    );

    const bar = container.querySelector('[data-testid="spend-bar"]');
    expect(bar).not.toBeNull();
    await fireEvent.mouseEnter(bar!);

    const tip = container.querySelector('[data-testid="chart-tooltip"]');
    expect(tip).not.toBeNull();
    const text = tip!.textContent ?? '';
    expect(text).toContain('$0.15');
    expect(text).toContain('2m');
    expect(text).toContain('In: 5.0K');
    expect(text).toContain('Out: 3.0K');
    expect(text).toContain('Cached: 1.0K');
  });

  it('shows dash for null cost and wallTime in tooltip', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[makeDay({ date: '2024-05-10', cost: 0.10 }), makeDay({ date: '2024-05-11', cost: null, wallTimeMs: null, inputTokens: 100 })]}
      />,
    );

    const bars = container.querySelectorAll('[data-testid="spend-bar"]');
    expect(bars.length).toBe(2);
    await fireEvent.mouseEnter(bars[1]!);

    const tip = container.querySelector('[data-testid="chart-tooltip"]');
    expect(tip).not.toBeNull();
    const text = tip!.textContent ?? '';
    expect(text).toContain('Cost: —');
    expect(text).toContain('Time: —');
    expect(text).toContain('In: 100');
  });

  it('renders with a single data point without errors', async () => {
    const { container } = await render(
      <DailySpendChart
        data={[makeDay({ date: '2024-05-10', cost: 1.23 })]}
      />,
    );

    const svg = container.querySelector('[data-testid="daily-spend-chart"]');
    expect(svg).not.toBeNull();
    const bars = container.querySelectorAll('[data-testid="spend-bar"]');
    expect(bars.length).toBe(1);
  });

  it('renders with a large number of data points without errors', async () => {
    const data = Array.from({ length: 30 }, (_, i) =>
      makeDay({ date: `2024-05-${String(i + 1).padStart(2, '0')}`, cost: 0.05 * (i + 1) }),
    );

    const { container } = await render(<DailySpendChart data={data} />);

    const bars = container.querySelectorAll('[data-testid="spend-bar"]');
    expect(bars.length).toBe(30);
  });

  it('has role="img" and aria-label on the SVG', async () => {
    const { container } = await render(
      <DailySpendChart data={[makeDay({ date: '2024-05-10', cost: 0.25 })]} />,
    );

    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('role')).toBe('img');
    expect(svg!.getAttribute('aria-label')).toBeTruthy();
  });
});
