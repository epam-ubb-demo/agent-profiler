/**
 * TabCostModels — content panel for the "Cost & Models" tab.
 *
 * Renders the per-model spend table, optional sub-agent table, and
 * hottest token consumption table.
 */

import type { SubagentInvocation } from '@agent-profiler/core';
import { memo } from 'react';

import type { HotConsumptionResult } from './hot-consumption';
import { HotConsumptionTable } from './HotConsumptionTable';
import type { ModelSpendResult } from './model-spend';
import { ModelSpendTable } from './ModelSpendTable';
import { Section } from './Section';
import { SubagentTable } from './SubagentTable';

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
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: ((sessionId: string) => void) | undefined;
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
  onSessionNavigate,
}: TabCostModelsProps) {
  return (
    <div data-testid="tab-cost-models">
      {/* Per-model spend */}
      {modelSpend && (
        <Section title="Per-model spend">
          <ModelSpendTable result={modelSpend} modelColours={modelColours} isLive={isLive} />
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
