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

/** Confidence level for a cost estimate. */
export const costConfidenceSchema = z.enum(['known', 'estimated', 'unknown']);
export type CostConfidence = z.infer<typeof costConfidenceSchema>;

/** Lightweight metrics attached to each session list item for the browser cards. */
export const sessionListMetricsSchema = z.object({
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCacheReadTokens: z.number(),
  totalCacheWriteTokens: z.number(),
  totalCostUsd: z.number().nullable(),
  costConfidence: costConfidenceSchema,
  wallTimeMs: z.number().nullable(),
  repository: z.string(),
});
export type SessionListMetrics = z.infer<typeof sessionListMetricsSchema>;

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
  metrics: sessionListMetricsSchema.nullable(),
});

export type SessionListItemIpc = z.infer<typeof sessionListItemSchema>;

/**
 * IPC channel names — single source of truth for channel strings.
 */
export const ipcChannels = {
  APP_GET_VERSION: 'app:getVersion',
  SESSION_LIST: 'session:list',
  SESSION_LIST_UPDATED: 'session:listUpdated',
  SESSION_SCANNING_STATE: 'session:scanningState',
  SESSION_SCANNING_STATE_UPDATED: 'session:scanningStateUpdated',
  SESSION_OPEN: 'session:open',
  SESSION_SET_ROOT_DIR: 'session:setRootDir',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_TEST_CONNECTION: 'settings:testConnection',
  SETTINGS_LIST_WORKSPACES: 'settings:listWorkspaces',
} as const;

/**
 * Schema for Application Insights connection settings flowing across IPC.
 */
export const appInsightsSettingsSchema = z.object({
  workspaceId: z.string().trim(),
  timeRangePreset: z.enum(['24h', '7d', '30d', 'custom']),
  customStartDate: z.string().date().optional(),
  customEndDate: z.string().date().optional(),
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

/**
 * Schema for a discovered Azure Log Analytics workspace.
 */
export const logAnalyticsWorkspaceSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  resourceGroup: z.string(),
  location: z.string(),
  subscriptionName: z.string(),
});

export type LogAnalyticsWorkspaceIpc = z.infer<typeof logAnalyticsWorkspaceSchema>;

/**
 * Discriminated result schema for listing Log Analytics workspaces.
 */
export const listWorkspacesResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    workspaces: z.array(logAnalyticsWorkspaceSchema),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type ListWorkspacesResultIpc = z.infer<typeof listWorkspacesResultSchema>;
