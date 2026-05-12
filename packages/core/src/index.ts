/**
 * @agent-profiler/core — public API barrel.
 *
 * Re-exports all domain types, Zod schemas, and IPC definitions.
 */

// Domain types
export type {
  ToolCall,
  AssistantMessage,
  UserMessage,
  Compaction,
  SubagentInvocation,
  ModelMetrics,
  TokenBucket,
  ShutdownMetrics,
  UtilisationSample,
  FanoutTurn,
  Annotation,
  Variant,
  BenchRun,
  ParseStatus,
  ModelChange,
  Turn,
  Session,
} from './types/index';

// Zod schemas
export {
  toolCallSchema,
  assistantMessageSchema,
  userMessageSchema,
  compactionSchema,
  subagentInvocationSchema,
  modelMetricsSchema,
  tokenBucketSchema,
  shutdownMetricsSchema,
  utilisationSampleSchema,
  fanoutTurnSchema,
  annotationSchema,
  variantSchema,
  benchRunSchema,
  parseStatusSchema,
  modelChangeSchema,
  turnSchema,
  sessionSchema,
} from './schemas/index';

// Aggregation
export { aggregateBenchRun } from './aggregation';
export type {
  AggregationEntry,
  AggregationOptions,
  BenchRunAggregation,
  CostCalculator,
  ModelUsageRollup,
  SessionSummaryRow,
  ToolUsageSummary,
} from './aggregation';

// IPC (existing)
export {
  sessionSummarySchema,
  sessionDataSchema,
  adapterTypeSchema,
  sessionListItemSchema,
  sessionListMetricsSchema,
  costConfidenceSchema,
  appInsightsSettingsSchema,
  testConnectionResultSchema,
  ipcChannels,
} from './ipc-schemas';
export type {
  SessionSummary,
  SessionData,
  AdapterTypeIpc,
  SessionListItemIpc,
  SessionListMetrics,
  CostConfidence,
  AppInsightsSettingsIpc,
  TestConnectionResultIpc,
} from './ipc-schemas';
