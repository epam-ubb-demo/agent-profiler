---
description: Add a new documentation page to the Astro + Starlight site
license: MIT
---

# Add Documentation Page

Add a new Markdown or MDX page to the documentation site.

## Page Title

${input:title}

## Section

${input:section}

## Topic Description (optional)

${input:topic}

## Instructions

1. Determine the target path: `docs/src/content/docs/<section>/<slug>.mdx` where `<slug>` is a kebab-case version of the title.
2. Create the file with frontmatter:
   - `title` — the provided page title.
   - `description` — a one-sentence summary derived from the topic or title.
3. Add an introductory paragraph based on the topic description.
4. If the section folder does not exist yet, create it and suggest adding a sidebar entry in `astro.config.mjs`.
5. Verify the page renders by running `cd docs && npm run build`.
