---
description: Scaffold a new Astro + Starlight documentation site in the docs/ folder
license: MIT
---

# Setup Documentation Site

Scaffold a complete Astro + Starlight documentation website.

## Site Title

${input:title}

## Repository URL (optional)

${input:repository_url}

## Instructions

1. Read the `docs-website` instruction for the full technology stack and configuration reference.
2. Run the Starlight scaffolding command:
   ```bash
   npm create astro@latest -- --template starlight docs
   ```
3. Replace the generated `docs/package.json` dependencies with the pinned set from the instruction.
4. Create `docs/tsconfig.json` extending `astro/tsconfigs/strict`.
5. Configure `docs/astro.config.mjs` with:
   - The provided site title.
   - GitHub social link if a repository URL was provided.
   - Starlight plugins (links-validator, llms-txt).
   - Mermaid integration.
   - Table of contents depth 2–4, pagination enabled, expressive code.
   - Custom CSS reference (`src/styles/custom.css`).
   - An initial sidebar with a Welcome section pointing to the index page.
6. Create `docs/src/content.config.ts` with the Starlight content collection schema.
7. Create `docs/src/styles/custom.css` with a minimal set of Starlight CSS custom properties.
8. Create `docs/src/content/docs/index.mdx` as the landing page with the site title.
9. Run `cd docs && npm install` to install dependencies.
10. Verify the setup with `npm run build`.
11. Report the result and suggest next steps (adding pages, sections, deployment).
