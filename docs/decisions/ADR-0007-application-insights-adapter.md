# ADR-0007: Application Insights Adapter

## Status

Accepted

## Date

2025-07-18

## Context

Agent Profiler needs to reconstruct `Session` domain objects from OTel spans stored in Azure Application Insights. Existing adapters (Copilot CLI, VS Code Chat) parse local, proprietary event streams — JSONL logs and chat transcripts — using adapter-specific parsers. A new OTel Gateway (built by a separate team) instruments GitHub Copilot agents with OpenTelemetry spans that are exported to Application Insights, where they land as flat rows in Log Analytics Workspace tables.

A new adapter is needed for this cloud-hosted telemetry. The key architectural question is whether this should be a **plugin** (per [ADR-0006](ADR-0006-plugin-contract.md)) or a **first-class adapter** within the monorepo.

## Decision

### First-class adapter, not a plugin

The Application Insights adapter is packaged as `@agent-profiler/adapters-application-insights`, a first-class monorepo package — not a plugin per [ADR-0006](ADR-0006-plugin-contract.md).

| Criteria | First-class adapter | Plugin (ADR-0006) |
|---|---|---|
| **Version management** | Versioned alongside the monorepo; compatible by construction | Must track host API versions independently |
| **SDK dependencies** | Azure SDK packages (`@azure/identity`, `@azure/monitor-query`) version-managed centrally via `pnpm-workspace.yaml` | Plugin must bundle or peer-depend on Azure SDK; version drift risk |
| **Domain coupling** | Tightly coupled to `Session` domain model evolution ([ADR-0003](ADR-0003-domain-model.md)); field additions propagate automatically | Must update against a stable, published contract; lags behind domain changes |
| **Release cadence** | Released with each monorepo version | Independent release cycle adds coordination overhead |

### Authentication via DefaultAzureCredential

The adapter uses `@azure/identity` `DefaultAzureCredential` as the default authentication mechanism, with an optional `credential` override accepting any `TokenCredential`. This supports Azure CLI, environment variables, and Managed Identity without adapter changes.

### On-demand KQL query pattern

Sessions are fetched on demand via KQL queries against Log Analytics, not streamed or pushed. The `QueryClient` wraps `@azure/monitor-query-logs` `LogsQueryClient`. This means the adapter is **read-only and stateless** per request — no connection pooling, no subscription management.

### SessionCache extension point

A `SessionCache` interface is exposed for callers to inject caching (e.g., LRU, Redis). The adapter itself does not implement caching — it only provides the integration point. Cache read/write failures are silently ignored to avoid affecting query results.

### Session reconstruction via 7-step pipeline

Flat span rows are transformed through a deterministic pipeline:

1. **Parse** — Validate raw rows against a Zod schema, producing typed `OTelSpan` objects.
2. **Deduplicate** — Remove duplicate span IDs, keeping the entry with the latest timestamp.
3. **Build tree** — Reconstruct the parent–child hierarchy from `spanId` / `parentSpanId` references.
4. **Extract turns** — Identify turn boundaries from `copilot_chat.turn.id` attributes (Strategy A) or infer them from tree depth (Strategy B fallback).
5. **Map events** — Transform spans into domain objects: `Turn`, `ToolCall`, `AssistantMessage`, `UserMessage`, and `SubagentInvocation`.
6. **Aggregate metrics** — Compute `ModelMetrics` and `ShutdownMetrics` from LLM spans, grouping token counts and request durations by model.
7. **Assemble** — Produce the final immutable `Session` together with a `ParseStatus` describing data quality.

This pipeline is documented in detail in the spike [docs/spikes/spike-otel-span-to-session.md](../spikes/spike-otel-span-to-session.md).

## Consequences

- **Simpler dependency management** — Azure SDK versions are managed centrally in the monorepo workspace, eliminating version-drift issues that a plugin would face.
- **Domain model alignment** — The adapter evolves in lockstep with `@agent-profiler/core` ([ADR-0003](ADR-0003-domain-model.md)). Schema changes are caught at build time, not at plugin load time.
- **Cloud dependency** — Unlike local-file adapters, this adapter requires network access to Azure and valid credentials. Offline or air-gapped environments cannot use it.
- **KQL coupling** — The adapter embeds KQL queries that depend on the Application Insights table schema. Changes to the OTel Gateway's export configuration may require adapter updates.
- **No caching by default** — The `SessionCache` extension point provides flexibility but means every query hits Log Analytics unless the caller provides a cache implementation. This is a deliberate trade-off: the adapter stays stateless, and caching policy is a consumer concern.
- **Plugin contract remains valid** — This decision does not weaken [ADR-0006](ADR-0006-plugin-contract.md). Third-party teams that want to add custom session sources should still use the plugin contract. The Application Insights adapter is first-class because it is maintained by the core team and has tight domain coupling.
