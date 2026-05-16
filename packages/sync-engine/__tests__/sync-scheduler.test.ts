import type { SessionRef, SinkRegistry, SourceRegistry, SyncPlan } from '@agent-profiler/enrichment-core';
import {
  createFakeSink,
  createFakeSource,
  createTestSessionRef,
} from '@agent-profiler/enrichment-core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// Mock LiveWatcher and PollGuard modules before importing them
vi.mock('../src/live-watcher.js');
vi.mock('../src/poll-guard.js');

import { LiveWatcher } from '../src/live-watcher.js';
import { PollGuard } from '../src/poll-guard.js';
import type { JobUpdate } from '../src/sync-orchestrator.js';
import { DefaultSyncScheduler } from '../src/sync-scheduler.js';
import type { SyncSchedulerDeps } from '../src/sync-scheduler.js';

// ── fixture helpers ────────────────────────────────────────────────────────────

const REF: SessionRef = createTestSessionRef('copilot-cli', 'session-1', '/sessions/session-1');

const INCREMENTAL_PLAN: SyncPlan = {
  ref: REF,
  categories: [{ category: 'turns', fromOrdinal: 5, resetCursor: false }],
  mode: 'incremental',
};

const FULL_PLAN: SyncPlan = {
  ref: REF,
  categories: [{ category: 'turns', fromOrdinal: 0, resetCursor: true }],
  mode: 'full',
};

const SELECTIVE_PLAN: SyncPlan = {
  ref: REF,
  categories: [{ category: 'metadata', fromOrdinal: 0, resetCursor: true }],
  mode: 'selective',
};

const DONE_JOB_UPDATE: JobUpdate = {
  sessionId: REF.sessionId,
  tool: REF.tool,
  state: 'done',
  categoriesTotal: 1,
  categoriesDone: 1,
  eventsAccepted: 0,
  eventsRejected: 0,
};

function makeDeps(
  sessionRef: SessionRef = REF,
  plannerOverrides?: {
    planFull?: Mock;
    planSelective?: Mock;
    planIncremental?: Mock;
  },
): SyncSchedulerDeps & { mockRunPlan: Mock; mockPlannerFactory: Mock } {
  const fakeSource = {
    ...createFakeSource('copilot-cli', { sessions: [sessionRef] }),
  };

  const fakeSink = createFakeSink();

  const mockSourceRegistry = {
    list: vi.fn().mockReturnValue([fakeSource]),
    forTool: vi.fn().mockReturnValue(fakeSource),
  } as unknown as SourceRegistry;

  const mockSinkRegistry = {
    list: vi.fn().mockReturnValue([fakeSink]),
  } as unknown as SinkRegistry;

  const mockRunPlan = vi.fn().mockResolvedValue(DONE_JOB_UPDATE);

  const mockOrchestrator = { runPlan: mockRunPlan } as unknown as SyncSchedulerDeps['orchestrator'];

  const mockPlannerFull = plannerOverrides?.planFull ?? vi.fn().mockResolvedValue(FULL_PLAN);
  const mockPlannerSelective =
    plannerOverrides?.planSelective ?? vi.fn().mockResolvedValue(SELECTIVE_PLAN);
  const mockPlannerIncremental =
    plannerOverrides?.planIncremental ?? vi.fn().mockResolvedValue(INCREMENTAL_PLAN);

  const mockPlanner = {
    planFull: mockPlannerFull,
    planSelective: mockPlannerSelective,
    planIncremental: mockPlannerIncremental,
  };

  const mockPlannerFactory = vi.fn().mockReturnValue(mockPlanner);

  return {
    sourceRegistry: mockSourceRegistry,
    sinkRegistry: mockSinkRegistry,
    markerStore: { read: vi.fn(), write: vi.fn(), resetCategories: vi.fn(), resetAll: vi.fn() },
    orchestrator: mockOrchestrator,
    plannerFactory: mockPlannerFactory,
    mockRunPlan,
    mockPlannerFactory,
  };
}

// ── mocked constructor captures ───────────────────────────────────────────────

let capturedOnChange: ((sessionPath: string) => void) = () => {};
let capturedOnTick: (() => void | Promise<void>) = () => {};
let mockWatcherStart: Mock;
let mockWatcherStop: Mock;
let mockGuardStart: Mock;
let mockGuardStop: Mock;

beforeEach(() => {
  vi.clearAllMocks();

  mockWatcherStart = vi.fn();
  mockWatcherStop = vi.fn();
  mockGuardStart = vi.fn();
  mockGuardStop = vi.fn();

  vi.mocked(LiveWatcher).mockImplementation((_root: string, onChange: (p: string) => void) => {
    capturedOnChange = onChange;
    return { start: mockWatcherStart, stop: mockWatcherStop } as unknown as LiveWatcher;
  });

  vi.mocked(PollGuard).mockImplementation((onTick: () => void | Promise<void>) => {
    capturedOnTick = onTick;
    return { start: mockGuardStart, stop: mockGuardStop } as unknown as PollGuard;
  });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DefaultSyncScheduler', () => {
  describe('start / stop', () => {
    it('creates LiveWatcher and PollGuard with correct rootDir', () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      expect(vi.mocked(LiveWatcher)).toHaveBeenCalledOnce();
      expect(vi.mocked(LiveWatcher).mock.calls[0]?.[0]).toBe('/sessions');
      expect(vi.mocked(PollGuard)).toHaveBeenCalledOnce();
    });

    it('starts both watcher and guard', () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      expect(mockWatcherStart).toHaveBeenCalledOnce();
      expect(mockGuardStart).toHaveBeenCalledOnce();
    });

    it('stops both watcher and guard on stop()', () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');
      scheduler.stop();

      expect(mockWatcherStop).toHaveBeenCalledOnce();
      expect(mockGuardStop).toHaveBeenCalledOnce();
    });

    it('stop() before start() does not throw', () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps);
      expect(() => scheduler.stop()).not.toThrow();
    });

    it('passes debounceMs option to LiveWatcher', () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps, { debounceMs: 250 });
      scheduler.start('/sessions');

      const opts = vi.mocked(LiveWatcher).mock.calls[0]?.[2];
      expect(opts).toMatchObject({ debounceMs: 250 });
    });

    it('passes pollIntervalMs option to PollGuard', () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps, { pollIntervalMs: 5000 });
      scheduler.start('/sessions');

      const opts = vi.mocked(PollGuard).mock.calls[0]?.[1];
      expect(opts).toMatchObject({ intervalMs: 5000 });
    });
  });

  describe('onChange handler', () => {
    it('calls planIncremental and runPlan when session matches locationHint', async () => {
      const deps = makeDeps(REF);
      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      // onChange is fire-and-forget; wait until runPlan is actually called
      capturedOnChange(REF.locationHint);
      await vi.waitFor(() => {
        expect(deps.mockRunPlan).toHaveBeenCalledOnce();
      });

      expect(deps.mockPlannerFactory).toHaveBeenCalledOnce();
      const [plan] = deps.mockRunPlan.mock.calls[0] as [SyncPlan];
      expect(plan.mode).toBe('incremental');
    });

    it('does nothing when no session matches the sessionPath', async () => {
      const deps = makeDeps(REF);
      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      capturedOnChange('/sessions/totally-different-session');
      // Flush macrotask queue — if runPlan were going to be called it would have been by now
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(deps.mockRunPlan).not.toHaveBeenCalled();
    });

    it('uses the mutex — second onChange for same session runs after first completes', async () => {
      const order: string[] = [];
      let firstResolve: (() => void) | undefined;

      const deps = makeDeps(REF);
      deps.mockRunPlan
        .mockImplementationOnce(
          () =>
            new Promise<JobUpdate>((resolve) => {
              firstResolve = () => {
                order.push('first done');
                resolve(DONE_JOB_UPDATE);
              };
            }),
        )
        .mockImplementationOnce(async () => {
          order.push('second done');
          return DONE_JOB_UPDATE;
        });

      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      capturedOnChange(REF.locationHint);
      capturedOnChange(REF.locationHint);

      // Wait until first runPlan has been invoked (firstResolve is set)
      await vi.waitFor(() => {
        expect(firstResolve).toBeDefined();
      });

      order.push('between');
      firstResolve!();

      // Wait for both handlers to finish
      await vi.waitFor(() => {
        expect(order).toHaveLength(3);
      });

      expect(order).toEqual(['between', 'first done', 'second done']);
    });
  });

  describe('onTick handler', () => {
    it('calls planIncremental and runPlan for each discovered session', async () => {
      const ref2: SessionRef = createTestSessionRef('copilot-cli', 'session-2', '/sessions/session-2');
      const fakeSource = {
        ...createFakeSource('copilot-cli', { sessions: [REF, ref2] }),
      };
      const fakeSink = createFakeSink();
      const mockRunPlan = vi.fn().mockResolvedValue(DONE_JOB_UPDATE);
      const mockPlannerFactory = vi.fn().mockReturnValue({
        planFull: vi.fn().mockResolvedValue(FULL_PLAN),
        planSelective: vi.fn().mockResolvedValue(SELECTIVE_PLAN),
        planIncremental: vi.fn().mockResolvedValue(INCREMENTAL_PLAN),
      });

      const deps: SyncSchedulerDeps & { mockRunPlan: Mock; mockPlannerFactory: Mock } = {
        sourceRegistry: { list: vi.fn().mockReturnValue([fakeSource]), forTool: vi.fn().mockReturnValue(fakeSource) } as unknown as SourceRegistry,
        sinkRegistry: { list: vi.fn().mockReturnValue([fakeSink]) } as unknown as SinkRegistry,
        markerStore: { read: vi.fn(), write: vi.fn(), resetCategories: vi.fn(), resetAll: vi.fn() },
        orchestrator: { runPlan: mockRunPlan } as unknown as SyncSchedulerDeps['orchestrator'],
        plannerFactory: mockPlannerFactory,
        mockRunPlan,
        mockPlannerFactory,
      };

      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      await capturedOnTick();

      // One runPlan call per session
      expect(mockRunPlan).toHaveBeenCalledTimes(2);
    });

    it('uses planIncremental mode for poll ticks', async () => {
      const deps = makeDeps(REF);
      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      await capturedOnTick();

      expect(deps.mockRunPlan).toHaveBeenCalledOnce();
      const [plan] = deps.mockRunPlan.mock.calls[0] as [SyncPlan];
      expect(plan.mode).toBe('incremental');
    });

    it('one session error does not prevent other sessions from syncing', async () => {
      const ref2: SessionRef = createTestSessionRef('copilot-cli', 'session-2', '/sessions/session-2');
      const fakeSource = {
        ...createFakeSource('copilot-cli', { sessions: [REF, ref2] }),
      };
      const fakeSink = createFakeSink();
      const mockRunPlan = vi.fn().mockResolvedValue(DONE_JOB_UPDATE);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // planIncremental fails for the first session, succeeds for the second
      const mockPlanner = {
        planFull: vi.fn().mockResolvedValue(FULL_PLAN),
        planSelective: vi.fn().mockResolvedValue(SELECTIVE_PLAN),
        planIncremental: vi.fn()
          .mockRejectedValueOnce(new Error('boom'))
          .mockResolvedValue(INCREMENTAL_PLAN),
      };
      const mockPlannerFactory = vi.fn().mockReturnValue(mockPlanner);

      const deps: SyncSchedulerDeps = {
        sourceRegistry: { list: vi.fn().mockReturnValue([fakeSource]), forTool: vi.fn().mockReturnValue(fakeSource) } as unknown as SourceRegistry,
        sinkRegistry: { list: vi.fn().mockReturnValue([fakeSink]) } as unknown as SinkRegistry,
        markerStore: { read: vi.fn(), write: vi.fn(), resetCategories: vi.fn(), resetAll: vi.fn() },
        orchestrator: { runPlan: mockRunPlan } as unknown as SyncSchedulerDeps['orchestrator'],
        plannerFactory: mockPlannerFactory,
      };

      const scheduler = new DefaultSyncScheduler(deps);
      scheduler.start('/sessions');

      await capturedOnTick();

      // Second session was still synced despite the first failing
      expect(mockRunPlan).toHaveBeenCalledOnce();
      // A warning was emitted for the failing session
      expect(warnSpy).toHaveBeenCalledWith(
        '[SyncScheduler] session sync failed, skipping:',
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });
  });

  describe('requestFullReupload', () => {
    it('calls planFull and passes full plan to orchestrator', async () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps);

      await scheduler.requestFullReupload(REF);

      expect(deps.mockPlannerFactory).toHaveBeenCalledOnce();
      expect(deps.mockRunPlan).toHaveBeenCalledOnce();
      const [plan] = deps.mockRunPlan.mock.calls[0] as [SyncPlan];
      expect(plan.mode).toBe('full');
    });

    it('passes the sinks from sinkRegistry to runPlan', async () => {
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler(deps);

      await scheduler.requestFullReupload(REF);

      const [, , sinks] = deps.mockRunPlan.mock.calls[0] as [SyncPlan, unknown, unknown[]];
      expect(Array.isArray(sinks)).toBe(true);
    });

    it('uses the mutex to serialise concurrent full reupload requests', async () => {
      const order: string[] = [];
      let r1: (() => void) | undefined;

      const deps = makeDeps();
      deps.mockRunPlan
        .mockImplementationOnce(() => new Promise<JobUpdate>((res) => { r1 = () => { order.push('1'); res(DONE_JOB_UPDATE); }; }))
        .mockImplementationOnce(async () => { order.push('2'); return DONE_JOB_UPDATE; });

      const scheduler = new DefaultSyncScheduler(deps);

      const p1 = scheduler.requestFullReupload(REF);
      const p2 = scheduler.requestFullReupload(REF);

      // Wait for first runPlan to be called (r1 is set)
      await vi.waitFor(() => {
        expect(r1).toBeDefined();
      });
      r1!();
      await Promise.all([p1, p2]);

      expect(order).toEqual(['1', '2']);
    });
  });

  describe('requestSelective', () => {
    it('calls planSelective with the given categories and runs the plan', async () => {
      const mockPlanSelective = vi.fn().mockResolvedValue(SELECTIVE_PLAN);
      const deps = makeDeps(REF, { planSelective: mockPlanSelective });
      const scheduler = new DefaultSyncScheduler(deps);

      await scheduler.requestSelective(REF, ['metadata']);

      expect(mockPlanSelective).toHaveBeenCalledWith(REF, ['metadata']);
      expect(deps.mockRunPlan).toHaveBeenCalledOnce();
      const [plan] = deps.mockRunPlan.mock.calls[0] as [SyncPlan];
      expect(plan.mode).toBe('selective');
    });
  });

  describe('onJobUpdate forwarding', () => {
    it('forwards onJobUpdate callback to orchestrator.runPlan', async () => {
      const onJobUpdate = vi.fn();
      const deps = makeDeps();
      const scheduler = new DefaultSyncScheduler({ ...deps, onJobUpdate });

      await scheduler.requestFullReupload(REF);

      const [, , , updateCb] = deps.mockRunPlan.mock.calls[0] as [
        SyncPlan,
        unknown,
        unknown[],
        ((u: JobUpdate) => void) | undefined,
      ];
      expect(updateCb).toBe(onJobUpdate);
    });
  });
});
