---
title: Plugin Authoring Guide
description: How to create, configure, and publish plugins for Agent Profiler.
---

# Plugin Authoring Guide

Agent Profiler supports two types of plugins:

- **Session Source Plugins** — provide custom session data sources (e.g., CSV files, remote APIs, proprietary log formats)
- **Visualiser Plugins** — add custom session visualisation components

## Getting Started

### 1. Create a Package

Create a new package with the `"agent-profiler-plugin"` keyword in `package.json`:

```json
{
  "name": "@my-org/agent-profiler-plugin-custom-source",
  "version": "1.0.0",
  "type": "module",
  "keywords": ["agent-profiler-plugin"],
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@agent-profiler/plugins": "^0.1.0",
    "@agent-profiler/core": "^0.1.0",
    "@agent-profiler/data-source": "^0.1.0"
  }
}
```

The `"agent-profiler-plugin"` keyword is **required** for automatic plugin discovery.

### 2. Export a Plugin Manifest

Your entry point must export a `PluginManifest`:

```typescript
import type { PluginManifest } from '@agent-profiler/plugins';

const manifest: PluginManifest = {
  apiVersion: '1.0',
  plugins: [
    // ... your plugins
  ],
};

export default manifest;
```

You can use either a default export or a named `manifest` export.

## Session Source Plugins

A session source plugin provides a `SessionDataSource` implementation that Agent Profiler can use to load session data from custom sources.

### Interface

```typescript
interface SessionSourcePlugin {
  readonly metadata: PluginMetadata;
  readonly adapterType: string;
  createDataSource(config: Record<string, unknown>): SessionDataSource;
}
```

### Example

```typescript
import type { Session } from '@agent-profiler/core';
import type { SessionDataSource, SessionListItem } from '@agent-profiler/data-source';
import type { PluginManifest, SessionSourcePlugin } from '@agent-profiler/plugins';

class MyDataSource implements SessionDataSource {
  constructor(private readonly apiUrl: string) {}

  async listSessions(): Promise<SessionListItem[]> {
    const response = await fetch(`${this.apiUrl}/sessions`);
    return response.json();
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const response = await fetch(`${this.apiUrl}/sessions/${sessionId}`);
    if (!response.ok) return null;
    return response.json();
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

const myPlugin: SessionSourcePlugin = {
  metadata: {
    id: 'my-api-source',
    name: 'My API Source',
    version: '1.0.0',
    description: 'Fetches sessions from my custom API',
    author: 'My Team',
  },
  adapterType: 'my-api',
  createDataSource(config) {
    const apiUrl = (config['apiUrl'] as string) ?? 'http://localhost:3000';
    return new MyDataSource(apiUrl);
  },
};

const manifest: PluginManifest = {
  apiVersion: '1.0',
  plugins: [myPlugin],
};

export default manifest;
```

## Visualiser Plugins

A visualiser plugin provides a React component that renders a custom view of session data.

### Interface

```typescript
interface VisualiserPlugin {
  readonly metadata: PluginMetadata;
  readonly componentName: string;
  load(): Promise<React.ComponentType<{ session: Session }>>;
}
```

### Example

```typescript
import type { PluginManifest, VisualiserPlugin } from '@agent-profiler/plugins';

const timelinePlugin: VisualiserPlugin = {
  metadata: {
    id: 'timeline-visualiser',
    name: 'Timeline View',
    version: '1.0.0',
  },
  componentName: 'TimelineView',
  async load() {
    const { TimelineView } = await import('./TimelineView');
    return TimelineView;
  },
};

const manifest: PluginManifest = {
  apiVersion: '1.0',
  plugins: [timelinePlugin],
};

export default manifest;
```

## Plugin Metadata

Every plugin requires metadata:

```typescript
interface PluginMetadata {
  readonly id: string;        // Unique identifier (e.g., "csv-source")
  readonly name: string;      // Human-readable name
  readonly version: string;   // Semver version (e.g., "1.0.0")
  readonly description?: string;
  readonly author?: string;
}
```

- `id` must be unique across all installed plugins.
- `version` must follow semantic versioning.

## Configuration

Plugin data sources receive configuration via the `config` parameter in `createDataSource()`. The configuration is a generic key-value object (`Record<string, unknown>`) that can be populated from:

- User settings in the application
- Environment variables
- Configuration files

Example configuration flow:

```typescript
// In your plugin:
createDataSource(config) {
  const path = config['csvPath'] as string;
  const delimiter = (config['delimiter'] as string) ?? ',';
  return new CsvDataSource(path, delimiter);
}
```

## Discovery and Loading

Agent Profiler discovers plugins by scanning configured directories for packages with the `"agent-profiler-plugin"` keyword. The loading process:

1. Scan the plugins directory for subdirectories
2. Check each for a `package.json` with the correct keyword
3. Dynamically import the package entry point
4. Validate the exported manifest against the plugin schema
5. Register valid plugins

Invalid or broken plugins are skipped with a warning log.

## Validation

Plugin manifests are validated at load time using Zod schemas. Common validation errors:

| Error | Cause |
|-------|-------|
| Invalid apiVersion | Must be exactly `'1.0'` |
| Empty plugins array | At least one plugin is required |
| Missing metadata fields | `id`, `name`, and `version` are required |
| Invalid version format | Must start with semver (e.g., `1.0.0`) |

## Publishing

To share your plugin:

1. Publish to npm with the `"agent-profiler-plugin"` keyword
2. Users install it into their plugins directory
3. Agent Profiler discovers it on next startup

## Security Notes

Plugins run in the same process as Agent Profiler. They have full access to:

- Session data
- The Node.js runtime
- The filesystem (within process permissions)

Only install plugins from trusted sources.

## API Versioning

The `apiVersion` field ensures forward compatibility:

- Current stable version: **`1.0`**
- If the plugin contract changes in a breaking way, a new version will be released
- Plugins targeting an unsupported version will be rejected at load time
