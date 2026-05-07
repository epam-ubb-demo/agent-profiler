/**
 * Tests for TokenHeatmap component.
 */

import type { AssistantMessage } from '@agent-profiler/core';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TokenHeatmap } from '../src/timeline/TokenHeatmap';
import { DEFAULT_CONFIG } from '../src/timeline/types';


describe('TokenHeatmap', () => {
  it('renders the correct number of bins', () => {
    const { container } = render(
      <svg>
        <TokenHeatmap
          messages={[]}
          compactions={[]}
          startMs={0}
          durationMs={60000}
          config={DEFAULT_CONFIG}
          y={0}
        />
      </svg>,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(DEFAULT_CONFIG.heatmapBins);
  });

  it('computes intensity correctly when messages are present', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const messages: AssistantMessage[] = [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 200,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: 'model-a',
        timestamp: '2024-01-01T00:00:00Z', // first bin
        turnId: null,
        eventId: null,
        parentId: null,
        content: '',
        reasoningText: '',
      },
      {
        interactionId: null,
        requestId: null,
        outputTokens: 100,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: 'model-a',
        timestamp: '2024-01-01T00:00:30Z', // mid bin
        turnId: null,
        eventId: null,
        parentId: null,
        content: '',
        reasoningText: '',
      },
    ];

    const { container } = render(
      <svg>
        <TokenHeatmap
          messages={messages}
          compactions={[]}
          startMs={startMs}
          durationMs={60000}
          config={DEFAULT_CONFIG}
          y={0}
        />
      </svg>,
    );

    const rects = container.querySelectorAll('rect');
    // First rect (bin 0) should have full intensity (green to red)
    const firstRect = rects[0]!;
    expect(firstRect.getAttribute('fill')).toContain('hsl(');
    expect(firstRect.getAttribute('opacity')).toBe('0.85');
  });

  it('renders low opacity for empty bins', () => {
    const { container } = render(
      <svg>
        <TokenHeatmap
          messages={[]}
          compactions={[]}
          startMs={0}
          durationMs={60000}
          config={DEFAULT_CONFIG}
          y={0}
        />
      </svg>,
    );
    const rects = container.querySelectorAll('rect');
    // All bins empty → opacity 0.15
    for (const rect of rects) {
      expect(rect.getAttribute('opacity')).toBe('0.15');
    }
  });
});
