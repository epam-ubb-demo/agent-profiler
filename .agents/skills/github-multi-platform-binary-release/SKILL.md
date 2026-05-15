---
description: Use this skill when a GitHub repository needs to publish pre-built executables to GitHub Releases across operating systems and CPU architectures -- for example shipping a CLI, an Electron desktop app, a Rust/Go binary, or any tool that users install via `curl ... | sh` or PowerShell. Activate whenever the user mentions building binaries on a matrix, tag-triggered releases with `.tar.gz` / `.zip` artefacts, sha256 checksums, prerelease detection from semver tags, install scripts that fetch the matching asset for the host OS, or a release flow inspired by `microsoft/apm`. Also trigger when the user references repositories such as `agent-profiler` or `copilot-token-benchmark` and asks how to ship their binary. Do NOT use this skill for publishing to package registries (npm / PyPI / Docker / NuGet) -- use `github-setup-tag-release` for those.
licence: MIT
---

# GitHub Multi-Platform Binary Release

Scaffold a tag-triggered, multi-OS / multi-arch binary release pipeline into a GitHub repository. The pipeline builds binaries on a matrix (Linux x86_64/arm64, macOS Intel/Apple Silicon, Windows x86_64), archives them as `.tar.gz` / `.zip` with sha256 sidecars, auto-detects prerelease from the semver tag, and creates a GitHub Release with all assets attached. Companion `install.sh` and `install.ps1` bootstrappers detect OS/arch, fetch the matching asset, verify the checksum, and install the binary onto the user's `$PATH`.

**Boundary.** This skill does NOT publish to package registries (npm / PyPI / Docker / NuGet) -- use `github-setup-tag-release` for that. It does NOT prescribe how to build the binary; the consumer supplies per-OS build commands. It does NOT handle code signing or notarisation; see `references/signing-todo.md` for pointers.

**See also:**
- `github-setup-tag-release` (sibling) -- registry publishing with version-sync.
- `ci-investigation` -- when the resulting workflow fails, load this skill to diagnose.

---

## Phase 1 -- Probe the consumer repository

Before asking the user anything, **probe the repository** to inform the parameter conversation. Do not skip this -- file existence is a fact-that-must-be-true, not LLM recall.

Use `view` / `glob` to check:

1. **Existing release workflows.** `.github/workflows/*.yml` -- is `build-release.yml` already present? If yes, surface the overlap to the user before overwriting.
2. **Existing install scripts.** `install.sh`, `install.ps1` at repo root -- same question.
3. **Existing release-notes config.** `.github/release.yml`.
4. **Build tooling hints.** `package.json` (npm scripts), `Cargo.toml`, `go.mod`, `pyproject.toml`, `electron-builder.yml`, `forge.config.js` -- to inform the per-OS build-command question.

Report findings to the user before proceeding.

---

## Phase 2 -- Collect parameters

Ask the user for all parameters in a single interaction:

1. **Binary name** (`<binary-name>`) -- the executable name that ends up on `$PATH` (e.g. `agent-profiler`, `copilot-token-benchmark`). Lowercase, hyphens allowed.
2. **Repository slug** (`<owner>/<repo>`) -- defaults to the current git remote (`git remote get-url origin`).
3. **OS / arch matrix subset.** Default = full matrix (`linux-x86_64`, `linux-arm64`, `darwin-x86_64`, `darwin-arm64`, `windows-x86_64`). Allow the user to subset (e.g. drop arm64 if they cannot test it).
4. **Per-OS build command.** Ask for the shell command that produces a single binary at a known path on each target. Suggested defaults based on the build-tooling hints from Phase 1:
   - Node.js / Electron -> `npm run build && npm run package:<os>` (electron-builder / pkg)
   - Rust -> `cargo build --release --target <triple>`
   - Go -> `GOOS=<os> GOARCH=<arch> go build -o <binary>`
   - Python (PyInstaller) -> `pyinstaller --onefile <entry>.py`
5. **Output path per OS.** Where the build command leaves the binary (e.g. `dist/<binary-name>` on Unix, `dist\<binary-name>.exe` on Windows).
6. **Default install directory.** For `install.sh` -- typically `/usr/local/bin`. For `install.ps1` -- typically `$env:LOCALAPPDATA\Programs\<binary-name>`.
7. **Smoke-test command.** A one-line invocation that proves the binary works (e.g. `<binary-name> --version`). Used by the `release-validation` job before the release is published.

Confirm all parameters before writing files. See `references/parameter-matrix.md` for the full OS/runner/arch/asset-naming table.

---

## Phase 3 -- Human checkpoint

Display a summary of the planned file writes:

```
===============================================
  MULTI-PLATFORM BINARY RELEASE -- REVIEW
================================================
Files to be written into <repo>:
  * .github/workflows/build-release.yml   (matrix build -> release)
  * .github/release.yml                   (PR category mapping)
  * install.sh                            (POSIX bootstrapper)
  * install.ps1                           (PowerShell bootstrapper)
  * README installer snippet              (curl + PowerShell one-liners)

Configuration:
  * Binary name:        <binary-name>
  * OS / arch matrix:   <subset>
  * Build commands:     <per-OS summary>
  * Smoke test:         <command>

Out of scope (you must handle separately):
  * Code signing / notarisation (see references/signing-todo.md)
  * Registry publishing (use github-setup-tag-release)

Proceed? (yes / no / adjust)
================================================
```

Only continue if the user answers "yes".

---

## Phase 4 -- Write workflow files

Each write step below is wrapped in A9 SUPERVISED EXECUTION: write -> re-`view` -> confirm the file landed with the expected substitutions before moving on.

### 4a. `.github/workflows/build-release.yml`

Load `assets/workflows/build-release.yml.template`. Substitute the placeholders:

| Placeholder | Replacement |
|---|---|
| `{{BINARY_NAME}}` | the binary name |
| `{{BUILD_CMD_LINUX}}` | the Linux build command |
| `{{BUILD_CMD_MACOS}}` | the macOS build command |
| `{{BUILD_CMD_WINDOWS}}` | the Windows build command (pwsh) |
| `{{BINARY_PATH_UNIX}}` | output path on Unix |
| `{{BINARY_PATH_WINDOWS}}` | output path on Windows |
| `{{SMOKE_TEST}}` | smoke-test command |
| `{{MATRIX_SUBSET}}` | if the user dropped any OS/arch, prune the matrix entries |

Write the file. Then re-`view` it and confirm:
- All `{{...}}` placeholders are gone.
- `permissions: contents: read` is at the top.
- The `create-release` job has `permissions: contents: write`.
- The trigger includes `push: tags: ['v*']`.

### 4b. `.github/release.yml`

Load `assets/workflows/release.yml.template`. No substitution needed; write as-is. Re-`view` to confirm the four categories (Breaking, Features, Fixes, Maintenance) are present.

---

## Phase 5 -- Write install scripts

### 5a. `install.sh`

Load `assets/scripts/install.sh.template`. Substitute:

| Placeholder | Replacement |
|---|---|
| `{{BINARY_NAME}}` | the binary name |
| `{{REPO}}` | the `<owner>/<repo>` slug |
| `{{DEFAULT_INSTALL_DIR}}` | default install dir (Unix) |

Write to repo root as `install.sh`. Run `chmod +x install.sh` if filesystem permissions are writable; otherwise note this in the operator checklist.

Re-`view` to confirm:
- Shebang `#!/bin/bash` (or `#!/usr/bin/env bash`).
- `set -e` near the top.
- Env-var contract present: `VERSION`, `INSTALL_DIR`, `REPO`, `GITHUB_URL`.
- OS/arch detection via `uname -s` and `uname -m`.
- sha256 verification step before extracting the archive.

### 5b. `install.ps1`

Load `assets/scripts/install.ps1.template`. Substitute the same placeholders. Write to repo root.

Re-`view` to confirm:
- `$ErrorActionPreference = 'Stop'`.
- Env-var contract: `$env:VERSION`, `$env:INSTALL_DIR`, `$env:REPO`, `$env:GITHUB_URL`.
- Architecture detect via `$env:PROCESSOR_ARCHITECTURE`.
- sha256 verification via `Get-FileHash -Algorithm SHA256`.

---

## Phase 6 -- README installer snippet

Generate and append (or print for the user to paste) the following block to the repository's `README.md` under an "Installation" heading:

````markdown
## Installation

### macOS / Linux

```bash
curl -sSL https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh | bash
```

Pin a specific version:

```bash
curl -sSL https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh | VERSION=v1.2.3 bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/<owner>/<repo>/main/install.ps1 | iex
```

### Manual

Download the matching asset from the [latest release](https://github.com/<owner>/<repo>/releases/latest), verify the `.sha256` sidecar, extract, and place the binary on your `$PATH`.
````

Substitute `<owner>/<repo>` with the actual slug.

---

## Phase 7 -- Operator-action checklist

Print this checklist for the user. These are the steps the skill cannot do for them:

```
================================================
  OPERATOR ACTIONS -- DO THIS BEFORE FIRST RELEASE
================================================
1. Commit and push the new files to your default branch.
2. Confirm GitHub Actions is enabled for this repository
   (Settings -> Actions -> General -> "Allow all actions").
3. If the repo is private, confirm `GITHUB_TOKEN` has write
   access to releases (Settings -> Actions -> General ->
   "Workflow permissions" -> "Read and write permissions").
4. Make `install.sh` executable in the repo if your platform
   did not preserve the bit:
       git update-index --chmod=+x install.sh
       git commit -m "make install.sh executable"
5. Tag and push your first release:
       git tag v0.0.1
       git push origin v0.0.1
   Watch the workflow at Actions -> "Build and Release".
6. After the release is published, test the installers from
   a clean environment.

If the workflow fails, load the `ci-investigation` skill to
diagnose. Common pitfalls:
- Build command failed on a specific OS -- fix and re-tag.
- Smoke test failed -- the binary built but does not run on
  that OS (likely a dynamic-link / glibc issue).
- sha256 mismatch -- archive step skipped a file; re-check
  the artefact upload paths.

Code signing / notarisation is OUT OF SCOPE for this skill.
See `references/signing-todo.md` for pointers when you reach
that maturity stage.
================================================
```

---

## Bundled assets

The following files ship inside this skill's `assets/` directory and are loaded by Phases 4-5:

- `assets/workflows/build-release.yml.template` -- matrix build + create-release job (modelled on `microsoft/apm`).
- `assets/workflows/release.yml.template` -- PR category mapping for `softprops/action-gh-release@v2 generate_release_notes: true`.
- `assets/scripts/install.sh.template` -- POSIX bootstrapper, env-var contract.
- `assets/scripts/install.ps1.template` -- PowerShell counterpart.

The following references load on demand:

- `references/parameter-matrix.md` -- load when the user wants the full OS/runner/arch/asset-naming table or asks how to add a new target.
- `references/signing-todo.md` -- load when the user asks about code signing or notarisation.

---

## Re-running this skill

This skill is idempotent on the file-content level but **not** on operator-side state (tags, branch protection, secrets). If you re-run it:

1. Phase 1 will surface that the workflow already exists.
2. Ask the user whether to **overwrite** or **diff-and-merge** -- never silently overwrite.
3. Re-running Phase 6 will produce duplicate README sections unless the user removes the old block first; flag this in the human checkpoint.
