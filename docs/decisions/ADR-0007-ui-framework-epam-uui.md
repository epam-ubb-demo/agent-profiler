# ADR-0007: Use EPAM UUI with Loveship Skin as UI Component Library

## Status

Accepted

## Date

2026-07-15

## Context

Agent Profiler is an EPAM internal desktop tool. EPAM UUI is the standard component library for EPAM products, providing corporate identity (colours, typography, layout, icons) out of the box.

The original decision ([ADR-0002](ADR-0002-ui-framework-shadcn.md)) selected shadcn/ui + Radix UI as the UI component library, citing licence uncertainty with EPAM UUI. This concern was unfounded — EPAM UUI is MIT-licensed and freely usable in any EPAM project. With the licence question resolved, the rationale for choosing shadcn/ui no longer holds.

Additionally, the application currently lacks an application shell (header, navigation, branding). EPAM UUI provides this through its `MainMenu`, `FlexRow`/`FlexCell`, and `Panel` components, along with a complete theme and modal system.

## Decision

Adopt **EPAM UUI with the Loveship skin** as the UI component library, replacing shadcn/ui, Tailwind CSS, Radix UI, and lucide-react.

The following packages will be added:

- `@epam/uui` — core UUI framework (context, services, hooks)
- `@epam/uui-core` — base component interfaces and utilities
- `@epam/uui-components` — unskinned component implementations
- `@epam/loveship` — Loveship skin (EPAM-branded theme)
- `@epam/assets` — icons and static assets

Loveship is chosen over Electric (the alternative modern theme) because it provides the established EPAM corporate look expected for internal tooling.

## Consequences

### Positive

- Consistent EPAM branding across the application without custom theme work
- Access to UUI's layout system (`FlexRow`, `FlexCell`, `Panel`), theme engine, and modal/notification services
- Application shell with EPAM header and sidebar navigation via `MainMenu`
- Removal of 5+ dependencies: Tailwind CSS, Radix UI, lucide-react, class-variance-authority (CVA), clsx
- Alignment with other EPAM internal tools — familiar patterns for EPAM developers

### Negative

- Larger bundle size compared to tree-shakeable shadcn/ui (acceptable for an Electron app where bandwidth is not a concern)
- Learning curve for the UUI API and Loveship component library
- Fewer community resources compared to shadcn/ui (UUI documentation is the primary reference)

### Neutral

- Migration requires replacing component implementations; the data and logic layers are unaffected
- UUI's `DataSource` pattern for tables and lists is different from the current approach and may require adapter code
