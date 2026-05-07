/**
 * Default pricing table and environment-override loader.
 *
 * Rates are USD per 1,000,000 tokens, sourced from the GitHub Copilot
 * billing documentation:
 * https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
 *
 * To override at runtime, set `AGENT_PROFILER_PRICING_PATH` to a JSON file
 * whose schema matches `PricingTable`.
 */

import type { ModelRateCard, PricingTable } from './types';

const ENV_OVERRIDE = 'AGENT_PROFILER_PRICING_PATH';

/**
 * Embedded default pricing table (last updated 2025-05-01).
 *
 * The key `cacheRead` corresponds to `cached_input` in the upstream JSON;
 * `cacheWrite` is the Anthropic cache-write surcharge.
 */
export const DEFAULT_PRICING_TABLE: PricingTable = {
  // OpenAI / GPT family
  'gpt-4.1': { input: 2.0, cacheRead: 0.5, cacheWrite: 0, output: 8.0 },
  'gpt-4o': { input: 2.5, cacheRead: 1.25, cacheWrite: 0, output: 10.0 },
  'gpt-5-mini': { input: 0.25, cacheRead: 0.025, cacheWrite: 0, output: 2.0 },
  'gpt-5.2': { input: 1.75, cacheRead: 0.175, cacheWrite: 0, output: 14.0 },
  'gpt-5.2-codex': { input: 1.75, cacheRead: 0.175, cacheWrite: 0, output: 14.0 },
  'gpt-5.3-codex': { input: 1.75, cacheRead: 0.175, cacheWrite: 0, output: 14.0 },
  'gpt-5.4': { input: 2.5, cacheRead: 0.25, cacheWrite: 0, output: 15.0 },
  'gpt-5.4-mini': { input: 0.75, cacheRead: 0.075, cacheWrite: 0, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cacheRead: 0.02, cacheWrite: 0, output: 1.25 },
  'gpt-5.5': { input: 5.0, cacheRead: 0.5, cacheWrite: 0, output: 30.0 },

  // Anthropic / Claude family
  'claude-haiku-4.5': { input: 1.0, cacheRead: 0.1, cacheWrite: 1.25, output: 5.0 },
  'claude-sonnet-4': { input: 3.0, cacheRead: 0.3, cacheWrite: 3.75, output: 15.0 },
  'claude-sonnet-4.5': { input: 3.0, cacheRead: 0.3, cacheWrite: 3.75, output: 15.0 },
  'claude-sonnet-4.6': { input: 3.0, cacheRead: 0.3, cacheWrite: 3.75, output: 15.0 },
  'claude-opus-4.5': { input: 5.0, cacheRead: 0.5, cacheWrite: 6.25, output: 25.0 },
  'claude-opus-4.6': { input: 5.0, cacheRead: 0.5, cacheWrite: 6.25, output: 25.0 },
  'claude-opus-4.6-fast': { input: 5.0, cacheRead: 0.5, cacheWrite: 6.25, output: 25.0 },
  'claude-opus-4.7': { input: 5.0, cacheRead: 0.5, cacheWrite: 6.25, output: 25.0 },

  // Google / Gemini family
  'gemini-2.5-pro': { input: 1.25, cacheRead: 0.125, cacheWrite: 0, output: 10.0 },
  'gemini-3-flash': { input: 0.5, cacheRead: 0.05, cacheWrite: 0, output: 3.0 },
  'gemini-3.1-pro': { input: 2.0, cacheRead: 0.2, cacheWrite: 0, output: 12.0 },

  // xAI
  'grok-code-fast-1': { input: 0.2, cacheRead: 0.02, cacheWrite: 0, output: 1.5 },

  // Internal / other
  'raptor-mini': { input: 0.25, cacheRead: 0.025, cacheWrite: 0, output: 2.0 },
  'goldeneye': { input: 1.25, cacheRead: 0.125, cacheWrite: 0, output: 10.0 },
} as const;

/**
 * Validate that a parsed object is a valid `PricingTable`.
 * Returns `null` if valid, or an error message if not.
 */
function validatePricingTable(data: unknown): PricingTable | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null;
  }

  const table: Record<string, ModelRateCard> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const card = value as Record<string, unknown>;
    table[key] = {
      input: typeof card['input'] === 'number' ? card['input'] : 0,
      cacheRead: typeof card['cacheRead'] === 'number' ? card['cacheRead'] : 0,
      cacheWrite: typeof card['cacheWrite'] === 'number' ? card['cacheWrite'] : 0,
      output: typeof card['output'] === 'number' ? card['output'] : 0,
    };
  }

  return Object.keys(table).length > 0 ? table : null;
}

/**
 * Load a pricing table from a JSON file path.
 * Returns `null` if the file cannot be read or parsed.
 *
 * The `node:fs` import is deferred so the module can be safely
 * imported in browser/renderer contexts that never call this function.
 */
function loadFromFile(filePath: string): PricingTable | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return validatePricingTable(parsed);
  } catch {
    return null;
  }
}

/**
 * Resolve the active pricing table.
 *
 * If `AGENT_PROFILER_PRICING_PATH` is set, loads and shallow-merges
 * that file on top of the default table. Invalid entries are skipped.
 */
export function loadPricingTable(): PricingTable {
  const overridePath = process.env[ENV_OVERRIDE];
  if (!overridePath) {
    return { ...DEFAULT_PRICING_TABLE };
  }

  const override = loadFromFile(overridePath);
  if (!override) {
    return { ...DEFAULT_PRICING_TABLE };
  }

  return { ...DEFAULT_PRICING_TABLE, ...override };
}
