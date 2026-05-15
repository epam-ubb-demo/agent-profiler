/**
 * TabTools — content panel for the "Tools" tab.
 *
 * Renders the token consumption per tool call table, tool-call
 * frequency table, and tool usage by category table.
 */

import type { Turn } from '@agent-profiler/core';
import { memo } from 'react';

import { Section } from './Section';
import type { StatEntry } from './session-stats';
import { TabKpiStrip } from './TabKpiStrip';
import type { ToolInventoryResult } from './tool-inventory';
import { toolKpiSeverity } from './tool-kpis';
import type { ToolFrequencyRow, ToolStatsResult } from './tool-stats';
import { ToolFrequencyTable } from './ToolFrequencyTable';
import { ToolInventoryTable } from './ToolInventoryTable';
import { ToolLatencyChart } from './ToolLatencyChart';
import { ToolTokenTable } from './ToolTokenTable';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabTools} component. */
export interface TabToolsProps {
  readonly toolStats: ToolStatsResult;
  readonly toolFrequencyRows: readonly ToolFrequencyRow[];
  readonly toolInventory: ToolInventoryResult;
  readonly modelColours: Record<string, string>;
  /** Pre-computed KPI stats for the tool strip. */
  readonly toolKpis: readonly StatEntry[];
  readonly turns: readonly Turn[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabToolsInner({
  toolStats,
  toolFrequencyRows,
  toolInventory,
  modelColours,
  toolKpis,
  turns,
}: TabToolsProps) {
  return (
    <div data-testid="tab-tools">
      {/* KPI strip */}
      <TabKpiStrip stats={toolKpis} severityFn={toolKpiSeverity} testIdPrefix="tool-kpi" />

      <Section title="Slowest tool calls (top 10)">
        <ToolLatencyChart turns={turns} />
      </Section>

      <Section title="Token consumption per tool call">
        <ToolTokenTable result={toolStats} modelColours={modelColours} />
      </Section>

      <Section title="Tool-call frequency (top 15)">
        <ToolFrequencyTable rows={toolFrequencyRows} />
      </Section>

      <Section title="Tool usage by category">
        <ToolInventoryTable result={toolInventory} />
      </Section>
    </div>
  );
}

/** Tools tab content panel. */
export const TabTools = memo(TabToolsInner);
TabTools.displayName = 'TabTools';
