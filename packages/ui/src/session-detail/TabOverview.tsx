/**
 * TabOverview — content panel for the "Overview" tab.
 *
 * Renders the full KPI grid, context window composition, context
 * utilisation chart, compactions table, and event types table in a
 * two-column layout.
 */

import type { Compaction, UtilisationSample } from '@agent-profiler/core';
import { memo } from 'react';

import { CompactionsTable } from './CompactionsTable';
import type { ContextWindowData } from './context-window';
import { ContextUtilisationChart } from './ContextUtilisationChart';
import { ContextWindowBar } from './ContextWindowBar';
import type { EventTypeRow } from './event-type-stats';
import { EventTypesTable } from './EventTypesTable';
import { Section } from './Section';
import styles from './session-detail.module.css';
import type { SessionStats } from './session-stats';
import { StatsGrid } from './StatsGrid';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabOverview} component. */
export interface TabOverviewProps {
  readonly stats: SessionStats;
  readonly contextWindow: ContextWindowData | null;
  readonly utilisationSamples: readonly UtilisationSample[];
  readonly compactions: readonly Compaction[];
  readonly eventTypes: readonly EventTypeRow[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabOverviewInner({
  stats,
  contextWindow,
  utilisationSamples,
  compactions,
  eventTypes,
}: TabOverviewProps) {
  return (
    <div data-testid="tab-overview">
      {/* Full 11-stat grid */}
      <StatsGrid stats={stats} />

      {/* Two-column layout for context views + event tables */}
      <div className={styles['twoColumnGrid']}>
        {/* Left column: context bar + chart */}
        <div>
          <Section title="Context window composition">
            <ContextWindowBar data={contextWindow} />
          </Section>

          <Section title="Context utilisation over time">
            <ContextUtilisationChart samples={utilisationSamples} />
          </Section>
        </div>

        {/* Right column: compactions + events */}
        <div>
          {compactions.length > 0 && (
            <Section title="Compactions">
              <CompactionsTable compactions={compactions} />
            </Section>
          )}

          <Section title="Event types observed">
            <EventTypesTable rows={eventTypes} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/** Overview tab content panel. */
export const TabOverview = memo(TabOverviewInner);
TabOverview.displayName = 'TabOverview';
