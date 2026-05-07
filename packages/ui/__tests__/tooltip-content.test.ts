/**
 * Tests for tooltip content builders and formatting helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  compactionTipContent,
  heatmapTipContent,
  messageTipContent,
  modelTipContent,
  toolTipContent,
} from '../src/timeline/tooltip-content';
import { formatNumber, formatTimeWithOffset } from '../src/timeline/utils';

describe('formatTimeWithOffset', () => {
  const sessionStart = new Date('2025-01-01T00:00:00.000Z').getTime();

  it('formats a timestamp with offset', () => {
    const result = formatTimeWithOffset('2025-01-01T00:30:00.000Z', sessionStart);
    expect(result).toBe('00:30:00.000 (+30.0m)');
  });

  it('formats short offsets in seconds', () => {
    const result = formatTimeWithOffset('2025-01-01T00:00:05.000Z', sessionStart);
    expect(result).toBe('00:00:05.000 (+5.0s)');
  });

  it('formats ms offsets', () => {
    const result = formatTimeWithOffset('2025-01-01T00:00:00.250Z', sessionStart);
    expect(result).toBe('00:00:00.250 (+250ms)');
  });

  it('handles invalid timestamp', () => {
    const result = formatTimeWithOffset('invalid', sessionStart);
    expect(result).toBe('--:--:--.---');
  });
});

describe('formatNumber', () => {
  it('formats with thousands separators', () => {
    const result = formatNumber(1234567);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('567');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });
});

describe('heatmapTipContent', () => {
  it('produces correct header and rows', () => {
    const start = new Date('2025-01-01T10:00:00Z').getTime();
    const end = new Date('2025-01-01T10:05:00Z').getTime();
    const result = heatmapTipContent(start, end, 5000, 75);

    expect(result.header).toContain('Window');
    expect(result.header).toContain('10:00:00');
    expect(result.header).toContain('10:05:00');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.key).toBe('Tokens');
    expect(result.rows[1]!.key).toBe('Intensity');
    expect(result.rows[1]!.value).toContain('75%');
  });
});

describe('modelTipContent', () => {
  const sessionStart = new Date('2025-01-01T00:00:00Z').getTime();

  it('produces correct content', () => {
    const result = modelTipContent(
      'claude-opus-4.6',
      '2025-01-01T00:05:00Z',
      '2025-01-01T01:05:00Z',
      3_600_000,
      sessionStart,
    );

    expect(result.header).toBe('Model · claude-opus-4.6');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!.key).toBe('From');
    expect(result.rows[1]!.key).toBe('To');
    expect(result.rows[2]!.key).toBe('Duration');
    expect(result.rows[2]!.value).toBe('60.0m');
  });
});

describe('toolTipContent', () => {
  const sessionStart = new Date('2025-01-01T00:00:00Z').getTime();

  it('produces correct content for successful tool', () => {
    const result = toolTipContent(
      'bash',
      'claude-opus-4.6',
      '2025-01-01T00:10:00Z',
      500,
      true,
      '{"command": "ls -la"}',
      sessionStart,
    );

    expect(result.header).toBe('Tool · bash');
    expect(result.rows.find((r) => r.key === 'Status')!.value).toBe('✓ ok');
    expect(result.rows.find((r) => r.key === 'Args')!.value).toBe('{"command": "ls -la"}');
  });

  it('produces correct content for failed tool', () => {
    const result = toolTipContent('edit', null, null, null, false, '', sessionStart);

    expect(result.header).toBe('Tool · edit');
    expect(result.rows.find((r) => r.key === 'Status')!.value).toBe('✗ error');
    expect(result.rows.find((r) => r.key === 'Model')!.value).toBe('unknown');
    expect(result.rows.find((r) => r.key === 'Args')).toBeUndefined();
  });

  it('truncates long args preview', () => {
    const longArgs = 'x'.repeat(200);
    const result = toolTipContent('view', 'model', '2025-01-01T00:00:00Z', 10, true, longArgs, sessionStart);
    const argsRow = result.rows.find((r) => r.key === 'Args');
    expect(argsRow!.value.length).toBeLessThanOrEqual(120);
    expect(argsRow!.value).toContain('…');
  });
});

describe('messageTipContent', () => {
  const sessionStart = new Date('2025-01-01T00:00:00Z').getTime();

  it('produces correct content', () => {
    const result = messageTipContent(
      '2025-01-01T00:15:00Z',
      'claude-opus-4.6',
      432,
      0.05,
      sessionStart,
    );

    expect(result.header).toContain('Time');
    expect(result.rows.find((r) => r.key === 'Output tokens')!.value).toBe('432');
    expect(result.rows.find((r) => r.key === 'Est. cost')!.value).toBe('$0.05');
  });

  it('shows <$0.01 for tiny costs', () => {
    const result = messageTipContent('2025-01-01T00:00:00Z', 'model', 10, 0.001, sessionStart);
    expect(result.rows.find((r) => r.key === 'Est. cost')!.value).toBe('<$0.01');
  });

  it('shows — for null cost', () => {
    const result = messageTipContent('2025-01-01T00:00:00Z', 'model', 10, null, sessionStart);
    expect(result.rows.find((r) => r.key === 'Est. cost')!.value).toBe('—');
  });
});

describe('compactionTipContent', () => {
  const sessionStart = new Date('2025-01-01T00:00:00Z').getTime();

  it('produces correct content', () => {
    const result = compactionTipContent(
      '2025-01-01T00:30:00Z',
      100_000,
      5_000,
      20_000,
      10_000,
      'claude-opus-4.6',
      sessionStart,
    );

    expect(result.header).toContain('Compaction');
    expect(result.rows).toHaveLength(6);
    expect(result.rows.find((r) => r.key === 'Total tokens')!.value).toContain('135');
  });
});
