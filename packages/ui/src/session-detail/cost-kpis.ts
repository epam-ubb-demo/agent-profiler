/**
 * Pure compute function for the Cost & Models tab KPI strip.
 *
 * Derives 5 stat entries from model spend and hot-consumption data.
 */

import { formatTokenCount } from '../comparative/format';

import type { HotConsumptionResult } from './hot-consumption';
import type { ModelSpendResult } from './model-spend';
import styles from './session-detail.module.css';
import type { StatEntry } from './session-stats';

/**
 * Compute the 4 KPI stats shown at the top of the Cost & Models tab.
 *
 * | # | Label          | Source                                        |
 * |---|----------------|-----------------------------------------------|
 * | 0 | Models Used    | modelSpend row count                           |
 * | 1 | API Requests   | modelSpend totals request count                |
 * | 2 | Cache Hit Rate | cacheRead / inputTokens × 100                  |
 * | 3 | Hottest Turn   | hotConsumption entries[0] tokens               |
 */
export function computeCostKpis(
  modelSpend: ModelSpendResult | null,
  hotConsumption: HotConsumptionResult,
): readonly StatEntry[] {
  /* 0 — Models Used */
  const modelsUsed: StatEntry = {
    value: modelSpend?.rows.length ?? 0,
    display: String(modelSpend?.rows.length ?? 0),
    label: 'Models Used',
  };

  /* 1 — API Requests */
  const apiRequests: StatEntry = {
    value: modelSpend?.totals.requestCount ?? 0,
    display: String(modelSpend?.totals.requestCount ?? 0),
    label: 'API Requests',
  };

  /* 2 — Cache Hit Rate */
  const inputTokens = modelSpend?.totals.inputTokens ?? 0;
  const cacheRead = modelSpend?.totals.cacheReadTokens ?? 0;
  const cacheRate = modelSpend !== null && inputTokens > 0
    ? (cacheRead / inputTokens) * 100
    : null;
  const cacheHitRate: StatEntry = {
    value: cacheRate,
    display: cacheRate !== null ? `${cacheRate.toFixed(0)}%` : '—',
    label: 'Cache Hit Rate',
  };

  /* 3 — Hottest Turn */
  const hottestTokens = hotConsumption.entries[0]?.tokens ?? null;
  const hottestTurn: StatEntry = {
    value: hottestTokens,
    display: hottestTokens !== null ? formatTokenCount(hottestTokens) : '—',
    label: 'Hottest Turn',
  };

  return [modelsUsed, apiRequests, cacheHitRate, hottestTurn] as const;
}

/**
 * Severity function for cost KPI strip cards.
 *
 * - Index 2 (Cache Hit Rate): warning when < 30%.
 */
export function costKpiSeverity(_index: number, stat: StatEntry): string {
  switch (_index) {
    case 2: {
      const v = stat.value;
      if (v !== null && v < 30) return styles['statCardWarning'];
      return '';
    }
    default:
      return '';
  }
}
