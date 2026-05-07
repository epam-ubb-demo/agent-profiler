---
title: "ADR-0001: Documentation site stack"
description: Why Astro + Starlight was chosen for the documentation site.
---

## Status

Accepted

## Context

Agent Profiler needs a documentation site that supports:

- Markdown and MDX authoring
- Code blocks with syntax highlighting
- Mermaid diagrams for architecture visualisation
- Good developer experience (fast builds, hot reload)
- GitHub Pages deployment
- Accessibility and dark/light mode out of the box
- Link validation to prevent broken references
- LLM-friendly output (`/llms.txt`)

The team evaluated several static site generators:

1. **Docusaurus** — React-based, mature, but heavier and slower builds
2. **VitePress** — Vue-based, fast, but less ecosystem for plugins
3. **Astro + Starlight** — content-focused, fast, excellent Markdown/MDX support, growing plugin ecosystem

## Decision

Use **Astro 5.x** with the **Starlight** documentation theme.

Key plugins:
- `@astrojs/sitemap` for SEO
- `starlight-links-validator` to catch broken links at build time
- `starlight-llms-txt` to publish LLM-consumable content

## Consequences

### Positive

- Fast build times (content-first architecture, minimal JS shipped)
- Native MDX support with Astro components
- Built-in dark/light mode, search, and accessibility
- Plugin ecosystem growing rapidly
- Deploys as static HTML to GitHub Pages with zero runtime cost

### Negative

- Starlight is newer than Docusaurus — smaller community, fewer battle-tested patterns
- Some plugins (e.g. Mermaid) may require workarounds for compatibility
- Team members unfamiliar with Astro will need a short onboarding

### Neutral

- Site lives in `apps/docs/` as a workspace package — same monorepo conventions as other apps
- ADRs are plain Markdown files in `src/content/docs/architecture/adr/`
