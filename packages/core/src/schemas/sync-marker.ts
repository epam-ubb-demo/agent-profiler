import { z } from 'zod';

/**
 * Schema for the sync marker sidecar file written alongside each session log.
 * Tracks what has been pushed to DCE so subsequent syncs can resume from the
 * correct event id.
 */
export const syncMarkerSchema = z.object({
  version: z.literal(1),
  lastSyncedAt: z.string(),
  /** Number of enrichment rows synced */
  lastSyncedRowCount: z.number().int().nonnegative(),
  lastSyncedEventId: z.string(),
  lastEventTimestamp: z.string(),
  categoriesPushed: z.array(
    z.enum(['metadata', 'utilisation', 'compactions', 'toolResults', 'turns', 'assistantMessages']),
  ),
  schemaVersion: z.number().int().positive(),
});

export type SyncMarker = z.infer<typeof syncMarkerSchema>;
