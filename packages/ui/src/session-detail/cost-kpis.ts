/**
 * Pure compute function for the Cost & Models tab KPI strip.
 *
 * Derives 5 stat entries from model spend and hot-consumption data.
 */

import { formatCost, formatTokenCount } from '../comparative/format';

import type { HotConsumptionResult } from './hot-consumption';
import type { ModelSpendResult } from './model-spend';
import styles from './session-detail.module.css';
import type { StatEntry } from './session-stats';

/**
 * Compute the 5 KPI stats shown at the top of the Cost & Models tab.
 *
 * | # | Label          | Source                                        |
 * |---|----------------|-----------------------------------------------|
 * | 0 | Total Cost     | modelSpend totals estimated USD                |
 * | 1 | Models Used    | modelSpend row count                           |
 * | 2 | API Requests   | modelSpend totals request count                |
 * | 3 | Cache Hit Rate | cacheRead / inputTokens × 100                  |
 * | 4 | Hottest Turn   | hotConsumption entries[0] tokens               |
 */
export function computeCostKpis(
  modelSpend: ModelSpendResult | null,
  hotConsumption: HotConsumptionResult,
  isLive: boolean,
): readonly StatEntry[] {
  /* 0 — Total Cost */
  const costValue = modelSpend?.totals.estimatedUsd ?? null;
  const totalCost: StatEntry = {
    value: costValue,
    display: formatCost(costValue),
    label: 'Total Cost',
    ...(isLive ? { pending: true } : {}),
  };

  /* 1 — Models Used */
  const modelsUsed: StatEntry = {
    value: modelSpend?.rows.length ?? 0,
    display: String(modelSpend?.rows.length ?? 0),
    label: 'Models Used',
  };

  /* 2 — API Requests */
  const apiRequests: StatEntry = {
    value: modelSpend?.totals.requestCount ?? 0,
    display: String(modelSpend?.totals.requestCount ?? 0),
    label: 'API Requests',
  };

  /* 3 — Cache Hit Rate */
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

  /* 4 — Hottest Turn */
  const hottestTokens = hotConsumption.entries[0]?.tokens ?? null;
  const hottestTurn: StatEntry = {
    value: hottestTokens,
    display: hottestTokens !== null ? formatTokenCount(hottestTokens) : '—',
    label: 'Hottest Turn',
  };

  return [totalCost, modelsUsed, apiRequests, cacheHitRate, hottestTurn] as const;
}

/**
 * Severity function for cost KPI strip cards.
 *
 * - Index 0 (Total Cost): critical > $20, warning > $5, pending style.
 * - Index 3 (Cache Hit Rate): warning when < 30%.
 */
export function costKpiSeverity(_index: number, stat: StatEntry): string {
  switch (_index) {
    case 0: {
      if (stat.pending) return styles['statCardPending'];
      const v = stat.value;
      if (v !== null && v > 20) return styles['statCardCritical'];
      if (v !== null && v > 5) return styles['statCardWarning'];
      return '';
    }
    case 3: {
      const v = stat.value;
      if (v !== null && v < 30) return styles['statCardWarning'];
      return '';
    }
    default:
      return '';
  }
}
