/**
 * Tests for SVG chart components: ContextTokenTimeline, ModelTokenDistribution,
 * TokenCompositionChart, and TokensPerTurnChart.
 *
 * These are hand-crafted SVG charts with no external charting libraries.
 * Tests focus on rendering, data visualization, and edge cases.
 */

import type { Compaction, UtilisationSample, ModelMetrics } from '@agent-profiler/core';
import { screen, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';

import { ContextTokenTimeline } from '../src/session-detail/ContextTokenTimeline';
import { ModelTokenDistribution } from '../src/session-detail/ModelTokenDistribution';
import { TokenCompositionChart } from '../src/session-detail/TokenCompositionChart';
import { TokensPerTurnChart } from '../src/session-detail/TokensPerTurnChart';

import { render } from './test-utils';

afterEach(() => {
  cleanup();
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* ContextTokenTimeline Tests                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

describe('ContextTokenTimeline', () => {
  /**
   * Test 1: Renders empty state text when samples array is empty.
   */
  it('renders empty state text when samples array is empty', () => {
    render(<ContextTokenTimeline samples={[]} compactions={[]} />);

    expect(screen.getByText('No context-utilisation samples found in process log.')).toBeInTheDocument();
  });

  /**
   * Test 2: Renders SVG with polyline when given valid samples.
   */
  it('renders SVG with polyline when given valid samples', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:10Z',
        percentage: 60,
        used: 6000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const { container } = render(<ContextTokenTimeline samples={samples} compactions={[]} />);

    // Check SVG is rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('role', 'img');

    // Check for polyline (the main chart line)
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline).toHaveAttribute('stroke');
  });

  /**
   * Test 3: Renders compaction markers (vertical dashed lines) when compactions are provided.
   */
  it('renders compaction markers when compactions are provided', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:10Z',
        percentage: 60,
        used: 6000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const compactions: readonly Compaction[] = [
      {
        timestamp: '2024-01-01T10:00:05Z',
        inputTokens: 2000,
        outputTokens: 1000,
        cacheRead: 0,
        cacheWrite: 500,
        model: 'claude-3-sonnet',
        turnId: 'turn-1',
      },
    ];

    const { container } = render(
      <ContextTokenTimeline samples={samples} compactions={compactions} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Count the line elements (compaction markers are vertical lines)
    // There should be multiple lines: grid lines + compaction lines
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);

    // Check that the SVG title mentions compactions
    expect(svg).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 compaction event'),
    );
  });

  /**
   * Test 4: Does not render compaction legend when no compactions.
   */
  it('does not render compaction legend when no compactions', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const { container } = render(<ContextTokenTimeline samples={samples} compactions={[]} />);

    // Check that "Compaction" legend text is NOT in the SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
    // The legend text should not contain "Compaction"
    const textElements = container.querySelectorAll('text');
    const hasCompactionLegend = Array.from(textElements).some(
      (el) => el.textContent === 'Compaction',
    );
    expect(hasCompactionLegend).toBe(false);
  });

  /**
   * Test 5: Renders Y-axis labels using formatTokenCount.
   */
  it('renders Y-axis labels using formatTokenCount', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 1200,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:10Z',
        percentage: 60,
        used: 6000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const { container } = render(<ContextTokenTimeline samples={samples} compactions={[]} />);

    // Check for formatted token counts in text elements
    const textElements = container.querySelectorAll('text');
    const textContent = Array.from(textElements).map((el) => el.textContent);

    // Should have some Y-axis labels with K suffix (e.g., "5K", "10K")
    const hasFormattedTokens = textContent.some((text) => /\dK/.test(text ?? ''));
    expect(hasFormattedTokens).toBe(true);
  });

  /**
   * Test 6: Renders limit line when samples have non-zero total.
   */
  it('renders limit line when samples have non-zero total', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:10Z',
        percentage: 60,
        used: 6000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const { container } = render(<ContextTokenTimeline samples={samples} compactions={[]} />);

    // Check for "Limit:" text in SVG
    const textElements = container.querySelectorAll('text');
    const hasLimitText = Array.from(textElements).some((el) =>
      el.textContent?.includes('Limit:'),
    );
    expect(hasLimitText).toBe(true);

    // Check for limit line (should have critical color stroke)
    const limitLine = Array.from(container.querySelectorAll('line')).find(
      (line) => line.getAttribute('stroke-dasharray') === '6 3',
    );
    expect(limitLine).toBeInTheDocument();
  });

  /**
   * Test 7: Renders title and legend row.
   */
  it('renders title and legend row', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const { container } = render(<ContextTokenTimeline samples={samples} compactions={[]} />);

    const textElements = container.querySelectorAll('text');
    const textContent = Array.from(textElements).map((el) => el.textContent);

    // Check for title
    expect(textContent).toContain('Token usage over time');

    // Check for legend items
    expect(textContent).toContain('Token usage');
    expect(textContent).toContain('Window limit');
  });

  /**
   * Test 8: Compaction with null timestamp is ignored.
   */
  it('ignores compactions with null timestamp', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:10Z',
        percentage: 60,
        used: 6000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const compactions: readonly Compaction[] = [
      {
        timestamp: null,
        inputTokens: 2000,
        outputTokens: 1000,
        cacheRead: 0,
        cacheWrite: 500,
        model: 'claude-3-sonnet',
        turnId: 'turn-1',
      },
    ];

    const { container } = render(
      <ContextTokenTimeline samples={samples} compactions={compactions} />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('0 compaction event'));
  });

  /**
   * Test 9: Renders sample dots (circles) for each data point.
   */
  it('renders sample dots for each data point', () => {
    const samples: readonly UtilisationSample[] = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        percentage: 50,
        used: 5000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:10Z',
        percentage: 60,
        used: 6000,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
      {
        timestamp: '2024-01-01T10:00:20Z',
        percentage: 55,
        used: 5500,
        total: 10000,
        buckets: { system: 0, conversation: 0, toolDefinitions: 0 },
      },
    ];

    const { container } = render(<ContextTokenTimeline samples={samples} compactions={[]} />);

    const circles = container.querySelectorAll('circle');
    // Should have multiple circles: 3 for samples + 1 for background track (if any)
    // At minimum, should have the sample circles
    expect(circles.length).toBeGreaterThanOrEqual(3);
  });
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* ModelTokenDistribution Tests                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

describe('ModelTokenDistribution', () => {
  /**
   * Test 1: Renders empty state when modelMetrics is empty.
   */
  it('renders empty state when modelMetrics is empty', () => {
    render(<ModelTokenDistribution modelColours={{}} modelMetrics={[]} />);

    expect(screen.getByText('No model metrics available.')).toBeInTheDocument();
  });

  /**
   * Test 2: Renders "No token usage recorded" when all tokens are zero.
   */
  it('renders "No token usage recorded" when all tokens are zero', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'claude-3-sonnet',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    render(
      <ModelTokenDistribution
        modelColours={{ 'claude-3-sonnet': '#ff0000' }}
        modelMetrics={modelMetrics}
      />,
    );

    expect(screen.getByText('No token usage recorded.')).toBeInTheDocument();
  });

  /**
   * Test 3: Renders donut arcs and legend for a single model.
   */
  it('renders donut arcs and legend for a single model', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'claude-3-sonnet',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 100,
        cacheWriteTokens: 50,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{ 'claude-3-sonnet': '#ff0000' }}
        modelMetrics={modelMetrics}
      />,
    );

    // Check SVG is rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('role', 'img');

    // Check for legend item with model name
    expect(screen.getByText('claude-3-sonnet')).toBeInTheDocument();

    // Check for percentage in legend
    const textElements = container.querySelectorAll('text');
    const hasPercentage = Array.from(textElements).some((el) =>
      el.textContent?.includes('100%'),
    );
    expect(hasPercentage).toBe(true);
  });

  /**
   * Test 4: Renders multiple model segments sorted by token count.
   */
  it('renders multiple model segments sorted by token count', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'gpt-4-turbo',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'claude-3-sonnet',
        inputTokens: 5000,
        outputTokens: 2000,
        cacheReadTokens: 500,
        cacheWriteTokens: 200,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'claude-3-opus',
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{
          'claude-3-sonnet': '#ff0000',
          'claude-3-opus': '#00ff00',
          'gpt-4-turbo': '#0000ff',
        }}
        modelMetrics={modelMetrics}
      />,
    );

    // Check all models are in the legend
    expect(screen.getByText('claude-3-sonnet')).toBeInTheDocument();
    expect(screen.getByText('claude-3-opus')).toBeInTheDocument();
    expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument();

    // Verify models are rendered as arcs (circles with stroke-dasharray)
    const circles = container.querySelectorAll('circle');
    // Should have at least 4 circles: background track + 3 model arcs
    expect(circles.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Test 5: Aggregates small models into "Other" when >5 models and <3% share.
   */
  it('aggregates small models into "Other" when >5 models and <3% share', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'claude-3-sonnet',
        inputTokens: 9000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'gpt-4-turbo',
        inputTokens: 500,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'claude-3-opus',
        inputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'gemini-pro',
        inputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'mistral-large',
        inputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'llama-2',
        inputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    render(
      <ModelTokenDistribution
        modelColours={{
          'claude-3-sonnet': '#ff0000',
          'gpt-4-turbo': '#00ff00',
          'claude-3-opus': '#0000ff',
          'gemini-pro': '#ffff00',
          'mistral-large': '#ff00ff',
          'llama-2': '#00ffff',
        }}
        modelMetrics={modelMetrics}
      />,
    );

    // Should have "Other" in the legend (models representing <3% are aggregated)
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  /**
   * Test 6: Shows total token count in centre of donut.
   */
  it('shows total token count in centre of donut', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'claude-3-sonnet',
        inputTokens: 5000,
        outputTokens: 3000,
        cacheReadTokens: 500,
        cacheWriteTokens: 200,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{ 'claude-3-sonnet': '#ff0000' }}
        modelMetrics={modelMetrics}
      />,
    );

    // Check for total token count text (input + output only: 5000 + 3000 = 8K)
    const textElements = container.querySelectorAll('text');
    const hasTotal = Array.from(textElements).some((el) => el.textContent?.includes('8K'));
    expect(hasTotal).toBe(true);

    // Check for "total tokens" label
    expect(screen.getByText('total tokens')).toBeInTheDocument();
  });

  /**
   * Test 7: Renders title and correct aria-label.
   */
  it('renders title and correct aria-label', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'claude-3-sonnet',
        inputTokens: 5000,
        outputTokens: 3000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'gpt-4-turbo',
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{
          'claude-3-sonnet': '#ff0000',
          'gpt-4-turbo': '#0000ff',
        }}
        modelMetrics={modelMetrics}
      />,
    );

    // Check for title
    expect(screen.getByText('Token distribution by model')).toBeInTheDocument();

    // Check aria-label includes model percentages
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('Token distribution by model'));
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('claude-3-sonnet'));
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('gpt-4-turbo'));
  });

  /**
   * Test 8: Truncates long model names in legend (max 25 chars) and shows tooltip.
   */
  it('truncates long model names in legend and shows tooltip', () => {
    const longModelName = 'extremely-long-model-name-that-exceeds-limit-for-display';
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: longModelName,
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{ [longModelName]: '#ff0000' }}
        modelMetrics={modelMetrics}
      />,
    );

    // The truncated name should appear in the text (with ellipsis)
    const textElements = container.querySelectorAll('text');
    const hasEllipsis = Array.from(textElements).some((el) =>
      el.textContent?.includes('…'),
    );
    expect(hasEllipsis).toBe(true);

    // The full name should be in a title element (tooltip)
    const titleElements = container.querySelectorAll('title');
    const hasFullName = Array.from(titleElements).some(
      (el) => el.textContent === longModelName,
    );
    expect(hasFullName).toBe(true);
  });

  /**
   * Test 9: Collapses models with default color when not in modelColours.
   */
  it('uses default color for models not in modelColours', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'custom-model',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{}} // No color provided for custom-model
        modelMetrics={modelMetrics}
      />,
    );

    // Should still render successfully
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Check for model name in legend
    expect(screen.getByText('custom-model')).toBeInTheDocument();

    // Circle elements should have a default neutral color applied
    const circles = container.querySelectorAll('circle[stroke="var(--uui-neutral-50)"]');
    expect(circles.length).toBeGreaterThan(0);
  });

  /**
   * Test 10: Renders legend with correct percentage for each model.
   */
  it('renders legend with correct percentage for each model', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'model-a',
        inputTokens: 7000,
        outputTokens: 3000, // 10K total = 67%
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'model-b',
        inputTokens: 5000,
        outputTokens: 0, // 5K total = 33%
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{
          'model-a': '#ff0000',
          'model-b': '#0000ff',
        }}
        modelMetrics={modelMetrics}
      />,
    );

    const textElements = container.querySelectorAll('text');
    const allText = Array.from(textElements)
      .map((el) => el.textContent)
      .join(' ');

    // Check for percentage labels in the aggregated text
    // model-a is 10K out of 15K = 66.67% ≈ 67%
    // model-b is 5K out of 15K = 33.33% ≈ 33%
    expect(allText).toMatch(/67%/);
    expect(allText).toMatch(/33%/);
  });

  it('shows cost in arc title when costByModel is provided', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'claude-3-opus',
        inputTokens: 8000,
        outputTokens: 2000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
      {
        model: 'claude-3-haiku',
        inputTokens: 4000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 50,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution
        modelColours={{ 'claude-3-opus': '#ff0000', 'claude-3-haiku': '#00ff00' }}
        modelMetrics={modelMetrics}
        costByModel={{ 'claude-3-opus': 0.024, 'claude-3-haiku': 0.0005 }}
      />,
    );

    const titles = Array.from(container.querySelectorAll('title')).map((el) => el.textContent ?? '');
    expect(titles.some((t) => t.includes('claude-3-opus') && t.includes('$0.0240'))).toBe(true);
    expect(titles.some((t) => t.includes('claude-3-haiku') && t.includes('$0.0005'))).toBe(true);
  });

  it('omits cost from arc title when costByModel is not provided', () => {
    const modelMetrics: readonly ModelMetrics[] = [
      {
        model: 'model-a',
        inputTokens: 5000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 1,
        premiumRequestCost: 0,
        apiDurationMs: 100,
      },
    ];

    const { container } = render(
      <ModelTokenDistribution modelColours={{ 'model-a': '#ff0000' }} modelMetrics={modelMetrics} />,
    );

    const titles = Array.from(container.querySelectorAll('title')).map((el) => el.textContent ?? '');
    expect(titles.every((t) => !t.includes('$'))).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* TokenCompositionChart Tests                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

describe('TokenCompositionChart', () => {
  /**
   * Builds a minimal ModelSpendResult with the given totals.
   */
  function makeModelSpend(totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedUsd?: number;
    inputCostUsd?: number;
    cacheReadCostUsd?: number;
    cacheWriteCostUsd?: number;
    outputCostUsd?: number;
  }) {
    return {
      rows: [],
      totals: {
        requestCount: 1,
        premiumRequests: 0,
        premiumRequestCostUsd: 0,
        estimatedUsd: totals.estimatedUsd ?? 0,
        inputCostUsd: totals.inputCostUsd ?? 0,
        cacheReadCostUsd: totals.cacheReadCostUsd ?? 0,
        cacheWriteCostUsd: totals.cacheWriteCostUsd ?? 0,
        outputCostUsd: totals.outputCostUsd ?? 0,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
      },
      confidence: 'estimated' as const,
      source: 'messages' as const,
    };
  }

  it('renders "No token data available" when modelSpend is null', () => {
    render(<TokenCompositionChart modelSpend={null} />);
    expect(screen.getByText('No token data available.')).toBeInTheDocument();
  });

  it('renders "No token usage recorded" when all tokens are zero', () => {
    render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })}
      />,
    );
    expect(screen.getByText('No token usage recorded.')).toBeInTheDocument();
  });

  it('renders an SVG donut with aria-label when token data is present', () => {
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 8000,
          outputTokens: 2000,
          cacheReadTokens: 3000,
          cacheWriteTokens: 500,
        })}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('aria-label')).toContain('Token composition');
  });

  it('computes cache-hit percentage correctly (cacheReadTokens / inputTokens)', () => {
    // 3000 / 8000 = 37.5% → rounds to 38%
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 8000,
          outputTokens: 2000,
          cacheReadTokens: 3000,
          cacheWriteTokens: 500,
        })}
      />,
    );

    const textElements = container.querySelectorAll('text');
    const allText = Array.from(textElements)
      .map((el) => el.textContent)
      .join(' ');
    expect(allText).toContain('38%');
    expect(allText).toContain('cache hit');
  });

  it('shows 0% cache-hit when cacheReadTokens is zero', () => {
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 5000,
          outputTokens: 1000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })}
      />,
    );

    const textElements = container.querySelectorAll('text');
    const allText = Array.from(textElements)
      .map((el) => el.textContent)
      .join(' ');
    expect(allText).toContain('0%');
    expect(allText).toContain('cache hit');
  });

  it('renders legend entries for each non-zero bucket', () => {
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 6000,
          outputTokens: 2000,
          cacheReadTokens: 2000,
          cacheWriteTokens: 500,
        })}
      />,
    );

    const textElements = container.querySelectorAll('text');
    const allText = Array.from(textElements)
      .map((el) => el.textContent)
      .join(' ');

    // freshInput = 6000 - 2000 = 4000 (non-zero → should appear)
    expect(allText).toContain('Fresh input');
    expect(allText).toContain('Cache reads');
    expect(allText).toContain('Output');
    expect(allText).toContain('Cache writes');
  });

  it('omits zero-token buckets from legend', () => {
    // cacheWriteTokens = 0 → should not render that legend entry
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 5000,
          outputTokens: 1500,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })}
      />,
    );

    const textElements = container.querySelectorAll('text');
    const allText = Array.from(textElements)
      .map((el) => el.textContent)
      .join(' ');

    expect(allText).not.toContain('Cache reads');
    expect(allText).not.toContain('Cache writes');
    // Fresh input (5000 - 0 = 5000) and Output should still appear
    expect(allText).toContain('Fresh input');
    expect(allText).toContain('Output');
  });

  it('shows cost in arc title when cost is non-zero', () => {
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 5000,
          outputTokens: 1500,
          cacheReadTokens: 1000,
          cacheWriteTokens: 500,
          inputCostUsd: 0.0015,
          cacheReadCostUsd: 0.00025,
          outputCostUsd: 0.006,
          cacheWriteCostUsd: 0.0005,
        })}
      />,
    );

    const titles = Array.from(container.querySelectorAll('title')).map((el) => el.textContent ?? '');
    expect(titles.some((t) => t.includes('Fresh input') && t.includes('$0.0015'))).toBe(true);
    expect(titles.some((t) => t.includes('Output') && t.includes('$0.0060'))).toBe(true);
    expect(titles.some((t) => t.includes('Cache reads') && t.includes('$0.0003'))).toBe(true);
    expect(titles.some((t) => t.includes('Cache writes') && t.includes('$0.0005'))).toBe(true);
  });

  it('omits cost from arc title when all costs are zero', () => {
    const { container } = render(
      <TokenCompositionChart
        modelSpend={makeModelSpend({
          inputTokens: 5000,
          outputTokens: 1500,
          cacheReadTokens: 1000,
          cacheWriteTokens: 500,
        })}
      />,
    );

    const titles = Array.from(container.querySelectorAll('title')).map((el) => el.textContent ?? '');
    expect(titles.every((t) => !t.includes('$'))).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* TokensPerTurnChart Tests                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

describe('TokensPerTurnChart', () => {
  /** Create a minimal Turn with the given assistant-message token counts. */
  function makeTurn(turnId: string, tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }) {
    return {
      turnId,
      startTs: null,
      endTs: null,
      userMessage: null,
      toolCalls: [],
      subagents: [],
      assistantMessages: [
        {
          interactionId: null,
          requestId: null,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheReadTokens: tokens.cacheRead ?? 0,
          cacheWriteTokens: tokens.cacheWrite ?? 0,
          model: 'gpt-4',
          timestamp: null,
          turnId,
          eventId: null,
          parentId: null,
          content: '',
          reasoningText: '',
        },
      ],
    };
  }

  it('renders "No per-turn token data available" when turns array is empty', () => {
    render(<TokensPerTurnChart turns={[]} />);
    expect(screen.getByText('No per-turn token data available.')).toBeInTheDocument();
  });

  it('renders bar rows when turns have token data', () => {
    const turns = [
      makeTurn('t1', { input: 1000, output: 200 }),
      makeTurn('t2', { input: 500, output: 100 }),
    ];

    const { container } = render(<TokensPerTurnChart turns={turns} />);

    // Should render at least one bar row
    const rows = container.querySelectorAll('[class*="turnsBarRow"]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('labels bars with 1-based turn positions (not raw UUIDs)', () => {
    const turns = [
      makeTurn('uuid-abc-123', { input: 2000, output: 400 }),
      makeTurn('uuid-def-456', { input: 1000, output: 200 }),
    ];

    render(<TokensPerTurnChart turns={turns} />);

    // Should display "Turn 1" and "Turn 2", not raw UUIDs
    expect(screen.getByText('Turn 1')).toBeInTheDocument();
    expect(screen.getByText('Turn 2')).toBeInTheDocument();
    expect(screen.queryByText('uuid-abc-123')).not.toBeInTheDocument();
  });

  it('sorts turns by total token count descending', () => {
    // Turn 2 has more tokens than Turn 1 — it should appear first in the list
    const turns = [
      makeTurn('t1', { input: 300, output: 100 }),   // 400 total
      makeTurn('t2', { input: 1500, output: 500 }),  // 2000 total
    ];

    const { container } = render(<TokensPerTurnChart turns={turns} />);

    const labels = Array.from(container.querySelectorAll('[class*="turnsBarLabel"]')).map(
      (el) => el.textContent,
    );

    // t2 (position 2 in original array) should appear first due to sort
    expect(labels[0]).toBe('Turn 2');
    expect(labels[1]).toBe('Turn 1');
  });

  it('limits output to top 15 bars', () => {
    // Create 20 turns with varying token counts
    const turns = Array.from({ length: 20 }, (_, i) =>
      makeTurn(`t${i + 1}`, { input: (i + 1) * 100, output: 50 }),
    );

    const { container } = render(<TokensPerTurnChart turns={turns} />);

    const rows = container.querySelectorAll('[class*="turnsBarRow"]');
    expect(rows.length).toBeLessThanOrEqual(15);
  });

  it('omits turns with zero total tokens', () => {
    const turns = [
      makeTurn('t1', { input: 0, output: 0 }),
      makeTurn('t2', { input: 1000, output: 200 }),
    ];

    const { container } = render(<TokensPerTurnChart turns={turns} />);

    const rows = container.querySelectorAll('[class*="turnsBarRow"]');
    // Only t2 has tokens — only 1 bar should render
    expect(rows.length).toBe(1);
  });

  it('includes all four token types (input, output, cacheRead, cacheWrite) in total', () => {
    // Single turn with 100 of each type = 400 total
    const turns = [
      makeTurn('t1', { input: 100, output: 100, cacheRead: 100, cacheWrite: 100 }),
    ];

    const { container } = render(<TokensPerTurnChart turns={turns} />);

    // The value label should reflect the total of all four buckets (400)
    const values = Array.from(container.querySelectorAll('[class*="turnsBarValue"]')).map(
      (el) => el.textContent,
    );
    // formatTokenCount(400) → '400' (below 1K threshold)
    expect(values[0]).toContain('400');
  });
});
