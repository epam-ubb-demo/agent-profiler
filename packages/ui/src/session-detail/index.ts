/**
 * Session detail sub-barrel — re-exports all session detail components,
 * computation utilities, and their associated types.
 */

// Computation utilities
export { computeSessionStats } from './session-stats';
export type { SessionStats, StatEntry } from './session-stats';

export { computeModelSpend } from './model-spend';
export type { ModelSpendResult, ModelSpendRow, ModelSpendTotals } from './model-spend';

export { computeHotConsumption } from './hot-consumption';
export type {
  HotConsumptionEntry,
  HotConsumptionOptions,
  HotConsumptionResult,
  HotConsumptionType,
} from './hot-consumption';

export { computeContextWindow } from './context-window';
export type { ContextWindowData, ContextWindowSegment } from './context-window';

export { computeToolStats } from './tool-stats';
export type { ToolFrequencyRow, ToolStatsResult, ToolTokenRow } from './tool-stats';

export { computeCostKpis, costKpiSeverity } from './cost-kpis';
export { computeToolKpis, toolKpiSeverity } from './tool-kpis';
export { computeTimelineKpis, timelineKpiSeverity } from './timeline-kpis';

export { computeEventTypeStats } from './event-type-stats';
export type { EventTypeRow } from './event-type-stats';

// UI components
export { SessionHeader } from './SessionHeader';
export type { SessionHeaderProps } from './SessionHeader';

export { StatsGrid } from './StatsGrid';
export type { StatsGridProps } from './StatsGrid';

export { ModelSpendTable } from './ModelSpendTable';
export type { ModelSpendTableProps } from './ModelSpendTable';

export { HotConsumptionTable } from './HotConsumptionTable';
export type { HotConsumptionTableProps } from './HotConsumptionTable';

export { ContextWindowBar } from './ContextWindowBar';
export type { ContextWindowBarProps } from './ContextWindowBar';

export { ContextUtilisationChart } from './ContextUtilisationChart';
export type { ContextUtilisationChartProps } from './ContextUtilisationChart';

export { ContextTokenTimeline } from './ContextTokenTimeline';
export type { ContextTokenTimelineProps } from './ContextTokenTimeline';

export { ModelTokenDistribution } from './ModelTokenDistribution';
export type { ModelTokenDistributionProps } from './ModelTokenDistribution';

export { TokenCompositionChart } from './TokenCompositionChart';
export type { TokenCompositionChartProps } from './TokenCompositionChart';

export { TokensPerTurnChart } from './TokensPerTurnChart';
export type { TokensPerTurnChartProps } from './TokensPerTurnChart';

export { ToolTokenTable } from './ToolTokenTable';
export type { ToolTokenTableProps } from './ToolTokenTable';

export { ToolFrequencyTable } from './ToolFrequencyTable';
export type { ToolFrequencyTableProps } from './ToolFrequencyTable';

export { SubagentTable } from './SubagentTable';
export type { SubagentTableProps } from './SubagentTable';

export { CompactionsTable } from './CompactionsTable';
export type { CompactionsTableProps } from './CompactionsTable';

export { EventTypesTable } from './EventTypesTable';
export type { EventTypesTableProps } from './EventTypesTable';

export { FanoutTimeline } from './FanoutTimeline';
export type { FanoutTimelineProps } from './FanoutTimeline';

export { SessionDetailView } from './SessionDetailView';
export type { SessionDetailViewProps } from './SessionDetailView';

// New tabbed layout components
export { Section } from './Section';
export type { SectionProps } from './Section';

export { CompactKpiStrip } from './CompactKpiStrip';
export type { CompactKpiStripProps } from './CompactKpiStrip';

export { TabKpiStrip } from './TabKpiStrip';
export type { TabKpiStripProps } from './TabKpiStrip';

export { SessionTabs, TAB_IDS } from './SessionTabs';
export type { SessionTabsProps, TabId } from './SessionTabs';

export { TabOverview } from './TabOverview';
export type { TabOverviewProps } from './TabOverview';

export { TabCostModels } from './TabCostModels';
export type { TabCostModelsProps } from './TabCostModels';

export { TabTools } from './TabTools';
export type { TabToolsProps } from './TabTools';

export { TabTimeline } from './TabTimeline';
export type { TabTimelineProps } from './TabTimeline';
