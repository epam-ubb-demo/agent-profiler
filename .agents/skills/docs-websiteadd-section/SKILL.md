---
description: Add a new sidebar section with an index page to the documentation site
license: MIT
---

# Add Documentation Section

Create a new content section with a sidebar group and index page.

## Section Name

${input:name}

## Instructions

1. Convert the section name to a kebab-case folder slug.
2. Create the folder `docs/src/content/docs/<slug>/`.
3. Create an `index.mdx` inside the folder with:
   - `title` — the section name.
   - `description` — a short overview of what the section covers.
   - A brief introductory paragraph.
4. Update `docs/astro.config.mjs` to add a new sidebar group for this section. Use `autogenerate` with the directory slug if the section will contain many pages, or a manual items array for a small curated set.
5. Verify the build: `cd docs && npm run build`.
6. Report the new section path and sidebar configuration added.
