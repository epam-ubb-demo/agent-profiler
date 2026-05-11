---
title: "ADR-0003: Canonical Domain Model"
description: Why the domain model was ported from the Python prototype with specific design choices.
---

## Status

Accepted

## Date

2025-01-15

## Context

Agent Profiler needs a shared domain model that all packages — adapters,
UI, pricing, and comparison logic — can depend on. The model must
represent Copilot CLI session data including turns, tool calls, assistant
messages, compactions, sub-agent invocations, and shutdown metrics.

A proven prototype already exists in `ctb/viz.py` (the `copilot-token-benchmark`
project). That prototype has been validated against hundreds of real Copilot
CLI sessions and encodes hard-won knowledge about edge cases (partial
shutdowns, missing fields, sub-agent fan-outs).

## Decision

### Port from the Python prototype

We port the data model from `ctb/viz.py` dataclasses into TypeScript
interfaces and Zod schemas. The **"prototype is right" alignment principle**
means we trust field semantics from the prototype unless there is a
compelling reason to diverge. This avoids re-discovering parsing edge
cases.

### Key decisions

| Decision | Rationale |
|----------|-----------|
| **camelCase field names** | TypeScript convention; the prototype uses snake_case |
| **Zod 3.x for runtime validation** | Validate at parsing boundaries; internal code trusts types |
| **Session as top-level aggregate** | Single entry point mirrors `VizSession` — all data for one session lives in one object |
| **`ParseStatus` on every Session** | A session is always produced, never throw from parsing — partial data is still valuable |
| **`readonly` modifier** | Domain objects are treated as immutable snapshots |
| **Separate types/ and schemas/ directories** | Types are zero-cost at runtime; schemas carry Zod's runtime footprint — consumers can import only what they need |
| **Annotation and BenchRun** | Anticipate F2.x (benchmark comparison) and F4.x (annotation) features without coupling |

### Divergences from prototype

1. **Token deltas on AssistantMessage** — added `inputTokens`, `cacheReadTokens`,
   `cacheWriteTokens` for per-message cost attribution (the prototype only
   tracked `output_tokens`).
2. **SubagentInvocation.agentName / agentType** — explicit fields rather than
   relying on log-line parsing at render time.
3. **UtilisationSample.buckets** — structured `TokenBucket` instead of flat
   `used` / `total` to enable bucket-level charting.
4. **Turn type** — explicit grouping entity (the prototype derived this
   dynamically in `build_fanout_turns`).

## Consequences

- All downstream packages (`@agent-profiler/adapters`, UI, pricing) import
  types and schemas from `@agent-profiler/core`.
- Adding a field requires updating both the interface and the Zod schema,
  plus the golden test fixture.
- The golden fixture in `__tests__/fixtures/golden-session.json` serves as
  the contract: if it stops parsing, something broke.
