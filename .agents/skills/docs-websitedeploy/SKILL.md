---
description: Set up a GitHub Actions workflow to deploy the documentation site to GitHub Pages
license: MIT
---

# Deploy Documentation Site

Create or update the GitHub Actions workflow for deploying the Astro + Starlight site to GitHub Pages.

## Repository

${input:repository}

## Instructions

1. Read the deployment section of the `docs-website` instruction for the reference workflow.
2. Create `.github/workflows/deploy-docs.yml` with:
   - Trigger on pushes to `main` that change `docs/**`, plus `workflow_dispatch`.
   - Node.js 24 setup, dependency install, and `astro build` in the `docs/` directory.
   - `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` steps.
   - Correct permissions (`contents: read`, `pages: write`, `id-token: write`).
   - Concurrency group to prevent overlapping deployments.
3. Update `docs/astro.config.mjs` to set `site` and `base` for the GitHub Pages URL derived from the repository identifier.
4. Verify the workflow file is valid YAML.
5. Remind the user to enable GitHub Pages with **GitHub Actions** as the source in the repository settings.
