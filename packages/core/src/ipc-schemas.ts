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

/** Supported adapter types for session detection. */
export const adapterTypeSchema = z.enum([
  'copilot-cli',
  'vscode-chat',
  'vscode-agent',
  'ctb',
  'application-insights',
]);

export type AdapterTypeIpc = z.infer<typeof adapterTypeSchema>;

/**
 * Schema for session list items flowing across IPC.
 * Dates are serialized as ISO strings for IPC transport.
 */
export const sessionListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string().datetime(),
  adapter: adapterTypeSchema,
});

export type SessionListItemIpc = z.infer<typeof sessionListItemSchema>;

/**
 * IPC channel names — single source of truth for channel strings.
 */
export const ipcChannels = {
  APP_GET_VERSION: 'app:getVersion',
  SESSION_LIST: 'session:list',
  SESSION_OPEN: 'session:open',
  SESSION_SET_ROOT_DIR: 'session:setRootDir',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_TEST_CONNECTION: 'settings:testConnection',
} as const;

/**
 * Schema for Application Insights connection settings flowing across IPC.
 */
export const appInsightsSettingsSchema = z.object({
  workspaceId: z.string(),
  timeRangePreset: z.enum(['24h', '7d', '30d', 'custom']),
  customStartDate: z.string().datetime().optional(),
  customEndDate: z.string().datetime().optional(),
});

export type AppInsightsSettingsIpc = z.infer<typeof appInsightsSettingsSchema>;

/**
 * Schema for the result of testing an Application Insights connection.
 */
export const testConnectionResultSchema = z.object({
  success: z.boolean(),
  sessionCount: z.number().optional(),
  error: z.string().optional(),
});

export type TestConnectionResultIpc = z.infer<typeof testConnectionResultSchema>;
