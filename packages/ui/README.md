# @agent-profiler/ui

React component library for visualising AI coding-agent session timelines.

## Components

### `<Timeline session={session} />`

Main container that renders a full timeline visualization for a `Session` object from `@agent-profiler/core`.

Features:
- **Token heatmap** — 60-bin colour-coded intensity (green→yellow→red)
- **Model lane** — horizontal segments showing active model
- **Tool lanes** — concurrent tool calls packed into swim lanes (Gantt-style)
- **Message lane** — vertical bars proportional to output tokens
- **Compaction lane** — diamond markers for compaction events
- **Adaptive ticks** — progressively revealed time axis labels
- **Zoom controls** — 1x to 20x horizontal zoom with drag-to-pan
- **Fixed gutter** — lane labels stay visible during pan

## Usage

```tsx
import { Timeline } from '@agent-profiler/ui';

function SessionView({ session }) {
  return <Timeline session={session} />;
}
```

## Development

```sh
pnpm install
pnpm -F @agent-profiler/ui test
pnpm -F @agent-profiler/ui typecheck
pnpm -F @agent-profiler/ui lint
```
