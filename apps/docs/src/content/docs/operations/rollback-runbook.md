---
title: Rollback Runbook
description: Emergency procedures for rolling back a bad release of Agent Profiler.
---

## Overview

This runbook covers how to recover from a bad release of the Agent Profiler
desktop application. Since we use `electron-updater` with GitHub Releases as the
update provider, rollback involves publishing a new release that supersedes the
broken one.

## Decision Matrix

| Situation | Action |
|-----------|--------|
| Bug found before users auto-update | [Revoke the release](#revoke-a-bad-release) |
| Bug found after some users updated | [Publish a fix release](#publish-a-fix-release) |
| Critical security issue | [Emergency rollback](#emergency-procedures) |
| User wants to manually downgrade | [Manual rollback](#manual-rollback-per-user) |

---

## Revoke a Bad Release

If the broken release has not yet been widely distributed:

1. **Mark the GitHub Release as pre-release** — this hides it from
   `electron-updater` (which ignores pre-releases by default):

   ```bash
   gh release edit @agent-profiler/desktop@X.Y.Z --prerelease
   ```

2. **Delete the release entirely** (optional, more aggressive):

   ```bash
   gh release delete @agent-profiler/desktop@X.Y.Z --yes
   git push --delete origin @agent-profiler/desktop@X.Y.Z
   ```

3. **Verify** — Run the app and trigger "Check for Updates". It should report
   "No updates available" or find the previous good version.

---

## Publish a Fix Release

The safest approach — increment the version and ship a corrected build:

1. **Create a hotfix branch** from the broken release tag:

   ```bash
   git checkout -b hotfix/X.Y.Z+1 @agent-profiler/desktop@X.Y.Z
   ```

2. **Apply the fix**, run tests, get review.

3. **Bump the version** in `apps/desktop/package.json`:

   ```bash
   cd apps/desktop
   pnpm version patch  # e.g., 1.2.4
   ```

4. **Merge to `main`** and push the tag:

   ```bash
   git tag @agent-profiler/desktop@X.Y.Z+1
   git push origin main --tags
   ```

5. **Trigger the release workflow** or wait for the tag-triggered workflow.

6. **Verify** — Users on the broken version will auto-update to the fix.

---

## Emergency Procedures

For critical security vulnerabilities:

### Step 1: Immediately revoke

```bash
# Hide the release so no new users receive it
gh release edit @agent-profiler/desktop@X.Y.Z --prerelease
```

### Step 2: Communicate

- Post in `#agent-profiler-ops` Slack channel.
- Create a GitHub Security Advisory (if applicable).
- Notify affected users via in-app notification (if possible).

### Step 3: Ship the fix

Follow [Publish a Fix Release](#publish-a-fix-release) with highest priority.

### Step 4: Post-mortem

Document:
- What went wrong
- How it was detected
- Timeline of response
- Preventive measures

---

## Manual Rollback (Per-User)

If a user needs to immediately revert to a previous version:

### macOS

1. Quit Agent Profiler.
2. Download the previous `.dmg` from
   [GitHub Releases](https://github.com/epam-ubb-demo/agent-profiler/releases).
3. Drag-install over the existing app in `/Applications`.

### Windows

1. Uninstall Agent Profiler from Settings → Apps.
2. Download the previous `.exe` installer from GitHub Releases.
3. Install.

### Linux (AppImage)

1. Delete the current AppImage.
2. Download the previous version from GitHub Releases.
3. `chmod +x` and run.

### Prevent auto-update from re-applying the bad version

Until the bad release is revoked, users can use **"Skip this version"** in the
update notification to prevent re-updating. Alternatively, set the environment
variable:

```bash
export ELECTRON_UPDATER_SKIP=true
```

---

## Preventing Bad Releases

- **Staged rollouts** — Consider using `electron-updater`'s staged rollout
  feature (`stagingPercentage` in `latest.yml`) to limit exposure.
- **Smoke tests** — The release workflow should include automated smoke tests
  before publishing.
- **Canary channel** — Use `allowPrerelease: true` for internal testers before
  promoting to stable.
- **Monitoring** — Track crash reports and error rates after each release.

---

## Useful Commands Reference

```bash
# List all releases
gh release list --repo epam-ubb-demo/agent-profiler

# View a specific release
gh release view @agent-profiler/desktop@X.Y.Z

# Download release assets
gh release download @agent-profiler/desktop@X.Y.Z --dir ./rollback-assets

# Check current app version (when running)
# Menu → Help → About Agent Profiler
```
