import type { AdapterTypeIpc, AppInsightsSettingsIpc, ListWorkspacesResultIpc, SyncSettingsIpc, SyncStatusIpc, TestConnectionResultIpc } from '@agent-profiler/core';

/**
 * Typed API exposed to the renderer process via contextBridge.
 *
 * This interface defines the contract between the preload script
 * and the renderer. Zod schemas in @agent-profiler/core validate
 * the data flowing across this boundary at runtime.
 */
export interface ElectronApi {
  /** Returns the application version from package.json */
  getVersion: () => Promise<string>;

  session: {
    /** Lists all available session summaries */
    list: () => Promise<SessionListItemIpc[]>;
    /** Opens a session by ID, returning full session data or null */
    open: (sessionId: string) => Promise<unknown | null>;
    /** Sets the root directory for session scanning */
    setRootDir: (dir: string) => Promise<boolean>;
    /** Register a callback for push-based session list updates from main process */
    onListUpdated: (callback: (sessions: SessionListItemIpc[]) => void) => () => void;
    /** Query the current scanning state of the session indexer */
    getScanningState: () => Promise<boolean>;
    /** Register a callback for push-based scanning state changes from main process */
    onScanningStateChanged: (callback: (scanning: boolean) => void) => () => void;
  };

  dialog: {
    /** Opens a native directory picker. Returns the selected path, or null if cancelled. */
    openDirectory: () => Promise<string | null>;
  };

  pdf: {
    /** Opens a native "Save As" dialog for PDF export. Returns path or null. */
    selectOutputPath: () => Promise<string | null>;
    /** Exports the current view as a PDF. */
    exportCurrentView: (options: PdfExportOptionsIpc) => Promise<PdfExportResult>;
    /** Exports a session as a formatted PDF. */
    exportSession: (session: unknown, options: PdfExportOptionsIpc) => Promise<PdfExportResult>;
  };

  settings: {
    /** Retrieve persisted Application Insights settings. */
    get: () => Promise<AppInsightsSettingsIpc>;
    /** Save Application Insights settings and reconfigure the data source. */
    set: (settings: AppInsightsSettingsIpc) => Promise<void>;
    testConnection: () => Promise<TestConnectionResultIpc>;
    /** Discover available Log Analytics workspaces via Azure CLI. */
    listWorkspaces: () => Promise<ListWorkspacesResultIpc>;
  };

  sync: {
    /** Retrieve persisted sync settings. */
    getSettings: () => Promise<SyncSettingsIpc>;
    /** Save sync settings. */
    setSettings: (settings: SyncSettingsIpc) => Promise<void>;
    /** Get a snapshot of the current sync status. */
    getStatus: () => Promise<SyncStatusIpc>;
    /** Trigger a sync run (syncs all pending local sessions). */
    trigger: () => Promise<void>;
    /** Register a callback for push-based sync status updates from main process. */
    onStatusUpdated: (callback: (status: SyncStatusIpc) => void) => () => void;
  };
}

export interface PdfExportOptionsIpc {
  outputPath: string;
  landscape?: boolean;
  pageSize?: 'A4' | 'Letter' | 'A3';
  printBackground?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
  title?: string;
}

export interface PdfExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export interface SessionListMetricsIpc {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCostUsd: number | null;
  costConfidence: 'known' | 'estimated' | 'unknown';
  wallTimeMs: number | null;
  repository: string;
  modelUsage: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }>;
}

export interface SessionListItemIpc {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  adapter: AdapterTypeIpc;
  metrics: SessionListMetricsIpc | null;
}
