/**
 * Tests for ToolLane component.
 */

import type { ToolCall } from '@agent-profiler/core';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ToolLane, getToolLaneCount } from '../src/timeline/ToolLane';
import { DEFAULT_CONFIG } from '../src/timeline/types';

const mockTooltip = { show: vi.fn(), move: vi.fn(), hide: vi.fn() };


function makeToolCall(id: string, startTs: string, endTs: string): ToolCall {
  return {
    toolCallId: id,
    toolName: 'test_tool',
    model: 'model-a',
    startTs,
    endTs,
    durationMs: new Date(endTs).getTime() - new Date(startTs).getTime(),
    success: true,
    parentId: null,
    turnId: null,
    eventId: null,
    argumentsPreview: '',
  };
}

describe('ToolLane', () => {
  it('renders without crashing with no tool calls', () => {
    const { container } = render(
      <svg>
        <ToolLane
          toolCalls={[]}
          startMs={0}
          durationMs={60000}
          config={DEFAULT_CONFIG}
          y={0}
          zoom={1}
          tooltip={mockTooltip}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="tool-lane"]')).toBeTruthy();
  });

  it('renders correct number of rects for tool calls', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const tools: ToolCall[] = [
      makeToolCall('t1', '2024-01-01T00:00:01Z', '2024-01-01T00:00:05Z'),
      makeToolCall('t2', '2024-01-01T00:00:06Z', '2024-01-01T00:00:10Z'),
      makeToolCall('t3', '2024-01-01T00:00:03Z', '2024-01-01T00:00:08Z'),
    ];

    const { container } = render(
      <svg>
        <ToolLane
          toolCalls={tools}
          startMs={startMs}
          durationMs={60000}
          config={DEFAULT_CONFIG}
          y={0}
          zoom={1}
          tooltip={mockTooltip}
        />
      </svg>,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
  });
});

describe('getToolLaneCount', () => {
  it('returns 1 for no tool calls', () => {
    expect(getToolLaneCount([], 0, 60000)).toBe(1);
  });

  it('returns 1 for non-overlapping tools', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const tools: ToolCall[] = [
      makeToolCall('t1', '2024-01-01T00:00:01Z', '2024-01-01T00:00:05Z'),
      makeToolCall('t2', '2024-01-01T00:00:06Z', '2024-01-01T00:00:10Z'),
    ];
    expect(getToolLaneCount(tools, startMs, 60000)).toBe(1);
  });

  it('returns correct count for overlapping tools', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const tools: ToolCall[] = [
      makeToolCall('t1', '2024-01-01T00:00:01Z', '2024-01-01T00:00:10Z'),
      makeToolCall('t2', '2024-01-01T00:00:03Z', '2024-01-01T00:00:08Z'),
      makeToolCall('t3', '2024-01-01T00:00:05Z', '2024-01-01T00:00:12Z'),
    ];
    // t1 and t2 overlap, t3 overlaps with both → 3 lanes
    expect(getToolLaneCount(tools, startMs, 60000)).toBe(3);
  });
});
