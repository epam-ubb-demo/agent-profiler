/**
 * Unit tests for the pricing table loader.
 */

import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PRICING_TABLE, loadPricingTable } from '../src/pricing-table';

describe('pricing-table', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DEFAULT_PRICING_TABLE contains expected models', () => {
    expect(DEFAULT_PRICING_TABLE['claude-sonnet-4']).toBeDefined();
    expect(DEFAULT_PRICING_TABLE['gpt-4.1']).toBeDefined();
    expect(DEFAULT_PRICING_TABLE['claude-haiku-4.5']).toBeDefined();
    expect(DEFAULT_PRICING_TABLE['gpt-5.4']).toBeDefined();
  });

  it('all rate cards have required fields', () => {
    for (const [model, card] of Object.entries(DEFAULT_PRICING_TABLE)) {
      expect(card, `${model} missing input`).toHaveProperty('input');
      expect(card, `${model} missing cacheRead`).toHaveProperty('cacheRead');
      expect(card, `${model} missing cacheWrite`).toHaveProperty('cacheWrite');
      expect(card, `${model} missing output`).toHaveProperty('output');
      expect(typeof card.input).toBe('number');
      expect(typeof card.output).toBe('number');
    }
  });

  it('loadPricingTable returns defaults when no env var set', () => {
    vi.stubEnv('AGENT_PROFILER_PRICING_PATH', '');
    const table = loadPricingTable();
    expect(table['claude-sonnet-4']).toEqual(DEFAULT_PRICING_TABLE['claude-sonnet-4']);
  });

  it('loadPricingTable merges override file from env', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'custom-pricing.json');
    vi.stubEnv('AGENT_PROFILER_PRICING_PATH', fixturePath);

    const table = loadPricingTable();
    // Custom model from fixture
    expect(table['custom-model']).toEqual({
      input: 10.0,
      cacheRead: 2.5,
      cacheWrite: 5.0,
      output: 20.0,
    });
    // Default models still present
    expect(table['claude-sonnet-4']).toEqual(DEFAULT_PRICING_TABLE['claude-sonnet-4']);
  });

  it('loadPricingTable ignores invalid file path', () => {
    vi.stubEnv('AGENT_PROFILER_PRICING_PATH', '/nonexistent/path/pricing.json');
    const table = loadPricingTable();
    // Falls back to defaults
    expect(table['gpt-4.1']).toEqual(DEFAULT_PRICING_TABLE['gpt-4.1']);
  });

  it('missing model returns undefined from table', () => {
    const table = loadPricingTable();
    expect(table['totally-unknown-model']).toBeUndefined();
  });
});
