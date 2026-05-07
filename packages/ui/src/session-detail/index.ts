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
