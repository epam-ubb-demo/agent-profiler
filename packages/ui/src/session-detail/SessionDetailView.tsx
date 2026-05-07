/**
 * SessionDetailView — orchestrator component that renders all 13 sections
 * of the session detail report in mock-up order.
 *
 * Computation is performed once via useMemo and threaded down as pre-computed
 * props. The component owns the "include compactions" toggle state for the
 * hot-consumption table.
 */

import type { Session } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useCallback, useMemo, useState } from 'react';

import { Timeline } from '../timeline/Timeline';
import { modelColour } from '../timeline/utils';

import { CompactionsTable } from './CompactionsTable';
import { computeContextWindow } from './context-window';
import { ContextUtilisationChart } from './ContextUtilisationChart';
import { ContextWindowBar } from './ContextWindowBar';
import { computeEventTypeStats } from './event-type-stats';
import { EventTypesTable } from './EventTypesTable';
import { FanoutTimeline } from './FanoutTimeline';
import { computeHotConsumption } from './hot-consumption';
import { HotConsumptionTable } from './HotConsumptionTable';
import { computeModelSpend } from './model-spend';
import { ModelSpendTable } from './ModelSpendTable';
import styles from './session-detail.module.css';
import { computeSessionStats } from './session-stats';
import { SessionHeader } from './SessionHeader';
import { StatsGrid } from './StatsGrid';
import { SubagentTable } from './SubagentTable';
import { computeToolInventory } from './tool-inventory';
import { computeToolStats } from './tool-stats';
import { ToolFrequencyTable } from './ToolFrequencyTable';
import { ToolInventoryTable } from './ToolInventoryTable';
import { ToolTokenTable } from './ToolTokenTable';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface SessionDetailViewProps {
  readonly session: Session;
  readonly onBack?: () => void;
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: (sessionId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a stable model→colour lookup from all models observed in the session. */
function buildModelColours(session: Session): Record<string, string> {
  const models = new Set<string>();
  for (const msg of session.assistantMessages) {
    if (msg.model) models.add(msg.model);
  }
  if (session.selectedModel) models.add(session.selectedModel);
  if (session.shutdown) {
    for (const m of session.shutdown.modelMetrics) {
      models.add(m.model);
    }
  }
  const record: Record<string, string> = {};
  for (const model of models) {
    record[model] = modelColour(model);
  }
  return record;
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

interface SectionProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section>
      <Text cx={styles['sectionHeading']} size="24" fontWeight="600">
        {title}
      </Text>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function SessionDetailViewInner({ session, onBack, onSessionNavigate }: SessionDetailViewProps) {
  /* --- toggle state for hot-consumption compaction filter ----------- */
  const [includeCompactions, setIncludeCompactions] = useState(false);
  const toggleCompactions = useCallback(() => {
    setIncludeCompactions((prev) => !prev);
  }, []);

  /* --- derived data ------------------------------------------------ */
  const modelColours = useMemo(() => buildModelColours(session), [session]);

  const stats = useMemo(() => computeSessionStats(session), [session]);

  const modelSpend = useMemo(
    () => (session.shutdown ? computeModelSpend(session.shutdown) : null),
    [session],
  );

  const hotConsumption = useMemo(
    () => computeHotConsumption(session, { includeCompactions }),
    [session, includeCompactions],
  );

  const contextWindow = useMemo(
    () => (session.shutdown ? computeContextWindow(session.shutdown) : null),
    [session],
  );

  const toolStats = useMemo(() => computeToolStats(session), [session]);
  const toolInventory = useMemo(() => computeToolInventory(session), [session]);
  const eventTypes = useMemo(() => computeEventTypeStats(session), [session]);

  /* --- render ------------------------------------------------------ */
  return (
    <div className={styles['pageContainer']} data-testid="session-detail-view">
      {/* 1. Header */}
      <SessionHeader
        sessionId={session.sessionId}
        repo={session.repository}
        branch={session.branch}
        copilotVersion={session.copilotVersion}
        selectedModel={session.selectedModel}
        reasoningEffort={session.reasoningEffort}
        parseStatus={session.parseStatus.status}
        {...(onBack ? { onBack } : {})}
      />

      {/* 2. KPI stats grid */}
      <StatsGrid stats={stats} />

      {/* 3. Per-model spend */}
      {modelSpend && (
        <Section title="Per-model spend">
          <ModelSpendTable result={modelSpend} modelColours={modelColours} />
        </Section>
      )}

      {/* 4. Hottest token consumption */}
      <Section title="Hottest token consumption points">
        <HotConsumptionTable
          result={hotConsumption}
          includeCompactions={includeCompactions}
          onToggleCompactions={toggleCompactions}
          modelColours={modelColours}
          onSessionNavigate={onSessionNavigate}
        />
      </Section>

      {/* 5. Context window composition */}
      <Section title="Context window composition">
        <ContextWindowBar data={contextWindow} />
      </Section>

      {/* 6. Timeline */}
      <Section title="Timeline">
        <Timeline session={session} />
      </Section>

      {/* 7. Fan-out timeline */}
      <Section title="Fan-out timeline">
        <FanoutTimeline session={session} modelColours={modelColours} onSessionNavigate={onSessionNavigate} />
      </Section>

      {/* 8. Context utilisation over time */}
      <Section title="Context utilisation over time">
        <ContextUtilisationChart samples={session.utilisation} />
      </Section>

      {/* 9. Token consumption per tool call */}
      <Section title="Token consumption per tool call">
        <ToolTokenTable result={toolStats} modelColours={modelColours} />
      </Section>

      {/* 10. Tool-call frequency (top 15) */}
      <Section title="Tool-call frequency (top 15)">
        <ToolFrequencyTable rows={toolStats.frequencyStats} />
      </Section>

      {/* 11. Tool usage by category */}
      <Section title="Tool usage by category">
        <ToolInventoryTable result={toolInventory} />
      </Section>

      {/* 12. Sub-agent fan-outs */}
      {session.subagents.length > 0 && (
        <Section title="Sub-agent fan-outs">
          <SubagentTable subagents={session.subagents} onSessionNavigate={onSessionNavigate} />
        </Section>
      )}

      {/* 13. Compactions */}
      {session.compactions.length > 0 && (
        <Section title="Compactions">
          <CompactionsTable compactions={session.compactions} />
        </Section>
      )}

      {/* 14. Event types observed */}
      <Section title="Event types observed">
        <EventTypesTable rows={eventTypes} />
      </Section>
    </div>
  );
}

export const SessionDetailView = memo(SessionDetailViewInner);
SessionDetailView.displayName = 'SessionDetailView';
