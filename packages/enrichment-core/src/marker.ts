import { z } from 'zod';

import { toolIdSchema, enrichmentCursorSchema } from './enrichment-event.js';
import type { SessionRef } from './enrichment-event.js';

/**
 * Per-session marker persisted by the sync engine (ADR-0011).
 * Schema version is fixed at 2 — no migration from v1.
 */
export const markerSchema = z.object({
  /** Literal schema version — born at v2. */
  schemaVersion: z.literal(2),
  tool: toolIdSchema,
  sessionId: z.string(),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  /** category → last-ingested cursor */
  cursors: z.record(z.string(), enrichmentCursorSchema),
  /** category → payload schema version string (e.g. `"v2"`) */
  payloadSchemaVersions: z.record(z.string(), z.string()),
  /** ISO 8601 — set when a full re-upload was last performed. */
  lastFullReuploadAt: z.string().optional(),
});

export type Marker = z.infer<typeof markerSchema>;

export interface MarkerStore {
  /** Read the marker for a session, or undefined if none exists. */
  read(ref: SessionRef): Promise<Marker | undefined>;

  /** Persist (overwrite) the marker for a session. */
  write(ref: SessionRef, marker: Marker): Promise<void>;

  /**
   * Remove cursor entries for the given categories, forcing a re-sync
   * of those categories on next run.
   */
  resetCategories(ref: SessionRef, categories: readonly string[]): Promise<void>;

  /** Delete the entire marker for a session, forcing a full re-sync. */
  resetAll(ref: SessionRef): Promise<void>;
}
