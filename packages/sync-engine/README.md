# @agent-profiler/sync-engine

The sync engine that ties enrichment sources and sinks together via markers and planning.

## Overview

This package implements the core sync primitives:

- **`FileMarkerStore`** — persists per-session markers to disk using atomic file writes (write-to-temp, rename) for crash safety.
- **`DefaultSyncPlanner`** — determines what to sync and from which ordinal, by consulting a `MarkerStore` and a `SessionEnrichmentSource`.

## Interfaces

Both classes implement interfaces defined in `@agent-profiler/enrichment-core`:

- `FileMarkerStore` implements `MarkerStore`
- `DefaultSyncPlanner` implements `SyncPlanner`

## Usage

```typescript
import { FileMarkerStore, DefaultSyncPlanner } from '@agent-profiler/sync-engine';

const markerStore = new FileMarkerStore('/path/to/marker-dir');
const planner = new DefaultSyncPlanner(markerStore, mySource);

// Full re-sync plan
const fullPlan = await planner.planFull(ref);

// Incremental plan (resumes from last cursor)
const incrementalPlan = await planner.planIncremental(ref);
```

## Testing

```bash
pnpm --filter @agent-profiler/sync-engine test
```
