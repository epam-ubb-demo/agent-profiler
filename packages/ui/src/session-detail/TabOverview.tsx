/**
 * TabOverview — content panel for the "Overview" tab.
 *
 * Renders the full KPI grid plus four actionable token-analysis charts
 * in a two-column layout to help users understand and optimise token spending.
 */

import type { ModelMetrics, Turn } from '@agent-profiler/core';
import { memo } from 'react';

import type { ContextWindowData } from './context-window';
import { ContextWindowBar } from './ContextWindowBar';
import type { ModelSpendResult } from './model-spend';
import { ModelTokenDistribution } from './ModelTokenDistribution';
import { Section } from './Section';
import styles from './session-detail.module.css';
import type { SessionStats } from './session-stats';
import { StatsGrid } from './StatsGrid';
import { TokenCompositionChart } from './TokenCompositionChart';
import { TokensPerTurnChart } from './TokensPerTurnChart';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabOverview} component. */
export interface TabOverviewProps {
  readonly stats: SessionStats;
  readonly contextWindow: ContextWindowData | null;
  readonly modelColours: Record<string, string>;
  readonly modelMetrics: readonly ModelMetrics[];
  readonly modelSpend: ModelSpendResult | null;
  readonly turns: readonly Turn[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabOverviewInner({
  stats,
  contextWindow,
  modelColours,
  modelMetrics,
  modelSpend,
  turns,
}: TabOverviewProps) {
  const costByModel = modelSpend
    ? Object.fromEntries(modelSpend.rows.map((r) => [r.model, r.estimatedUsd]))
    : undefined;

  return (
    <div data-testid="tab-overview">
      {/* Full 11-stat grid */}
      <StatsGrid stats={stats} />

      {/* Two-column layout: left = context composition + token composition; right = model distribution + per-turn spend */}
      <div className={styles['twoColumnGrid']}>
        {/* Left column */}
        <div>
          <Section title="Context window composition">
            <ContextWindowBar data={contextWindow} />
          </Section>

          <Section title="Token composition">
            <TokenCompositionChart modelSpend={modelSpend} />
          </Section>
        </div>

        {/* Right column */}
        <div>
          <Section title="Token distribution by model">
              <ModelTokenDistribution
                modelColours={modelColours}
                modelMetrics={modelMetrics}
                {...(costByModel ? { costByModel } : {})}
              />
            </Section>

          <Section title="Token spend per turn (top 15)">
            <TokensPerTurnChart turns={turns} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Overview tab content panel. */
export const TabOverview = memo(TabOverviewInner);
TabOverview.displayName = 'TabOverview';
