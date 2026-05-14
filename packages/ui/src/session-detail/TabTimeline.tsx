/**
 * TabTimeline — content panel for the "Timeline" tab.
 *
 * Renders the interactive SVG timeline, the fan-out timeline detail,
 * and the event types observed for this session.
 */

import type { Session } from '@agent-profiler/core';
import { memo } from 'react';

import { Timeline } from '../timeline/Timeline';

import type { EventTypeRow } from './event-type-stats';
import { EventTypesTable } from './EventTypesTable';
import { FanoutTimeline } from './FanoutTimeline';
import { Section } from './Section';
import type { StatEntry } from './session-stats';
import { TabKpiStrip } from './TabKpiStrip';
import { timelineKpiSeverity } from './timeline-kpis';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabTimeline} component. */
export interface TabTimelineProps {
  readonly session: Session;
  readonly modelColours: Record<string, string>;
  readonly eventTypes: readonly EventTypeRow[];
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: ((sessionId: string) => void) | undefined;
  /** Pre-computed KPI stats for the timeline strip. */
  readonly timelineKpis: readonly StatEntry[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabTimelineInner({ session, modelColours, eventTypes, onSessionNavigate, timelineKpis }: TabTimelineProps) {
  return (
    <div data-testid="tab-timeline">
      {/* KPI strip */}
      <TabKpiStrip stats={timelineKpis} severityFn={timelineKpiSeverity} testIdPrefix="timeline-kpi" />

      <Section title="Timeline">
        <Timeline session={session} />
      </Section>

      <Section title="Fan-out timeline">
        <FanoutTimeline session={session} modelColours={modelColours} {...(onSessionNavigate ? { onSessionNavigate } : {})} />
      </Section>

      <Section title="Event types observed">
        <EventTypesTable rows={eventTypes} />
      </Section>
    </div>
  );
}

/** Timeline tab content panel. */
export const TabTimeline = memo(TabTimelineInner);
TabTimeline.displayName = 'TabTimeline';
