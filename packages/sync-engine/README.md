# @agent-profiler/sync-engine

The sync engine that ties enrichment sources and sinks together via markers and planning.

## Overview

This package implements the core sync primitives:

- **`FileMarkerStore`** — persists per-session markers to disk using atomic file writes (write-to-temp, rename) for crash safety.
- **`DefaultSyncPlanner`** — determines what to sync and from which ordinal, by consulting a `MarkerStore` and a `SessionEnrichmentSource`.
- **`DefaultSyncOrchestrator`** — executes a `SyncPlan` end-to-end: reads events from the source in category batches, pushes to all sinks, handles retryable errors with exponential backoff, and updates the marker after each successful batch flush.
- **`KeyedMutex`** — a FIFO per-key mutex built on a promise chain; ensures concurrent sync operations for the same session are serialised rather than racing.
- **`LiveWatcher`** — wraps `node:fs.watch()` with per-session debouncing; calls an `onChange` callback whenever a session directory changes.
- **`PollGuard`** — thin `setInterval` wrapper that calls an async `onTick` callback on a configurable interval, swallowing errors to keep the timer alive.
- **`DefaultSyncScheduler`** — top-level coordinator that wires `LiveWatcher` + `PollGuard` + `SyncPlanner` + `DefaultSyncOrchestrator` + `KeyedMutex` together; exposes `start`, `stop`, `requestFullReupload`, and `requestSelective` APIs.

## Interfaces

All classes implement interfaces defined in `@agent-profiler/enrichment-core`:

- `FileMarkerStore` implements `MarkerStore`
- `DefaultSyncPlanner` implements `SyncPlanner`

## Usage

```typescript
import {
  FileMarkerStore,
  DefaultSyncPlanner,
  DefaultSyncOrchestrator,
  DefaultSyncScheduler,
  KeyedMutex,
  LiveWatcher,
  PollGuard,
} from '@agent-profiler/sync-engine';

// ── Basic planner + orchestrator ──────────────────────────────────────────────

const markerStore = new FileMarkerStore('/path/to/marker-dir');
const planner = new DefaultSyncPlanner(markerStore, mySource);
const orchestrator = new DefaultSyncOrchestrator(markerStore);

// Incremental sync
const plan = await planner.planIncremental(ref);
await orchestrator.runPlan(plan, mySource, [mySink], (update) => {
  console.log('job update:', update);
});

// ── High-level scheduler (recommended) ────────────────────────────────────────

const scheduler = new DefaultSyncScheduler({
  sourceRegistry,
  sinkRegistry,
  markerStore,
  orchestrator,
  plannerFactory: (source) => new DefaultSyncPlanner(markerStore, source),
  onJobUpdate: (update) => console.log(update),
});

scheduler.start('/path/to/sessions-root');

// Trigger manual full re-upload for a session
await scheduler.requestFullReupload(ref);

// Stop all watchers and timers
scheduler.stop();

// ── Low-level primitives ──────────────────────────────────────────────────────

// KeyedMutex — serialise per-session operations
const mutex = new KeyedMutex();
const release = await mutex.acquire('tool:session-id');
try {
  // critical section
} finally {
  release();
}

// LiveWatcher — debounced filesystem watcher
const watcher = new LiveWatcher('/sessions', (changedPath) => {
  console.log('session changed:', changedPath);
});
watcher.start();

// PollGuard — interval-based polling
const guard = new PollGuard(async () => {
  await doPeriodicWork();
});
guard.start();
```

## Testing

```bash
pnpm --filter @agent-profiler/sync-engine test
pnpm --filter @agent-profiler/sync-engine typecheck
pnpm --filter @agent-profiler/sync-engine lint
```
