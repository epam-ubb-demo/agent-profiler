---
description: Build the documentation site and validate links
license: MIT
---

# Build and Validate Documentation

Build the Astro + Starlight documentation site and report any issues.

## Instructions

1. Run the production build:
   ```bash
   cd docs && npm install && npm run build
   ```
2. Review the build output for:
   - **Broken links** reported by `starlight-links-validator`.
   - **Build errors** or warnings from Astro.
   - **TypeScript errors** from strict checking.
3. If errors are found:
   - List each error with its file path and description.
   - Suggest a fix for each issue.
   - Apply fixes and re-run the build to confirm resolution.
4. If the build succeeds, report the output size and confirm the site is ready for deployment.
