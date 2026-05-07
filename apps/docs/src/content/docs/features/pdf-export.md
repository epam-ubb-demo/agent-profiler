---
title: PDF Export
description: Export session data and views as PDF documents.
---

## Overview

The PDF export feature allows you to save Agent Profiler views and session
data as formatted PDF documents. This is useful for sharing reports with
team members, archiving session summaries, or creating print-ready documentation.

## Usage

### Export Current View

Click the **Export PDF** button in the toolbar to export the current view
as a PDF document. A native "Save As" dialog will open to choose the
output location.

### Export a Session

When viewing a specific session, the export will include:

- Session metadata (ID, model, repository, branch)
- Turn-by-turn conversation history
- Tool call results with success/failure indicators

### Options

| Option | Default | Description |
|--------|---------|-------------|
| Page Size | A4 | Paper size (A4, Letter, A3) |
| Orientation | Portrait | Page orientation |
| Margins | 40px all sides | Page margins in CSS pixels |
| Background | Enabled | Include CSS backgrounds |
| Header/Footer | Enabled | Include page headers and footers |

## Programmatic API

The `@agent-profiler/export-pdf` package can be used directly:

```typescript
import { PdfExporter } from '@agent-profiler/export-pdf';

const exporter = new PdfExporter();

// Export the current BrowserWindow view
await exporter.exportView(webContents, {
  outputPath: '/path/to/output.pdf',
  landscape: false,
  pageSize: 'A4',
});

// Export a session with custom title
await exporter.exportSession(session, {
  outputPath: '/path/to/session-report.pdf',
  title: 'Sprint Review Session',
}, createOffscreenWindow);
```

## Architecture

The feature is implemented across several packages:

- **`@agent-profiler/export-pdf`** — Core export logic, templates, and options
- **`apps/desktop`** — IPC handlers bridging renderer requests to main process
- **`@agent-profiler/ui`** — `PdfExportButton` React component
