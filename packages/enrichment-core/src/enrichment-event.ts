import { z } from 'zod';

/** Zod enum for supported agent tools — mirrors {@link ToolId}. */
export const toolIdSchema = z.enum(['copilot-cli', 'vscode-chat', 'claude-code']);

/**
 * Envelope that wraps a single enrichment payload (ADR-0009).
 */
export const enrichmentEventSchema = z.object({
  /** Schema version of the envelope itself. Currently 1. */
  schemaVersion: z.literal(1),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  tool: toolIdSchema,
  toolVersion: z.string(),
  sourceMachine: z.string(),
  sessionId: z.string(),
  /** Free-form category string (e.g. "metadata", "turns"). Not a union per ADR-0009. */
  category: z.string(),
  /** Non-negative integer. Strictly increasing per (sessionId, category). */
  ordinal: z.number().int().nonnegative(),
  /** Deterministic ID — see {@link buildEventId}. */
  eventId: z.string(),
  /** ISO 8601 timestamp. */
  eventTs: z.string().datetime(),
  /** Payload schema identifier, e.g. `copilot-cli/metadata/v2`. */
  payloadSchema: z.string(),
  /** Arbitrary JSON object payload. */
  payload: z.record(z.string(), z.unknown()),
});

export type EnrichmentEvent = z.infer<typeof enrichmentEventSchema>;

/**
 * Per-category cursor that records the last ingested event for a
 * (tool, sessionId, category) triple.
 */
export const enrichmentCursorSchema = z.object({
  tool: toolIdSchema,
  sessionId: z.string(),
  category: z.string(),
  lastOrdinal: z.number().int().nonnegative(),
  lastEventId: z.string(),
  /** ISO 8601 */
  lastEventTs: z.string().datetime(),
  /** ISO 8601 */
  lastIngestedAt: z.string().datetime(),
});

export type EnrichmentCursor = z.infer<typeof enrichmentCursorSchema>;

/**
 * Lightweight reference to a session, used by sources and watchers.
 */
export const sessionRefSchema = z.object({
  tool: toolIdSchema,
  sessionId: z.string(),
  /** Hint for the source adapter (e.g. a file path). */
  locationHint: z.string(),
});

export type SessionRef = z.infer<typeof sessionRefSchema>;
