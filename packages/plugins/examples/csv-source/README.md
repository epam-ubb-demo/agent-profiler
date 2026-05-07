# CSV Source Plugin Example

This is an example plugin that demonstrates how to create a **SessionSourcePlugin** for Agent Profiler.

## Overview

The CSV Source plugin reads session data from CSV files (mock implementation). It shows the full contract a plugin must implement:

1. **Plugin metadata** — ID, name, version, description, author
2. **Adapter type** — A unique string identifying this data source type
3. **Factory method** — `createDataSource(config)` returns a configured `SessionDataSource`

## Structure

```
csv-source/
├── package.json          # Must include "agent-profiler-plugin" keyword
├── src/
│   └── index.ts          # Exports a PluginManifest
└── README.md
```

## Key Requirements

### package.json

Your `package.json` **must** include the `"agent-profiler-plugin"` keyword for automatic discovery:

```json
{
  "name": "@my-org/agent-profiler-plugin-csv",
  "keywords": ["agent-profiler-plugin"],
  "exports": { ".": "./src/index.ts" }
}
```

### Manifest Export

Your entry point must export a `PluginManifest` either as the default export or as a named `manifest` export:

```typescript
import type { PluginManifest } from '@agent-profiler/plugins';

const manifest: PluginManifest = {
  apiVersion: '1.0',
  plugins: [/* your plugins */],
};

export default manifest;
```

## Running

This example is part of the Agent Profiler monorepo and uses workspace dependencies. To use it as a template for your own plugin, copy the structure and replace workspace dependencies with published package versions.
