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

// IPC (existing)
export { sessionSummarySchema, sessionDataSchema, ipcChannels } from './ipc-schemas';
export type { SessionSummary, SessionData } from './ipc-schemas';
