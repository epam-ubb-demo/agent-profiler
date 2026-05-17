/**
 * @agent-profiler/enrichment-core — public API barrel.
 *
 * Exports all types, interfaces, Zod schemas, utilities, registries,
 * and shared error types for the multi-source sync architecture.
 */

// ToolId
export type { ToolId } from './tool-id.js';

// EnrichmentEvent, EnrichmentCursor, SessionRef — types + Zod schemas
export {
  toolIdSchema,
  enrichmentEventSchema,
  enrichmentCursorSchema,
  sessionRefSchema,
} from './enrichment-event.js';
export type { EnrichmentEvent, EnrichmentCursor, SessionRef } from './enrichment-event.js';

// Deterministic event ID builder
export { buildEventId } from './event-id.js';

// Source interfaces
export type { SessionWatcher, SessionEnrichmentSource } from './source.js';

// Sink types
export { RetriableSinkError } from './sink.js';
export type { RejectInfo, PushResult, EnrichmentSink } from './sink.js';

// Marker — Zod schema + type + store interface
export { markerSchema } from './marker.js';
export type { Marker, MarkerStore } from './marker.js';

// Planner
export type { PlannedCategory, SyncPlan, SyncPlanner } from './planner.js';

// Projector
export type { SessionProjector } from './projector.js';

// Registries
export { SourceRegistry, SinkRegistry, ProjectorRegistry } from './registries/index.js';

// Shared errors
export { DuplicateRegistrationError, NotFoundError } from './errors.js';

// Multi-tenant configuration
export type { TenantConfig } from './tenant-config.js';

// KQL helpers for tenant/user partitioned queries
export {
  AGENT_SESSION_EVENTS_TABLE,
  escapeKqlString,
  buildTeamViewFilter,
  buildUserViewFilter,
  buildScopedSessionListKql,
} from './kql-helpers.js';
