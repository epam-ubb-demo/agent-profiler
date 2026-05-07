# @agent-profiler/export-html

Standalone HTML report exporter for Agent Profiler sessions and bench runs.

## Features

- Produces a **single self-contained HTML file** — no external dependencies
- Inline CSS for styling (tables, timelines, cards)
- Inline JavaScript for interactivity (zoom/pan, sortable tables, collapsible sections)
- Light/dark theme support
- Print-friendly styles
- XSS-safe — all user content is escaped

## Usage

```typescript
import { exportSessionToHtml, exportBenchRunToHtml } from '@agent-profiler/export-html';

// Single session
const html = exportSessionToHtml(session, { title: 'My Session Report' });

// Bench run
const html = exportBenchRunToHtml(aggregation, sessions, {
  title: 'Benchmark Results',
  theme: 'dark',
});
```

## API

### `exportSessionToHtml(session, options?)`

Exports a single session as a standalone HTML report.

### `exportBenchRunToHtml(aggregation, sessions, options?)`

Exports a multi-session bench run as a standalone HTML report.

### `ExportOptions`

| Option                 | Type               | Default   | Description                    |
| ---------------------- | ------------------ | --------- | ------------------------------ |
| `title`                | `string`           | auto      | Document title                 |
| `includeStyles`        | `boolean`          | `true`    | Embed CSS styles               |
| `includeInteractivity` | `boolean`          | `true`    | Embed JavaScript interactivity |
| `theme`                | `'light' \| 'dark'` | `'light'` | Colour theme                   |
