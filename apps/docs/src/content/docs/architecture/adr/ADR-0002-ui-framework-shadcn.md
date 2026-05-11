---
title: "ADR-0002: UI Component Library — shadcn/ui + Radix UI"
description: Original UI framework decision, now superseded by ADR-0007.
---

## Status

Superseded by [ADR-0007](/agent-profiler/architecture/adr/adr-0007-ui-framework-epam-uui/)

## Date

2026-05-07

## Context

Agent Profiler is an MIT-licensed desktop application built with Electron + React. The project requires a UI component library for building the interface (timeline views, data tables, modals, forms, etc.).

The original plan specified EPAM UUI as the component library. However, a licence compatibility spike revealed that EPAM UUI's licence terms have not been confirmed as compatible with MIT distribution. Since the project owner (Sergio Sisternes) was unavailable to resolve this blocker, and F0.2 (Electron shell) depends on having a UI framework selected, an autonomous decision was required.

## Decision

We will use **shadcn/ui** built on **Radix UI** primitives as the UI component library.

## Rationale

| Criterion | shadcn/ui + Radix UI | EPAM UUI | Mantine |
|-----------|---------------------|----------|---------|
| Licence | MIT ✓ | Unclear ✗ | MIT ✓ |
| React compatibility | Excellent | Good | Excellent |
| Customisation | Full (copy-paste pattern) | Themed | Themed |
| Accessibility | Built-in (Radix) | Good | Good |
| Bundle size | Tree-shakeable, minimal | Large | Medium |
| Community & docs | Large, active | Internal | Good |
| TypeScript | First-class | First-class | First-class |

Key factors:
1. **Licence clarity** — MIT-licensed, no ambiguity for an open-source project.
2. **Copy-paste ownership** — shadcn/ui components are copied into the project, giving full control without external dependency version churn.
3. **Radix primitives** — battle-tested accessibility patterns (WAI-ARIA compliant).
4. **Tailwind CSS integration** — aligns with modern React desktop app styling patterns.
5. **Flexibility** — no vendor lock-in; components can be modified freely.

## Consequences

- F0.2 (Electron shell) will scaffold with shadcn/ui + Tailwind CSS instead of EPAM UUI.
- Theme tokens will use Tailwind CSS variables rather than EPAM UUI's theme system.
- No EPAM-branded defaults; the app will have its own visual identity.
- Developers must install components individually via `npx shadcn@latest add <component>`.
- If Sergio later resolves the EPAM UUI licence and prefers it, migration would require replacing component implementations (the data/logic layer is unaffected).

## Alternatives Considered

1. **EPAM UUI** — blocked on licence verification. Could revisit if cleared.
2. **Mantine** — excellent but opinionated; shadcn/ui offers more control.
3. **Radix UI (bare)** — too low-level without a component layer; shadcn/ui provides the styled defaults.
4. **Material UI** — large bundle, opinionated styling, less suitable for a desktop app.
