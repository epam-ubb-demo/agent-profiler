/**
 * SyncService — main-process orchestrator for pushing local session data to the OTel collector.
 *
 * Coordinates MarkerStore, EnrichmentBuilder, and OtlpLogsWriter to
 * incrementally sync unsynchronised local sessions to the configured OTLP endpoint.
 *
 * Design constraints:
 * - A mutex flag prevents concurrent sync runs.
 * - Per-session errors are caught and logged; the batch continues.
 * - Status is broadcast to all open renderer windows via SYNC_STATUS_UPDATED.
 * - Sessions that already have a sync marker are skipped (already synced).
 */




import { buildEnrichmentRows } from '@agent-profiler/adapters-application-insights';
import type { OtlpLogsWriter } from '@agent-profiler/adapters-application-insights';
import { ipcChannels } from '@agent-profiler/core';
import type { SyncMarker, SyncSettingsIpc, SyncStatusIpc } from '@agent-profiler/core';
import { BrowserWindow } from 'electron';

import type { DataSourceManager } from './data-source-manager';
import type { SessionIndexer } from './session-indexer';
import type { MarkerStore } from './sync-marker';

// ---------------------------------------------------------------------------
// Dependency interfaces
// ---------------------------------------------------------------------------

/** Minimal settings-store surface needed by SyncService. */
export interface SyncSettingsStore {
  getSyncSettings(): SyncSettingsIpc;
}

/** Constructor dependencies for SyncService. */
export interface SyncServiceDeps {
  markerStore: MarkerStore;
  /** Null when sync is not yet configured (empty OTLP endpoint field). */
  writer: OtlpLogsWriter | null;
  dataSourceManager: DataSourceManager;
  sessionIndexer: SessionIndexer;
  settingsStore: SyncSettingsStore;
  /**
   * Reserved for future targeted sends; status is currently broadcast to
   * all open windows via BrowserWindow.getAllWindows().
   */
  mainWindow: BrowserWindow | null;
}

// ---------------------------------------------------------------------------
// SyncService
// ---------------------------------------------------------------------------

export class SyncService {
  /** Mutex: prevents concurrent sync runs. */
  private syncing = false;

  /** Current status snapshot; kept up-to-date by broadcastStatus(). */
  private status: SyncStatusIpc = {
    state: 'idle',
    lastSyncedAt: null,
    sessionsPending: 0,
    sessionsTotal: 0,
    lastError: null,
  };

  constructor(private readonly deps: SyncServiceDeps) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Returns a snapshot of the current sync status (cheap copy). */
  getStatus(): SyncStatusIpc {
    return { ...this.status };
  }

  /**
   * Remove all sync markers so sessions are re-synced on next syncAll().
   * Used as a one-time recovery after data-loss incidents.
   */
  async clearAllMarkers(): Promise<number> {
    const localSessions = this.deps.sessionIndexer
      .getSessionList()
      .filter((s) => s.adapter === 'copilot-cli');

    let cleared = 0;
    for (const sessionItem of localSessions) {
      const sessionDir = sessionItem.path;
      if (!sessionDir) continue;
      try {
        await this.deps.markerStore.delete(sessionDir);
        cleared++;
      } catch {
        // Marker didn't exist or couldn't be deleted — that's fine
      }
    }
    console.log(`[SyncService] Cleared ${cleared} sync markers`);
    return cleared;
  }

  /**
   * Replace the OtlpLogsWriter used for future sync operations.
   * Accepts null when the new settings have an empty OTLP endpoint field.
   * Call this whenever the OTel Gateway URL changes so the next sync uses
   * the updated endpoint.
   */
  updateWriter(newWriter: OtlpLogsWriter | null): void {
    this.deps.writer = newWriter;
  }

  /**
   * Sync all local sessions that have not yet been pushed.
   *
   * Sessions that already have a sync marker are skipped.
   * Per-session errors are caught; the batch continues on failure.
   */
  async syncAll(): Promise<void> {
    if (this.syncing) {
      console.log('[SyncService] syncAll() skipped — sync already in progress');
      this.broadcastStatus(this.status);
      return;
    }
    this.syncing = true;

    try {
      const settings = this.deps.settingsStore.getSyncSettings();
      if (!settings.enabled) {
        console.log('[SyncService] syncAll() skipped — sync is disabled');
        this.broadcastStatus({
          ...this.status,
          lastError: 'Sync is disabled — enable it in settings',
        });
        return;
      }

      // Only copilot-cli sessions are eligible for sync: they are the only adapter
      // backed by a writable on-disk session directory where MarkerStore can write.
      // Other local adapters (vscode-chat, vscode-agent, ctb) may not have
      // writable directories, and application-insights sessions are remote-only.
      const localSessions = this.deps.sessionIndexer
        .getSessionList()
        .filter((s) => s.adapter === 'copilot-cli');

      const total = localSessions.length;
      let pending = total;
      let lastError: string | null = null;

      this.broadcastStatus({
        state: 'scanning',
        lastSyncedAt: this.status.lastSyncedAt,
        sessionsPending: pending,
        sessionsTotal: total,
        lastError: null,
      });

      for (const sessionItem of localSessions) {
        this.broadcastStatus({
          state: 'pushing',
          lastSyncedAt: this.status.lastSyncedAt,
          sessionsPending: pending,
          sessionsTotal: total,
          lastError: null,
        });

        try {
          await this.syncSessionInternal(sessionItem.id, sessionItem.path, settings);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[SyncService] Error syncing session "${sessionItem.id}":`, err);
          lastError = msg;
        }

        pending--;
      }

      this.broadcastStatus({
        state: lastError !== null ? 'error' : 'idle',
        lastSyncedAt: new Date().toISOString(),
        sessionsPending: 0,
        sessionsTotal: total,
        lastError,
      });
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync a single local session by ID.
   *
   * No-op if sync is disabled or the session cannot be found in the local index.
   */
  async syncSession(sessionId: string): Promise<void> {
    if (this.syncing) {
      console.log(`[SyncService] syncSession("${sessionId}") skipped — sync already in progress`);
      this.broadcastStatus(this.status);
      return;
    }
    this.syncing = true;

    try {
      const settings = this.deps.settingsStore.getSyncSettings();
      if (!settings.enabled) {
        console.log(`[SyncService] syncSession("${sessionId}") skipped — sync is disabled`);
        return;
      }

      // Only copilot-cli sessions have a writable on-disk directory for the marker.
      const sessionItem = this.deps.sessionIndexer
        .getSessionList()
        .find((s) => s.id === sessionId && s.adapter === 'copilot-cli');

      if (!sessionItem) {
        console.warn(`[SyncService] Session "${sessionId}" not found or not a local session`);
        return;
      }

      this.broadcastStatus({
        state: 'pushing',
        lastSyncedAt: this.status.lastSyncedAt,
        sessionsPending: 1,
        sessionsTotal: 1,
        lastError: null,
      });

      let lastError: string | null = null;
      try {
        await this.syncSessionInternal(sessionId, sessionItem.path, settings);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`[SyncService] Error syncing session "${sessionId}":`, err);
      }

      this.broadcastStatus({
        state: lastError !== null ? 'error' : 'idle',
        lastSyncedAt: new Date().toISOString(),
        sessionsPending: 0,
        sessionsTotal: 1,
        lastError,
      });
    } finally {
      this.syncing = false;
    }
  }

  // ── Private implementation ─────────────────────────────────────────────────

  /**
   * Core sync logic for a single session.
   *
   * - Skips sessions that already have a valid sync marker.
   * - Throws on unrecoverable errors so the caller can decide whether to abort
   *   the batch or continue.
   */
  private async syncSessionInternal(
    sessionId: string,
    sessionDir: string,
    settings: SyncSettingsIpc,
  ): Promise<void> {
    // Clean up any .tmp file left over from a previously crashed write.
    await this.deps.markerStore.cleanupTemp(sessionDir);

    // null → session has not been synced yet; non-null → already synced, skip.
    const existingMarker = await this.deps.markerStore.read(sessionDir);
    if (existingMarker !== null) {
      console.log(`[SyncService] Session "${sessionId}" already synced — skipping`);
      return;
    }

    // Load the full session object from the local filesystem.
    const session = await this.deps.dataSourceManager.getSession(sessionId);
    if (!session) {
      console.warn(`[SyncService] Could not load session "${sessionId}" — skipping`);
      return;
    }

    // Build enrichment rows, honouring the active category toggles.
    const rows = buildEnrichmentRows(session, { categories: settings.categories });
    if (rows.length === 0) {
      console.log(`[SyncService] No enrichment rows for session "${sessionId}" — skipping`);
      return;
    }

    // Push rows to the OTel collector via OTLP/HTTP.
    if (!this.deps.writer) {
      console.warn(
        `[SyncService] Sync skipped for session "${sessionId}" — remote endpoint not configured`,
      );
      return;
    }
    await this.deps.writer.push(rows);

    // Record which categories were actually included in this push.
    const categoriesPushed: SyncMarker['categoriesPushed'] = [];
    if (settings.categories.metadata) categoriesPushed.push('metadata');
    if (settings.categories.utilisation) categoriesPushed.push('utilisation');
    if (settings.categories.compactions) categoriesPushed.push('compactions');
    if (settings.categories.toolResults) categoriesPushed.push('toolResults');

    // rows.length > 0 is guaranteed by the check above.
    const lastRow = rows[rows.length - 1]!;

    const marker: SyncMarker = {
      version: 1,
      lastSyncedAt: new Date().toISOString(),
      // Row count used to track incremental sync progress.
      // Byte-level tracking (for incremental re-sync) is a future enhancement.
      lastSyncedRowCount: rows.length,
      lastSyncedEventId: lastRow.EventId,
      lastEventTimestamp: lastRow.TimeGenerated,
      categoriesPushed,
      schemaVersion: 1,
    };

    await this.deps.markerStore.write(sessionDir, marker);
    console.log(
      `[SyncService] Session "${sessionId}" synced successfully (${rows.length} rows pushed)`,
    );
  }

  /**
   * Persist the new status locally and push it to every open renderer window.
   */
  private broadcastStatus(status: SyncStatusIpc): void {
    this.status = status;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(ipcChannels.SYNC_STATUS_UPDATED, status);
      }
    }
  }
}
