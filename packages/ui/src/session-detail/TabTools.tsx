/**
 * TabTools — content panel for the "Tools" tab.
 *
 * Renders the token consumption per tool call table, tool-call
 * frequency table, and tool usage by category table.
 */

import { memo } from 'react';

import { Section } from './Section';
import type { ToolInventoryResult } from './tool-inventory';
import type { ToolFrequencyRow, ToolStatsResult } from './tool-stats';
import { ToolFrequencyTable } from './ToolFrequencyTable';
import { ToolInventoryTable } from './ToolInventoryTable';
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
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabToolsInner({
  toolStats,
  toolFrequencyRows,
  toolInventory,
  modelColours,
}: TabToolsProps) {
  return (
    <div data-testid="tab-tools">
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
