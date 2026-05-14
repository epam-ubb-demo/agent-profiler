/**
 * SessionDetailView — orchestrator component rendering the session detail
 * report as a sticky header with compact KPIs + tabbed content panels.
 *
 * Computation is performed once via useMemo and threaded down as pre-computed
 * props to the active tab panel. The component owns tab state and the
 * "include compactions" toggle state for the hot-consumption table.
 */

import type { Session } from '@agent-profiler/core';
import { Alert } from '@epam/uui';
import { memo, useCallback, useMemo, useState } from 'react';

import { modelColour } from '../timeline/utils';

import { CompactKpiStrip } from './CompactKpiStrip';
import { computeContextWindow } from './context-window';
import { computeCostKpis } from './cost-kpis';
import { computeEventTypeStats } from './event-type-stats';
import { computeHotConsumption } from './hot-consumption';
import { computeModelSpend } from './model-spend';
import styles from './session-detail.module.css';
import { computeSessionStats } from './session-stats';
import { SessionAlerts } from './SessionAlerts';
import { SessionHeader } from './SessionHeader';
import type { TabId } from './SessionTabs';
import { SessionTabs } from './SessionTabs';
import { TabCostModels } from './TabCostModels';
import { TabOverview } from './TabOverview';
import { TabTimeline } from './TabTimeline';
import { TabTools } from './TabTools';
import { computeTimelineKpis } from './timeline-kpis';
import { computeToolInventory } from './tool-inventory';
import { computeToolKpis } from './tool-kpis';
import { computeToolStats } from './tool-stats';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface SessionDetailViewProps {
  readonly session: Session;
  readonly onBack?: () => void;
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: ((sessionId: string) => void) | undefined;
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function SessionDetailViewInner({ session, onBack, onSessionNavigate }: SessionDetailViewProps) {
  /* --- tab state ---------------------------------------------------- */
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  /* --- toggle state for hot-consumption compaction filter ----------- */
  const [includeCompactions, setIncludeCompactions] = useState(false);
  const toggleCompactions = useCallback(() => {
    setIncludeCompactions((prev) => !prev);
  }, []);

  /* --- live session detection --------------------------------------- */
  const isLive = session.shutdown === null && session.startTs !== null;
  const [liveAlertDismissed, setLiveAlertDismissed] = useState(false);

  /* --- derived data ------------------------------------------------ */
  const modelColours = useMemo(() => buildModelColours(session), [session]);

  const stats = useMemo(() => computeSessionStats(session, { isLive }), [session, isLive]);

  const modelSpend = useMemo(
    () => computeModelSpend(session),
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

  /* --- per-tab KPI strips ------------------------------------------ */
  const costKpis = useMemo(
    () => computeCostKpis(modelSpend, hotConsumption, isLive),
    [modelSpend, hotConsumption, isLive],
  );
  const toolKpis = useMemo(
    () => computeToolKpis(toolStats, toolStats.frequencyStats, toolInventory),
    [toolStats, toolInventory],
  );
  const timelineKpis = useMemo(
    () => computeTimelineKpis(session, isLive),
    [session, isLive],
  );

  /* --- tab notification logic --------------------------------------- */
  const tabNotifications = useMemo<Partial<Record<TabId, boolean>>>(() => {
    const notifications: Partial<Record<TabId, boolean>> = {};

    /* "cost-models" tab: notify when cost is high or task failed */
    if (
      (stats.estimatedCost.value !== null && stats.estimatedCost.value > 5)
      || stats.taskSuccess.value === 0
    ) {
      notifications['cost-models'] = true;
    }

    /* "overview" tab: notify when parse status is partial or failed */
    const parseStatus = session.parseStatus.status;
    if (parseStatus === 'partial' || parseStatus === 'failed') {
      notifications['overview'] = true;
    }

    return notifications;
  }, [stats, session.parseStatus.status]);

  /* --- render ------------------------------------------------------ */
  return (
    <div className={styles['pageContainer']} data-testid="session-detail-view">
      {/* === Sticky header ============================================ */}
      <div className={styles['stickyHeader']}>
        {/* 1. Header */}
        <SessionHeader
          sessionId={session.sessionId}
          repo={session.repository}
          branch={session.branch}
          copilotVersion={session.copilotVersion}
          selectedModel={session.selectedModel}
          reasoningEffort={session.reasoningEffort}
          parseStatus={session.parseStatus.status}
          isLive={isLive}
          {...(onBack ? { onBack } : {})}
        />

        {/* 1b. Live session alert */}
        {isLive && !liveAlertDismissed && (
          <div className={styles.liveAlert} data-testid="live-session-alert">
            <Alert
              color="info"
              onClose={() => setLiveAlertDismissed(true)}
              rawProps={{ 'aria-live': 'polite' }}
            >
              This session is still active — some metrics will update when it completes.
            </Alert>
          </div>
        )}

        {/* 2. Parse / data-quality alerts */}
        <SessionAlerts
          parseStatus={session.parseStatus}
          hasShutdown={session.shutdown !== null}
        />

        {/* 3. Compact KPI strip */}
        <CompactKpiStrip stats={stats} />

        {/* 4. Tab bar */}
        <SessionTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabNotifications={tabNotifications}
        />
      </div>

      {/* === Tab content ============================================== */}
      <div className={styles['tabContent']}>
        {activeTab === 'overview' && (
          <TabOverview
            stats={stats}
            contextWindow={contextWindow}
            modelColours={modelColours}
            modelMetrics={session.shutdown?.modelMetrics ?? []}
            modelSpend={modelSpend}
            turns={session.turns}
          />
        )}

        {activeTab === 'cost-models' && (
          <TabCostModels
            modelSpend={modelSpend}
            modelColours={modelColours}
            isLive={isLive}
            subagents={session.subagents}
            hotConsumption={hotConsumption}
            includeCompactions={includeCompactions}
            onToggleCompactions={toggleCompactions}
            compactions={session.compactions}
            onSessionNavigate={onSessionNavigate}
            costKpis={costKpis}
          />
        )}

        {activeTab === 'tools' && (
          <TabTools
            toolStats={toolStats}
            toolFrequencyRows={toolStats.frequencyStats}
            toolInventory={toolInventory}
            modelColours={modelColours}
            toolKpis={toolKpis}
          />
        )}

        {activeTab === 'timeline' && (
          <TabTimeline
            session={session}
            modelColours={modelColours}
            eventTypes={eventTypes}
            onSessionNavigate={onSessionNavigate}
            timelineKpis={timelineKpis}
          />
        )}
      </div>
    </div>
  );
}

export const SessionDetailView = memo(SessionDetailViewInner);
SessionDetailView.displayName = 'SessionDetailView';
