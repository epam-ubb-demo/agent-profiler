/**
 * Tests for timeline utility functions.
 */

import type { AssistantMessage, Compaction, ModelChange, ToolCall } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import {
  computeHeatmapBins,
  computeModelSegments,
  formatDuration,
  formatTime,
  heatmapColour,
  isTickVisible,
  modelColour,
  packToolLanes,
  tickDensity,
  timeFraction,
} from '../src/timeline/utils';

describe('modelColour', () => {
  it('returns a consistent colour for the same model', () => {
    const c1 = modelColour('claude-sonnet-4-20250514');
    const c2 = modelColour('claude-sonnet-4-20250514');
    expect(c1).toBe(c2);
  });

  it('returns a grey for null model', () => {
    expect(modelColour(null)).toContain('hsl(210');
  });
});

describe('heatmapColour', () => {
  it('returns green for 0 intensity', () => {
    expect(heatmapColour(0)).toBe('hsl(120, 75%, 50%)');
  });

  it('returns red for 1 intensity', () => {
    expect(heatmapColour(1)).toBe('hsl(0, 75%, 50%)');
  });

  it('returns yellow-ish for 0.5 intensity', () => {
    expect(heatmapColour(0.5)).toBe('hsl(60, 75%, 50%)');
  });

  it('clamps intensity above 1', () => {
    expect(heatmapColour(1.5)).toBe(heatmapColour(1));
  });
});

describe('formatTime', () => {
  it('formats a valid ISO timestamp', () => {
    expect(formatTime('2024-01-15T14:30:45.123Z')).toBe('14:30:45');
  });

  it('returns placeholder for invalid timestamp', () => {
    expect(formatTime('not-a-date')).toBe('--:--:--');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(3500)).toBe('3.5s');
  });

  it('formats minutes', () => {
    expect(formatDuration(90000)).toBe('1.5m');
  });
});

describe('timeFraction', () => {
  it('returns 0 for null timestamp', () => {
    expect(timeFraction(null, 0, 1000)).toBe(0);
  });

  it('returns 0 for zero duration', () => {
    expect(timeFraction('2024-01-01T00:00:00Z', 0, 0)).toBe(0);
  });

  it('computes correct fraction', () => {
    const start = new Date('2024-01-01T00:00:00Z').getTime();
    const frac = timeFraction('2024-01-01T00:00:30Z', start, 60000);
    expect(frac).toBeCloseTo(0.5);
  });
});

describe('computeHeatmapBins', () => {
  it('returns zeros for empty inputs', () => {
    const bins = computeHeatmapBins([], [], 0, 1000, 10);
    expect(bins).toHaveLength(10);
    expect(bins.every((b) => b === 0)).toBe(true);
  });

  it('places tokens into correct bins', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const messages: AssistantMessage[] = [
      {
        interactionId: null,
        requestId: null,
        outputTokens: 100,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: 'test-model',
        timestamp: '2024-01-01T00:00:05Z', // 5s into a 60s session → bin 0
        turnId: null,
        eventId: null,
        parentId: null,
        content: '',
        reasoningText: '',
      },
    ];
    const bins = computeHeatmapBins(messages, [], startMs, 60000, 10);
    expect(bins[0]).toBe(100);
    expect(bins.slice(1).every((b) => b === 0)).toBe(true);
  });

  it('includes compaction tokens', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const compactions: Compaction[] = [
      {
        timestamp: '2024-01-01T00:00:30Z', // mid-point → bin 5 (of 10)
        inputTokens: 50,
        outputTokens: 30,
        cacheRead: 0,
        cacheWrite: 20,
        model: 'test-model',
        turnId: null,
      },
    ];
    const bins = computeHeatmapBins([], compactions, startMs, 60000, 10);
    expect(bins[5]).toBe(100); // 50 + 30 + 20
  });
});

describe('packToolLanes', () => {
  it('returns empty array for zero duration', () => {
    expect(packToolLanes([], 0, 0)).toHaveLength(0);
  });

  it('packs non-overlapping tools into one lane', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const tools: ToolCall[] = [
      {
        toolCallId: 't1',
        toolName: 'read',
        model: 'model-a',
        startTs: '2024-01-01T00:00:01Z',
        endTs: '2024-01-01T00:00:05Z',
        durationMs: 4000,
        success: true,
        parentId: null,
        turnId: null,
        eventId: null,
        argumentsPreview: '',
      },
      {
        toolCallId: 't2',
        toolName: 'write',
        model: 'model-a',
        startTs: '2024-01-01T00:00:06Z',
        endTs: '2024-01-01T00:00:10Z',
        durationMs: 4000,
        success: true,
        parentId: null,
        turnId: null,
        eventId: null,
        argumentsPreview: '',
      },
    ];
    const result = packToolLanes(tools, startMs, 60000);
    expect(result).toHaveLength(2);
    expect(result[0]!.lane).toBe(0);
    expect(result[1]!.lane).toBe(0);
  });

  it('packs overlapping tools into multiple lanes', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const tools: ToolCall[] = [
      {
        toolCallId: 't1',
        toolName: 'read',
        model: 'model-a',
        startTs: '2024-01-01T00:00:01Z',
        endTs: '2024-01-01T00:00:10Z',
        durationMs: 9000,
        success: true,
        parentId: null,
        turnId: null,
        eventId: null,
        argumentsPreview: '',
      },
      {
        toolCallId: 't2',
        toolName: 'write',
        model: 'model-a',
        startTs: '2024-01-01T00:00:03Z',
        endTs: '2024-01-01T00:00:08Z',
        durationMs: 5000,
        success: true,
        parentId: null,
        turnId: null,
        eventId: null,
        argumentsPreview: '',
      },
    ];
    const result = packToolLanes(tools, startMs, 60000);
    expect(result).toHaveLength(2);
    expect(result[0]!.lane).toBe(0);
    expect(result[1]!.lane).toBe(1);
  });
});

describe('computeModelSegments', () => {
  it('returns empty for zero duration', () => {
    expect(computeModelSegments('model-a', [], 0, 0, null, null)).toHaveLength(0);
  });

  it('returns a single segment when no model changes', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const segments = computeModelSegments(
      'claude-sonnet',
      [],
      startMs,
      60000,
      '2024-01-01T00:00:00Z',
      '2024-01-01T00:01:00Z',
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]!.model).toBe('claude-sonnet');
    expect(segments[0]!.startFrac).toBe(0);
    expect(segments[0]!.endFrac).toBe(1);
  });

  it('creates segments for each model change', () => {
    const startMs = new Date('2024-01-01T00:00:00Z').getTime();
    const changes: ModelChange[] = [
      { timestamp: '2024-01-01T00:00:30Z', model: 'claude-opus' },
    ];
    const segments = computeModelSegments(
      'claude-sonnet',
      changes,
      startMs,
      60000,
      '2024-01-01T00:00:00Z',
      '2024-01-01T00:01:00Z',
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]!.model).toBe('claude-sonnet');
    expect(segments[1]!.model).toBe('claude-opus');
    expect(segments[0]!.endFrac).toBeCloseTo(0.5);
    expect(segments[1]!.startFrac).toBeCloseTo(0.5);
  });
});

describe('tickDensity', () => {
  it('identifies major ticks (every 12th)', () => {
    expect(tickDensity(0)).toBe('major');
    expect(tickDensity(12)).toBe('major');
    expect(tickDensity(24)).toBe('major');
  });

  it('identifies medium ticks (every 6th, not 12th)', () => {
    expect(tickDensity(6)).toBe('medium');
    expect(tickDensity(18)).toBe('medium');
  });

  it('identifies minor ticks (every 3rd, not 6th)', () => {
    expect(tickDensity(3)).toBe('minor');
    expect(tickDensity(9)).toBe('minor');
  });

  it('identifies finest ticks (the rest)', () => {
    expect(tickDensity(1)).toBe('finest');
    expect(tickDensity(2)).toBe('finest');
    expect(tickDensity(5)).toBe('finest');
  });
});

describe('isTickVisible', () => {
  it('major ticks are always visible', () => {
    expect(isTickVisible('major', 1)).toBe(true);
    expect(isTickVisible('major', 0.5)).toBe(true);
  });

  it('medium ticks visible at 2x+', () => {
    expect(isTickVisible('medium', 1)).toBe(false);
    expect(isTickVisible('medium', 2)).toBe(true);
  });

  it('minor ticks visible at 4x+', () => {
    expect(isTickVisible('minor', 3)).toBe(false);
    expect(isTickVisible('minor', 4)).toBe(true);
  });

  it('finest ticks visible at 8x+', () => {
    expect(isTickVisible('finest', 7)).toBe(false);
    expect(isTickVisible('finest', 8)).toBe(true);
  });
});
