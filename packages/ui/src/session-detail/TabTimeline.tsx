/**
 * TabTimeline — content panel for the "Timeline" tab.
 *
 * Renders the interactive SVG timeline and the fan-out timeline detail.
 */

import type { Session } from '@agent-profiler/core';
import { memo } from 'react';

import { Timeline } from '../timeline/Timeline';

import { FanoutTimeline } from './FanoutTimeline';
import { Section } from './Section';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

/** Props for the {@link TabTimeline} component. */
export interface TabTimelineProps {
  readonly session: Session;
  readonly modelColours: Record<string, string>;
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: ((sessionId: string) => void) | undefined;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function TabTimelineInner({ session, modelColours, onSessionNavigate }: TabTimelineProps) {
  return (
    <div data-testid="tab-timeline">
      <Section title="Timeline">
        <Timeline session={session} />
      </Section>

      <Section title="Fan-out timeline">
        <FanoutTimeline session={session} modelColours={modelColours} {...(onSessionNavigate ? { onSessionNavigate } : {})} />
      </Section>
    </div>
  );
}

/** Timeline tab content panel. */
export const TabTimeline = memo(TabTimelineInner);
TabTimeline.displayName = 'TabTimeline';
