/**
 * Pure compute function for the Tools tab KPI strip.
 *
 * Derives 4 stat entries from tool statistics, frequency rows,
 * and the tool inventory result.
 */

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';
import type { StatEntry } from './session-stats';
import type { ToolInventoryResult } from './tool-inventory';
import type { ToolFrequencyRow, ToolStatsResult } from './tool-stats';

/**
 * Compute the 4 KPI stats shown at the top of the Tools tab.
 *
 * | # | Label        | Source                                  |
 * |---|--------------|----------------------------------------|
 * | 0 | Unique Tools | toolInventory.totalTools                |
 * | 1 | Total Calls  | toolInventory.totalCalls                |
 * | 2 | Top Tool     | toolFrequencyRows[0].callCount          |
 * | 3 | Def. Tokens  | toolInventory.toolDefinitionsTokens     |
 */
export function computeToolKpis(
  _toolStats: ToolStatsResult,
  toolFrequencyRows: readonly ToolFrequencyRow[],
  toolInventory: ToolInventoryResult,
): readonly StatEntry[] {
  /* 0 — Unique Tools */
  const uniqueTools: StatEntry = {
    value: toolInventory.totalTools,
    display: String(toolInventory.totalTools),
    label: 'Unique Tools',
  };

  /* 1 — Total Calls */
  const totalCalls: StatEntry = {
    value: toolInventory.totalCalls,
    display: String(toolInventory.totalCalls),
    label: 'Total Calls',
  };

  /* 2 — Top Tool */
  const topRow = toolFrequencyRows[0] as ToolFrequencyRow | undefined;
  const topCallCount = topRow?.callCount ?? null;
  const topTool: StatEntry = {
    value: topCallCount,
    display: topCallCount !== null ? String(topCallCount) : '—',
    label: 'Top Tool',
  };

  /* 3 — Def. Tokens */
  const defTokens = toolInventory.toolDefinitionsTokens;
  const defTokensStat: StatEntry = {
    value: defTokens,
    display: defTokens !== null ? formatTokenCount(defTokens) : '—',
    label: 'Def. Tokens',
  };

  return [uniqueTools, totalCalls, topTool, defTokensStat] as const;
}

/**
 * Severity function for tool KPI strip cards.
 *
 * - Index 3 (Def. Tokens): critical > 60 000, warning > 30 000.
 */
export function toolKpiSeverity(_index: number, stat: StatEntry): string {
  if (_index === 3) {
    const v = stat.value;
    if (v !== null && v > 60000) return styles['statCardCritical'];
    if (v !== null && v > 30000) return styles['statCardWarning'];
  }
  return '';
}
