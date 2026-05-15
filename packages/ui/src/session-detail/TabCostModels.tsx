/**
 * TabCostModels — content panel for the "Cost & Models" tab.
 *
 * Renders the per-model spend table, optional sub-agent table, hottest
 * token consumption table, and (when present) the compactions table.
 */

import type { Compaction, SubagentInvocation, Turn } from '@agent-profiler/core';
import { memo } from 'react';

import { CompactionsTable } from './CompactionsTable';
import { CostPerTurnChart } from './CostPerTurnChart';
import { costKpiSeverity } from './cost-kpis';
import { CumulativeCostChart } from './CumulativeCostChart';
import type { HotConsumptionResult } from './hot-consumption';
import { HotConsumptionTable } from './HotConsumptionTable';
import type { ModelSpendResult } from './model-spend';
import { ModelSpendTable } from './ModelSpendTable';
import { Section } from './Section';
import type { StatEntry } from './session-stats';
import { SubagentTable } from './SubagentTable';
import { TabKpiStrip } from './TabKpiStrip';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabCostModels} component. */
export interface TabCostModelsProps {
  readonly modelSpend: ModelSpendResult | null;
  readonly modelColours: Record<string, string>;
  readonly isLive: boolean;
  readonly subagents: readonly SubagentInvocation[];
  readonly hotConsumption: HotConsumptionResult;
  readonly includeCompactions: boolean;
  readonly onToggleCompactions: () => void;
  readonly compactions: readonly Compaction[];
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: ((sessionId: string) => void) | undefined;
  /** Pre-computed KPI stats for the cost strip. */
  readonly costKpis: readonly StatEntry[];
  readonly turns: readonly Turn[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabCostModelsInner({
  modelSpend,
  modelColours,
  isLive,
  subagents,
  hotConsumption,
  includeCompactions,
  onToggleCompactions,
  compactions,
  onSessionNavigate,
  costKpis,
  turns,
}: TabCostModelsProps) {
  return (
    <div data-testid="tab-cost-models">
      {/* KPI strip */}
      <TabKpiStrip stats={costKpis} severityFn={costKpiSeverity} testIdPrefix="cost-kpi" />

      {/* Cumulative cost curve */}
      <Section title="Cumulative cost over turns">
        <CumulativeCostChart turns={turns} />
      </Section>

      {/* Cost per turn (top 15) */}
      <Section title="Cost per turn (top 15)">
        <CostPerTurnChart turns={turns} />
      </Section>

      {/* Per-model spend */}
      {modelSpend && (
        <Section title="Per-model spend">
          <ModelSpendTable result={modelSpend} modelColours={modelColours} isLive={isLive} />
        </Section>
      )}

      {/* Compactions (when present) */}
      {compactions.length > 0 && (
        <Section title="Compactions">
          <CompactionsTable compactions={compactions} />
        </Section>
      )}

      {/* Sub-agent fan-outs */}
      {subagents.length > 0 && (
        <Section title="Sub-agent fan-outs">
          <SubagentTable subagents={subagents} {...(onSessionNavigate ? { onSessionNavigate } : {})} />
        </Section>
      )}

      {/* Hottest token consumption points */}
      <Section title="Hottest token consumption points">
        <HotConsumptionTable
          result={hotConsumption}
          includeCompactions={includeCompactions}
          onToggleCompactions={onToggleCompactions}
          modelColours={modelColours}
          {...(onSessionNavigate ? { onSessionNavigate } : {})}
        />
      </Section>
    </div>
  );
}

/** Cost & Models tab content panel. */
export const TabCostModels = memo(TabCostModelsInner);
TabCostModels.displayName = 'TabCostModels';
