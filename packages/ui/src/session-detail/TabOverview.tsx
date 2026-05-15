/**
 * TabOverview — content panel for the "Overview" tab.
 *
 * Renders the full KPI grid plus four actionable token-analysis charts
 * in a two-column layout to help users understand and optimise token spending.
 */

import type { ModelMetrics, Turn, UtilisationSample } from '@agent-profiler/core';
import { memo } from 'react';

import { CacheHitPerTurnChart } from './CacheHitPerTurnChart';
import type { ContextWindowData } from './context-window';
import { ContextUtilisationChart } from './ContextUtilisationChart';
import { ContextWindowBar } from './ContextWindowBar';
import type { ModelSpendResult } from './model-spend';
import { ModelTokenDistribution } from './ModelTokenDistribution';
import { Section } from './Section';
import styles from './session-detail.module.css';
import type { SessionStats } from './session-stats';
import { StatsGrid } from './StatsGrid';
import { TokenCompositionChart } from './TokenCompositionChart';
import { TokensPerTurnChart } from './TokensPerTurnChart';
import { TurnDurationChart } from './TurnDurationChart';

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
  readonly utilisation: readonly UtilisationSample[];
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
  utilisation,
}: TabOverviewProps) {
  const costByModel = modelSpend
    ? Object.fromEntries(modelSpend.rows.map((r) => [r.model, r.estimatedUsd]))
    : undefined;

  return (
    <div data-testid="tab-overview">
      {/* Full 11-stat grid */}
      <StatsGrid stats={stats} />

      {/* Charts grid: 4 columns on wide screens, 2 on medium, 1 on narrow */}
      <div className={styles['chartsGrid']}>
        <Section title="Context window composition">
          <ContextWindowBar data={contextWindow} />
        </Section>

        <Section title="Token composition">
          <TokenCompositionChart modelSpend={modelSpend} />
        </Section>

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

        <Section title="Cache hit rate per turn" wide>
          <CacheHitPerTurnChart turns={turns} />
        </Section>

        <Section title="Turn duration (top 15)">
          <TurnDurationChart turns={turns} />
        </Section>

        {utilisation.length > 0 && (
          <Section title="Context utilisation over time">
            <ContextUtilisationChart samples={utilisation} />
          </Section>
        )}
      </div>
    </div>
  );
}

/** Overview tab content panel. */
export const TabOverview = memo(TabOverviewInner);
TabOverview.displayName = 'TabOverview';
