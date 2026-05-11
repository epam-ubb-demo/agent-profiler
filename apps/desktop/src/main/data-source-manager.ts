/**
 * Unified data-source manager that aggregates sessions from
 * multiple providers (local filesystem + Application Insights).
 *
 * All public methods follow the "never throw" contract —
 * errors are caught and safe defaults are returned.
 */

import type { TimeRange } from '@agent-profiler/adapters-application-insights';
import { ApplicationInsightsDataSource } from '@agent-profiler/adapters-application-insights';
import type { Session } from '@agent-profiler/core';
import type { SessionListItem } from '@agent-profiler/data-source';
import { LocalFsDataSource } from '@agent-profiler/data-source';
import { DefaultAzureCredential } from '@azure/identity';

export class DataSourceManager {
  private localSource: LocalFsDataSource;
  private appInsightsSource: ApplicationInsightsDataSource | null = null;

  constructor(rootDir: string) {
    this.localSource = new LocalFsDataSource(rootDir);
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Configure (or reconfigure) the Application Insights data source.
   * Pass an empty `workspaceId` to disable it.
   */
  configureAppInsights(config: {
    workspaceId: string;
    timeRange?: TimeRange | undefined;
  }): void {
    if (!config.workspaceId) {
      this.appInsightsSource = null;
      return;
    }

    this.appInsightsSource = new ApplicationInsightsDataSource({
      workspaceId: config.workspaceId,
      credential: new DefaultAzureCredential(),
      ...(config.timeRange ? { timeRange: config.timeRange } : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Session access
  // ---------------------------------------------------------------------------

  /**
   * Merge sessions from all available sources.
   *
   * Results are deduplicated by ID — if the same session appears in
   * multiple sources the first occurrence wins.
   */
  async listSessions(): Promise<SessionListItem[]> {
    const promises: Promise<SessionListItem[]>[] = [this.localSource.listSessions()];
    if (this.appInsightsSource) {
      promises.push(this.appInsightsSource.listSessions());
    }

    const results = await Promise.allSettled(promises);
    const seen = new Set<string>();
    const merged: SessionListItem[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
    }

    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return merged;
  }

  /**
   * Try each source to find the session by ID.
   * Local source is tried first, then Application Insights.
   */
  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const local = await this.localSource.getSession(sessionId);
      if (local) return local;
    } catch {
      // Fall through to next source.
    }

    if (this.appInsightsSource) {
      try {
        return await this.appInsightsSource.getSession(sessionId);
      } catch {
        // Swallow — contract is never-throw.
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Local source management
  // ---------------------------------------------------------------------------

  /** Update the local filesystem root directory. Returns `true` if valid. */
  async setLocalRootDir(dir: string): Promise<boolean> {
    const candidate = new LocalFsDataSource(dir);
    const available = await candidate.isAvailable();
    if (available) {
      this.localSource = candidate;
      return true;
    }
    return false;
  }

  /** Check whether the local source directory is accessible. */
  async isLocalAvailable(): Promise<boolean> {
    return this.localSource.isAvailable();
  }

  // ---------------------------------------------------------------------------
  // Connectivity test
  // ---------------------------------------------------------------------------

  /**
   * Test Application Insights connectivity.
   *
   * Uses the currently configured data source to call `isAvailable()`
   * and — on success — `listSessions()` to obtain a session count.
   */
  async testConnection(): Promise<{
    success: boolean;
    sessionCount?: number | undefined;
    error?: string | undefined;
  }> {
    if (!this.appInsightsSource) {
      return { success: false, error: 'Application Insights is not configured' };
    }

    try {
      const available = await this.appInsightsSource.isAvailable();
      if (!available) {
        return { success: false, error: 'Workspace is unreachable or credentials are invalid' };
      }

      const sessions = await this.appInsightsSource.listSessions();
      return { success: true, sessionCount: sessions.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
