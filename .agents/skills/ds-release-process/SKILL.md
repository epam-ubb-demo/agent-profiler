---
description: Versioning and release workflow standards for package and repository delivery — covers tag-based atomic releases and release-branch stabilization workflows
license: MIT
---

# Release Process

Use this skill to plan and execute a consistent release workflow. Two release models are documented below; select the one that fits the project's characteristics.

## Model Selection

| Characteristic | Model A — Tag-Based Atomic | Model B — Release Branch |
|----------------|---------------------------|--------------------------|
| Release frequency | High (weekly or more) | Low (monthly or less) |
| Stabilization period needed | No | Yes |
| Monorepo with multiple packages | Preferred | Workable |
| Hotfix strategy | Patch tag on `main` | Branch from release branch |
| Manual pre-release testing | Not required | Required |

**Choose Model A** when the default branch is always releasable and artifacts can be validated entirely by CI.

**Choose Model B** when the team needs a dedicated stabilization period, cherry-picks, or extended UAT before shipping.

---

## Model A — Tag-Based Atomic Release (recommended)

### Overview

The git tag is the single source of truth. The release pipeline runs only when a `v*` tag is pushed; every stage must pass before the next one starts.

```
Developer bumps version → commits to main → pushes v* tag
Pipeline: Validate → Build → Publish → Release (sequential, each gates the next)
GitHub Release auto-created after all artifacts pass
Rollback: delete tag + unpublish artifacts
```

### Procedure (ordered)

1. **Bump version** in all version files (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.) and commit to `main`.
2. **Push a semver tag** (`vX.Y.Z`) matching the version in code.
3. **Validate stage** — pipeline runs lint, typecheck, and full test suite; fails fast if any check fails.
4. **Build stage** — compile and package artifacts; verify checksums.
5. **Publish stage** — push artifacts to the registry (npm, Docker, PyPI, etc.); gated on validate + build passing.
6. **Release stage** — auto-create GitHub Release with `softprops/action-gh-release`; attach artifact checksums; populate release notes from `.github/release.yml` categories.
7. **Verify** — confirm artifacts are accessible in the registry and the GitHub Release is correct.

### Pipeline structure (GitHub Actions)

```yaml
on:
  push:
    tags: ['v*']

jobs:
  validate:   # lint, typecheck, test
  build:      # compile + package
    needs: validate
  publish:    # push to registry
    needs: build
  release:    # create GitHub Release
    needs: publish
```

### Key rules

- Use `on: push: tags: ['v*']` — not `on: release: published`.
- Gate every downstream job with `needs:` — never run publish in parallel with validation.
- Validate that the git tag matches the version field in code before building (see version-sync skill).
- Auto-generate release notes using `.github/release.yml` categories.
- Pass `github.ref_name` via `env:` — never interpolate it directly into shell scripts.

---

## Model B — Release Branch

### Overview

A stabilization branch is cut from `main`, patched as needed, and merged back after shipping.

### Procedure (ordered)

1. Create release branch (`release/vX.Y.Z`) from the latest default branch.
2. Align version metadata across release artifacts on the branch.
3. Push release branch and validate CI before publishing.
4. Apply any required patches directly to the release branch via PRs.
5. Create release/tag through the standard release channel once the branch is stable.
6. Validate workflow outputs and published artifacts.
7. Merge release branch back to default branch.

### Key rules

- Never publish from `main` directly — only from the release branch.
- Track open patches and cherry-picks in the release milestone.
- Ensure the merge-back step is completed before the next release cycle.

---

## Exit criteria (both models)

- Release tag and version metadata are consistent.
- Build/release workflows complete successfully with captured evidence.
- Artifacts are accessible and verifiable in the target registry.
- GitHub Release exists with accurate notes and attached checksums.
- Follow-up merge/sync step is completed or tracked (Model B only).
