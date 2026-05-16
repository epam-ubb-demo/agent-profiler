import type {
  MarkerStore,
  SessionEnrichmentSource,
  SessionRef,
  SinkRegistry,
  SourceRegistry,
  SyncPlan,
  SyncPlanner,
} from '@agent-profiler/enrichment-core';

import { LiveWatcher } from './live-watcher.js';
import type { LiveWatcherOptions } from './live-watcher.js';
import { PollGuard } from './poll-guard.js';
import type { PollGuardOptions } from './poll-guard.js';
import { KeyedMutex } from './sync-mutex.js';
import type { DefaultSyncOrchestrator, JobUpdate } from './sync-orchestrator.js';

export interface SyncSchedulerDeps {
  readonly sourceRegistry: SourceRegistry;
  readonly sinkRegistry: SinkRegistry;
  readonly markerStore: MarkerStore;
  readonly orchestrator: DefaultSyncOrchestrator;
  readonly plannerFactory: (source: SessionEnrichmentSource) => SyncPlanner;
  readonly onJobUpdate?: ((update: JobUpdate) => void) | undefined;
}

export interface SyncSchedulerOptions {
  readonly pollIntervalMs?: number | undefined;
  readonly debounceMs?: number | undefined;
}

/**
 * Coordinates LiveWatcher + PollGuard + SyncPlanner + SyncOrchestrator + KeyedMutex.
 *
 * - On filesystem change: determine session, create incremental plan, acquire mutex, run.
 * - On poll tick: iterate all sources/sessions, create incremental plans, run.
 * - requestFullReupload / requestSelective: create plan, acquire mutex, run.
 */
export class DefaultSyncScheduler {
  private readonly mutex = new KeyedMutex();
  private liveWatcher: LiveWatcher | undefined;
  private pollGuard: PollGuard | undefined;

  constructor(
    private readonly deps: SyncSchedulerDeps,
    private readonly options?: SyncSchedulerOptions,
  ) {}

  /** Start watching and polling. */
  start(rootDir: string): void {
    const watcherOptions: LiveWatcherOptions = {
      ...(this.options?.debounceMs !== undefined
        ? { debounceMs: this.options.debounceMs }
        : {}),
    };
    this.liveWatcher = new LiveWatcher(
      rootDir,
      (sessionPath) => {
        void this.handleChange(sessionPath);
      },
      watcherOptions,
    );
    this.liveWatcher.start();

    const guardOptions: PollGuardOptions = {
      ...(this.options?.pollIntervalMs !== undefined
        ? { intervalMs: this.options.pollIntervalMs }
        : {}),
    };
    this.pollGuard = new PollGuard(() => this.handlePollTick(), guardOptions);
    this.pollGuard.start();
  }

  /** Stop all watchers and timers. */
  stop(): void {
    this.liveWatcher?.stop();
    this.pollGuard?.stop();
    this.liveWatcher = undefined;
    this.pollGuard = undefined;
  }

  /** Request a full re-upload for a specific session. */
  async requestFullReupload(ref: SessionRef): Promise<void> {
    const source = this.deps.sourceRegistry.forTool(ref.tool);
    const planner = this.deps.plannerFactory(source);
    const plan = await planner.planFull(ref);
    await this.runWithMutex(ref, plan, source);
  }

  /** Request a selective re-upload for specific categories. */
  async requestSelective(ref: SessionRef, categories: readonly string[]): Promise<void> {
    const source = this.deps.sourceRegistry.forTool(ref.tool);
    const planner = this.deps.plannerFactory(source);
    const plan = await planner.planSelective(ref, categories);
    await this.runWithMutex(ref, plan, source);
  }

  private async handleChange(sessionPath: string): Promise<void> {
    // Linear scan across sources/sessions to find the matching path.
    // Acceptable because the total number of registered sources and their
    // discovered sessions is small (typically < 10 per tool).
    for (const source of this.deps.sourceRegistry.list()) {
      for await (const ref of source.discoverSessions()) {
        if (ref.locationHint === sessionPath) {
          const planner = this.deps.plannerFactory(source);
          const plan = await planner.planIncremental(ref);
          await this.runWithMutex(ref, plan, source);
          return;
        }
      }
    }
  }

  private async handlePollTick(): Promise<void> {
    for (const source of this.deps.sourceRegistry.list()) {
      for await (const ref of source.discoverSessions()) {
        try {
          const planner = this.deps.plannerFactory(source);
          const plan = await planner.planIncremental(ref);
          await this.runWithMutex(ref, plan, source);
        } catch (err) {
          console.warn('[SyncScheduler] session sync failed, skipping:', err);
        }
      }
    }
  }

  private async runWithMutex(
    ref: SessionRef,
    plan: SyncPlan,
    source: SessionEnrichmentSource,
  ): Promise<void> {
    const key = `${ref.tool}:${ref.sessionId}`;
    const release = await this.mutex.acquire(key);
    try {
      const sinks = this.deps.sinkRegistry.list();
      await this.deps.orchestrator.runPlan(plan, source, sinks, this.deps.onJobUpdate);
    } finally {
      release();
    }
  }
}
