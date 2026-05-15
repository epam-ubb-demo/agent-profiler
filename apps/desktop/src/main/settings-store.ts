/**
 * Persistent settings backed by electron-store.
 *
 * Provides typed accessors for Application Insights configuration
 * and the local session root directory.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AppInsightsSettingsIpc, SyncSettingsIpc } from '@agent-profiler/core';
import { syncSettingsSchema } from '@agent-profiler/core';
import Store from 'electron-store';


/** Default directory for Copilot CLI session state. */
export const DEFAULT_ROOT_DIR = join(homedir(), '.copilot', 'session-state');

/** Schema consumed by electron-store for type-safe defaults. */
interface SettingsSchema {
  appInsights: {
    workspaceId: string;
    timeRangePreset: '24h' | '7d' | '30d' | 'custom';
    customStartDate: string | undefined;
    customEndDate: string | undefined;
  };
  sessionRootDir: string;
  sync: SyncSettingsIpc;
}

const store = new Store<SettingsSchema>({
  name: 'agent-profiler-settings',
  defaults: {
    appInsights: {
      workspaceId: '',
      timeRangePreset: '7d',
      customStartDate: undefined,
      customEndDate: undefined,
    },
    sessionRootDir: DEFAULT_ROOT_DIR,
    sync: {
      enabled: false,
      categories: { metadata: true, utilisation: true, compactions: true, toolResults: false },
      otlpEndpoint: '',
    },
  },
});

/** Retrieve the current Application Insights settings. */
export function getAppInsightsSettings(): AppInsightsSettingsIpc {
  const raw = store.get('appInsights');
  return {
    workspaceId: raw.workspaceId,
    timeRangePreset: raw.timeRangePreset,
    ...(raw.customStartDate ? { customStartDate: raw.customStartDate } : {}),
    ...(raw.customEndDate ? { customEndDate: raw.customEndDate } : {}),
  };
}

/** Persist Application Insights settings. */
export function setAppInsightsSettings(settings: AppInsightsSettingsIpc): void {
  store.set('appInsights', {
    workspaceId: settings.workspaceId,
    timeRangePreset: settings.timeRangePreset,
    customStartDate: settings.customStartDate,
    customEndDate: settings.customEndDate,
  });
}

/** Retrieve the local session root directory. */
export function getSessionRootDir(): string {
  return store.get('sessionRootDir');
}

/** Persist the local session root directory. */
export function setSessionRootDir(dir: string): void {
  store.set('sessionRootDir', dir);
}

/** Retrieve the current sync settings. */
export function getSyncSettings(): SyncSettingsIpc {
  try {
    return syncSettingsSchema.parse(store.get('sync'));
  } catch {
    // Corrupted or migrated store — return schema defaults
    return syncSettingsSchema.parse({});
  }
}

/** Persist sync settings. */
export function setSyncSettings(settings: SyncSettingsIpc): void {
  store.set('sync', settings);
}
