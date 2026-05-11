/**
 * Unit tests for normaliseModelMetrics, safeInt, and safeNumber.
 */

import { describe, expect, it } from 'vitest';

import {
  normaliseModelMetrics,
  safeInt,
  safeNumber,
} from '../src/normalise-model-metrics';

// ---------------------------------------------------------------------------
// normaliseModelMetrics — Format handling
// ---------------------------------------------------------------------------

describe('normaliseModelMetrics', () => {
  describe('format handling', () => {
    it('parses a dictionary entry with nested usage/requests', () => {
      const raw = {
        'claude-opus-4.6': {
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 200,
            cacheWriteTokens: 80,
            reasoningTokens: 10,
          },
          requests: { count: 5, cost: 3 },
        },
      };

      const result = normaliseModelMetrics(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        model: 'claude-opus-4.6',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 200,
        cacheWriteTokens: 80,
        reasoningTokens: 10,
        requestCount: 5,
        premiumRequestCost: 3,
        apiDurationMs: 0,
      });
    });

    it('parses a dictionary with multiple models', () => {
      const raw = {
        'model-a': { usage: { inputTokens: 10 } },
        'model-b': { usage: { inputTokens: 20 } },
        'model-c': { usage: { inputTokens: 30 } },
      };

      const result = normaliseModelMetrics(raw);

      expect(result).toHaveLength(3);
      expect(result.map((m) => m.model).sort()).toEqual([
        'model-a',
        'model-b',
        'model-c',
      ]);
      expect(result.find((m) => m.model === 'model-b')?.inputTokens).toBe(20);
    });

    it('parses the legacy array format', () => {
      const raw = [
        {
          modelId: 'claude-sonnet-4',
          inputTokens: 100,
          outputTokens: 50,
          requestCount: 5,
          apiDurationMs: 1000,
        },
      ];

      const result = normaliseModelMetrics(raw);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        model: 'claude-sonnet-4',
        inputTokens: 100,
        outputTokens: 50,
        requestCount: 5,
        apiDurationMs: 1000,
      });
    });

    it('returns [] for null input', () => {
      expect(normaliseModelMetrics(null)).toEqual([]);
    });

    it('returns [] for undefined input', () => {
      expect(normaliseModelMetrics(undefined)).toEqual([]);
    });

    it('returns [] for an empty object', () => {
      expect(normaliseModelMetrics({})).toEqual([]);
    });

    it('returns [] for an empty array', () => {
      expect(normaliseModelMetrics([])).toEqual([]);
    });

    it('returns [] for a string input', () => {
      expect(normaliseModelMetrics('hello')).toEqual([]);
    });

    it('returns [] for a numeric input', () => {
      expect(normaliseModelMetrics(42)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Per-field fallback
  // ---------------------------------------------------------------------------

  describe('per-field fallback', () => {
    it('nested usage takes precedence over flat fields', () => {
      const raw = {
        'model-x': {
          usage: { inputTokens: 100 },
          inputTokens: 999,
        },
      };

      const result = normaliseModelMetrics(raw);

      expect(result[0]!.inputTokens).toBe(100);
    });

    it('falls back to flat fields when nested usage is missing', () => {
      const raw = {
        'model-x': {
          inputTokens: 50,
        },
      };

      const result = normaliseModelMetrics(raw);

      expect(result[0]!.inputTokens).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Cache field name aliases
  // ---------------------------------------------------------------------------

  describe('cache field name aliases', () => {
    it('extracts new cache field names from usage', () => {
      const raw = {
        'model-x': {
          usage: { cacheReadTokens: 300, cacheWriteTokens: 150 },
        },
      };

      const result = normaliseModelMetrics(raw);

      expect(result[0]!.cacheReadTokens).toBe(300);
      expect(result[0]!.cacheWriteTokens).toBe(150);
    });

    it('maps old cache field names to new ones', () => {
      const raw = {
        'model-x': {
          usage: {
            cacheReadInputTokens: 400,
            cacheCreationInputTokens: 250,
          },
        },
      };

      const result = normaliseModelMetrics(raw);

      expect(result[0]!.cacheReadTokens).toBe(400);
      expect(result[0]!.cacheWriteTokens).toBe(250);
    });

    it('new cache names take precedence over old ones', () => {
      const raw = {
        'model-x': {
          usage: {
            cacheReadTokens: 100,
            cacheReadInputTokens: 999,
            cacheWriteTokens: 200,
            cacheCreationInputTokens: 888,
          },
        },
      };

      const result = normaliseModelMetrics(raw);

      expect(result[0]!.cacheReadTokens).toBe(100);
      expect(result[0]!.cacheWriteTokens).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // reasoningTokens
  // ---------------------------------------------------------------------------

  describe('reasoningTokens', () => {
    it('extracts non-zero reasoning tokens', () => {
      const raw = {
        'model-x': { usage: { reasoningTokens: 500 } },
      };

      expect(normaliseModelMetrics(raw)[0]!.reasoningTokens).toBe(500);
    });

    it('defaults missing reasoning tokens to 0', () => {
      const raw = {
        'model-x': { usage: { inputTokens: 10 } },
      };

      expect(normaliseModelMetrics(raw)[0]!.reasoningTokens).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles a non-object value in dict (all zeros)', () => {
      const raw = { 'model-x': 'not-an-object' };

      const result = normaliseModelMetrics(raw);

      expect(result).toHaveLength(1);
      expect(result[0]!.model).toBe('model-x');
      expect(result[0]!.inputTokens).toBe(0);
      expect(result[0]!.outputTokens).toBe(0);
      expect(result[0]!.cacheReadTokens).toBe(0);
      expect(result[0]!.cacheWriteTokens).toBe(0);
      expect(result[0]!.reasoningTokens).toBe(0);
      expect(result[0]!.requestCount).toBe(0);
      expect(result[0]!.premiumRequestCost).toBe(0);
      expect(result[0]!.apiDurationMs).toBe(0);
    });

    it('defaults all numeric fields to 0 for an empty entry', () => {
      const raw = { 'model-x': {} };

      const result = normaliseModelMetrics(raw);

      expect(result[0]).toEqual({
        model: 'model-x',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 0,
        premiumRequestCost: 0,
        apiDurationMs: 0,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// safeInt
// ---------------------------------------------------------------------------

describe('safeInt', () => {
  it('returns a valid integer as-is', () => {
    expect(safeInt(42)).toBe(42);
  });

  it('returns fallback for null', () => {
    expect(safeInt(null)).toBe(0);
  });

  it('returns fallback for undefined', () => {
    expect(safeInt(undefined)).toBe(0);
  });

  it('returns fallback for NaN', () => {
    expect(safeInt(NaN)).toBe(0);
  });

  it('returns fallback for Infinity', () => {
    expect(safeInt(Infinity)).toBe(0);
  });

  it('rounds a float to the nearest integer', () => {
    expect(safeInt(3.7)).toBe(4);
    expect(safeInt(3.2)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// safeNumber
// ---------------------------------------------------------------------------

describe('safeNumber', () => {
  it('returns a valid number as-is', () => {
    expect(safeNumber(3.14)).toBe(3.14);
  });

  it('returns fallback for a negative number', () => {
    expect(safeNumber(-5)).toBe(0);
  });

  it('returns fallback for null', () => {
    expect(safeNumber(null)).toBe(0);
  });

  it('returns fallback for NaN', () => {
    expect(safeNumber(NaN)).toBe(0);
  });
});
