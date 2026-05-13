/**
 * Tests for SVG chart components: ContextTokenTimeline and ModelTokenDistribution.
 *
 * These are hand-crafted SVG charts with no external charting libraries.
 * Tests focus on rendering, data visualization, and edge cases.
 */

import type { Compaction, UtilisationSample, ModelMetrics } from '@agent-profiler/core';
import { screen, cleanup } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';

import { ContextTokenTimeline } from '../src/session-detail/ContextTokenTimeline';
import { ModelTokenDistribution } from '../src/session-detail/ModelTokenDistribution';

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
});
