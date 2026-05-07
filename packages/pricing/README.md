# @agent-profiler/pricing

Disjoint-billing cost calculator for GitHub Copilot sessions.

## Overview

This package implements **GitHub-style disjoint billing**, where token buckets
(input, cacheRead, cacheWrite, output) are billed separately without
subtraction. Each model has its own rate card specifying the cost per million
tokens for each bucket.

## Formula

For each model in a session:

```
cost = (inputTokens × inputRate
      + cacheReadTokens × cacheReadRate
      + cacheWriteTokens × cacheWriteRate
      + outputTokens × outputRate) / 1,000,000
```

The total session cost is the sum across all models.

## API

### `calculateCost(metrics, pricingTable?)`

Calculate the cost breakdown for a session's token usage.

```typescript
import { calculateCost } from '@agent-profiler/pricing';

const breakdown = calculateCost(shutdownMetrics);
console.log(breakdown.totalUsd);        // e.g. 0.1275
console.log(breakdown.confidence);      // 'known' | 'estimated' | 'unknown'
console.log(breakdown.perModel);        // per-model itemised costs
```

### `loadPricingTable()`

Load the active pricing table (default + env override).

```typescript
import { loadPricingTable } from '@agent-profiler/pricing';

const table = loadPricingTable();
console.log(table['claude-sonnet-4'].input); // 3.0 (USD per 1M tokens)
```

### `DEFAULT_PRICING_TABLE`

The embedded pricing constant, exported for inspection.

## Overriding the Pricing Table

Set the `AGENT_PROFILER_PRICING_PATH` environment variable to the path of a
JSON file containing your custom rates:

```bash
export AGENT_PROFILER_PRICING_PATH=./my-pricing.json
```

The JSON schema is a flat mapping of model names to rate cards:

```json
{
  "my-custom-model": {
    "input": 5.0,
    "cacheRead": 1.0,
    "cacheWrite": 2.5,
    "output": 15.0
  }
}
```

The override file is **shallow-merged** on top of the default table — you only
need to include models you wish to add or override.

## Confidence Flag

- **`known`** — model found in pricing table with all token buckets having
  non-zero rates
- **`estimated`** — model found but some buckets have zero/missing rates
  (e.g. cacheWrite for OpenAI models)
- **`unknown`** — model not found in pricing table; cost is reported as $0

## Source

Rates sourced from the
[GitHub Copilot billing documentation](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing).

## Precision

All USD values are rounded to 6 decimal places (micro-dollar precision).
