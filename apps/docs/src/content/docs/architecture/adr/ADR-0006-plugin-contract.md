---
title: "ADR-0006: Plugin Contract Stabilisation"
description: Stable versioned plugin contract for third-party session sources and visualisers.
---

## Status

Accepted

## Date

2025-07-15

## Context

Agent Profiler supports multiple session data adapters (Copilot CLI, VS Code Chat, VS Code Agent, CTB) via the `SessionDataSource` interface. As the project matures, external teams want to add custom session sources (e.g., from proprietary logging systems) and custom visualisers without modifying the core application.

We need a stable, versioned plugin contract that:

1. Allows third-party session sources and visualisers
2. Is discoverable at runtime
3. Validates correctness before use
4. Does not introduce IPC complexity for local plugins

## Decision

### Plugin Contract (v1.0)

We define two plugin interfaces:

- **`SessionSourcePlugin`** — wraps a `SessionDataSource` with metadata and a factory method
- **`VisualiserPlugin`** — provides a lazily-loaded React component for custom session views

Both are bundled in a **`PluginManifest`** with an explicit `apiVersion: '1.0'` field.

### Dynamic Import over IPC

Plugins are loaded via dynamic `import()` in the same Node.js process. We chose this over IPC-based isolation because:

| Criteria | Dynamic Import | IPC (child process / worker) |
|----------|---------------|------------------------------|
| Latency | Negligible | Serialisation overhead |
| Complexity | Simple `import()` | Protocol, serialisation, lifecycle management |
| Data passing | Direct object references | Must serialise `Session` objects |
| Error handling | Standard try/catch | Cross-process error propagation |
| Plugin authoring | Simple ES module export | Must implement message protocol |

For local desktop use, the simplicity of in-process loading outweighs isolation benefits. If sandboxing becomes necessary (e.g., untrusted plugins in a server deployment), a future `apiVersion: '2.0'` can add worker-based isolation.

### Versioning Strategy

The `apiVersion` field in `PluginManifest` enables forward compatibility:

- **`'1.0'`** — Current stable contract. Breaking changes require a new major version.
- The loader validates `apiVersion` against supported versions and rejects unknown values.
- Plugin authors declare which API version they target; the host can support multiple versions simultaneously.

### Discovery Mechanism

Plugins are discovered by scanning a configured directory for packages whose `package.json` includes the `"agent-profiler-plugin"` keyword.

### Validation

All manifests are validated at load time using Zod schemas. This catches contract violations before plugins are used, providing clear error messages to plugin authors.

## Security Considerations

Plugins run in the same Node.js process as the application. This means:

- **Arbitrary code execution** — A plugin can execute any code the host process can.
- **Data access** — Plugins have access to all session data.
- **No sandboxing** — There is no process isolation or capability restriction.

Mitigations:

1. Plugins must be explicitly installed (placed in the plugins directory).
2. The application logs which plugins are loaded at startup.
3. The `"agent-profiler-plugin"` keyword acts as an intentional opt-in signal.
4. Future versions may add signature verification or worker isolation.

This is acceptable for a desktop tool where the user controls which plugins are installed.

## Consequences

- Plugin authors get a simple, well-documented contract to implement.
- The core application can load custom sources without code changes.
- Breaking changes to the plugin API require incrementing `apiVersion`.
- Security relies on user trust of installed plugins (acceptable for desktop use).
- If we need server-side plugin support, we must add isolation in a future API version.
