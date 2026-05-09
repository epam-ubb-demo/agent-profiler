/**
 * Unit tests for the overlapping-input cost calculator.
 *
 * Golden expected values are computed by hand using the formula:
 *   cost = (max(0, inputTokens − cacheReadTokens) × rate + …) / 1,000,000
 */

import { describe, expect, it } from 'vitest';

import { calculateCost } from '../src/calculator';
import type { PricingTable } from '../src/types';

const TEST_TABLE: PricingTable = {
  'claude-sonnet-4': { input: 3.0, cacheRead: 0.3, cacheWrite: 3.75, output: 15.0 },
  'gpt-4.1': { input: 2.0, cacheRead: 0.5, cacheWrite: 0, output: 8.0 },
  'partial-model': { input: 1.0, cacheRead: 0, cacheWrite: 0, output: 5.0 },
};

describe('calculateCost', () => {
  it('single model, known pricing → exact USD match', () => {
    // max(0, 10,000 - 50,000) = 0 → inputCost = $0
    // 50,000 cacheRead × $0.3/M = $0.015
    // 2,000 cacheWrite × $3.75/M = $0.0075
    // 5,000 output × $15/M = $0.075
    // Total = $0.0975
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'claude-sonnet-4',
            inputTokens: 10_000,
            cacheReadTokens: 50_000,
            cacheWriteTokens: 2_000,
            outputTokens: 5_000,
          },
        ],
      },
      TEST_TABLE,
    );

    expect(result.confidence).toBe('known');
    expect(result.totalUsd).toBeCloseTo(0.0975, 6);

    const model = result.perModel['claude-sonnet-4']!;
    expect(model.inputCostUsd).toBeCloseTo(0, 6);
    expect(model.cacheReadCostUsd).toBeCloseTo(0.015, 6);
    expect(model.cacheWriteCostUsd).toBeCloseTo(0.0075, 6);
    expect(model.outputCostUsd).toBeCloseTo(0.075, 6);
    expect(model.totalCostUsd).toBeCloseTo(0.0975, 6);
  });

  it('multiple models → per-model breakdown sums to total', () => {
    // claude-sonnet-4: max(0, 1000-0)=1000 input × 3/M = 0.003, 0 cache, 500 output × 15/M = 0.0075
    //   subtotal = 0.0105
    // gpt-4.1: max(0, 2000-1000)=1000 input × 2/M = 0.002, 1000 cacheRead × 0.5/M = 0.0005, 1000 output × 8/M = 0.008
    //   subtotal = 0.0105
    // Grand total = 0.021
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'claude-sonnet-4',
            inputTokens: 1_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 500,
          },
          {
            model: 'gpt-4.1',
            inputTokens: 2_000,
            cacheReadTokens: 1_000,
            cacheWriteTokens: 0,
            outputTokens: 1_000,
          },
        ],
      },
      TEST_TABLE,
    );

    expect(result.confidence).toBe('known');
    expect(result.perModel['claude-sonnet-4']!.totalCostUsd).toBeCloseTo(0.0105, 6);
    expect(result.perModel['gpt-4.1']!.totalCostUsd).toBeCloseTo(0.0105, 6);
    expect(result.totalUsd).toBeCloseTo(0.021, 6);

    // Verify sum
    const sum = Object.values(result.perModel).reduce((s, m) => s + m.totalCostUsd, 0);
    expect(result.totalUsd).toBeCloseTo(sum, 6);
  });

  it('unknown model → confidence unknown, cost 0', () => {
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'nonexistent-model-99',
            inputTokens: 100_000,
            cacheReadTokens: 50_000,
            cacheWriteTokens: 10_000,
            outputTokens: 20_000,
          },
        ],
      },
      TEST_TABLE,
    );

    expect(result.confidence).toBe('unknown');
    expect(result.totalUsd).toBe(0);
    expect(result.perModel['nonexistent-model-99']!.totalCostUsd).toBe(0);
    expect(result.perModel['nonexistent-model-99']!.inputTokens).toBe(100_000);
  });

  it('custom pricing table override → uses custom rates', () => {
    const customTable: PricingTable = {
      'my-model': { input: 10.0, cacheRead: 2.5, cacheWrite: 5.0, output: 20.0 },
    };

    // max(0, 1,000,000 - 500,000) = 500,000 input × 10/M = $5
    // 500,000 cacheRead × 2.5/M = $1.25
    // 100,000 cacheWrite × 5/M = $0.5
    // 200,000 output × 20/M = $4
    // Total = $10.75
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'my-model',
            inputTokens: 1_000_000,
            cacheReadTokens: 500_000,
            cacheWriteTokens: 100_000,
            outputTokens: 200_000,
          },
        ],
      },
      customTable,
    );

    expect(result.confidence).toBe('known');
    expect(result.totalUsd).toBeCloseTo(10.75, 6);
  });

  it('zero tokens → zero cost', () => {
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'claude-sonnet-4',
            inputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 0,
          },
        ],
      },
      TEST_TABLE,
    );

    expect(result.confidence).toBe('known');
    expect(result.totalUsd).toBe(0);
    expect(result.perModel['claude-sonnet-4']!.totalCostUsd).toBe(0);
  });

  it('cache-heavy session → verify cacheRead discount applies', () => {
    // Scenario: 1000 input, 500,000 cacheRead, 0 cacheWrite, 1000 output
    // gpt-4.1 rates: input=2, cacheRead=0.5, output=8
    // nonCachedInput = max(0, 1000 - 500,000) = 0
    // input cost = 0
    // cacheRead cost = 500,000 × 0.5 / 1M = 0.25
    // output cost = 1000 × 8 / 1M = 0.008
    // total = 0.258
    //
    // Without cache discount (all at input rate):
    // would be 1000 × 2 / 1M + 500,000 × 2 / 1M + 1000 × 8 / 1M = 0.002 + 1.0 + 0.008 = 1.01
    // So cache saves $0.752
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'gpt-4.1',
            inputTokens: 1_000,
            cacheReadTokens: 500_000,
            cacheWriteTokens: 0,
            outputTokens: 1_000,
          },
        ],
      },
      TEST_TABLE,
    );

    expect(result.confidence).toBe('known');
    expect(result.totalUsd).toBeCloseTo(0.258, 6);
    expect(result.perModel['gpt-4.1']!.cacheReadCostUsd).toBeCloseTo(0.25, 6);
    // Verify cache discount: cacheRead rate (0.5) < input rate (2.0)
    expect(result.perModel['gpt-4.1']!.cacheReadCostUsd).toBeLessThan(
      (500_000 * 2.0) / 1_000_000,
    );
  });

  it('model with partial rates → confidence estimated', () => {
    // partial-model has cacheRead=0, cacheWrite=0
    const result = calculateCost(
      {
        modelMetrics: [
          {
            model: 'partial-model',
            inputTokens: 1_000,
            cacheReadTokens: 1_000,
            cacheWriteTokens: 0,
            outputTokens: 1_000,
          },
        ],
      },
      TEST_TABLE,
    );

    expect(result.confidence).toBe('estimated');
    // nonCached: max(0, 1000 - 1000) = 0 × 1/M = 0, cacheRead: 1000 × 0/M = 0, output: 1000 × 5/M = 0.005
    expect(result.totalUsd).toBeCloseTo(0.005, 6);
  });
});
