# @agent-profiler/adapters-ctb

Adapter for parsing **ctb** (Copilot Test Bench) benchmark run directories into
structured `CtbBenchRun` objects.

## Usage

```typescript
import { parseCtbBenchRun } from '@agent-profiler/adapters-ctb';

const run = await parseCtbBenchRun('/path/to/.ctb/runs/fix-bug/2024-01-15T10-30-00');

console.log(run.name);      // "fix-bug"
console.log(run.variants);  // [{ id: "claude-sonnet-4-20250514", steps: [...] }, ...]
```

## Expected directory layout

```
<run-output>/copilot/<variant_id>/step-<N>/session-state/<uuid>/events.jsonl
```

## API

### `parseCtbBenchRun(runDir, options?)`

Parse a ctb benchmark run directory. Never throws — returns a `CtbBenchRun`
with empty variants on failure.

| Option  | Type     | Description                          |
| ------- | -------- | ------------------------------------ |
| `name`  | `string` | Override inferred bench name          |
| `runId` | `string` | Override inferred run ID              |
