import { z } from 'zod';

/**
 * Zod schemas for IPC data validation.
 *
 * These schemas define the data contract between the Electron main process
 * and the renderer. Both sides can use them for runtime validation.
 */

export const sessionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  events: z.array(z.unknown()),
});

export type SessionData = z.infer<typeof sessionDataSchema>;

/**
 * IPC channel names — single source of truth for channel strings.
 */
export const ipcChannels = {
  APP_GET_VERSION: 'app:getVersion',
  SESSION_LIST: 'session:list',
  SESSION_OPEN: 'session:open',
} as const;
