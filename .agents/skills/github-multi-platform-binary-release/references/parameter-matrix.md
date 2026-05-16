# Parameter matrix -- OS / arch / runners / asset naming

Load this reference when you need the canonical mapping between target platforms,
GitHub-hosted runner labels, and the asset-naming convention emitted by
`build-release.yml.template`.

## Target matrix

| Target            | GitHub runner       | Archive | Asset name (`$BIN` = `{{BINARY_NAME}}`) |
|-------------------|---------------------|---------|------------------------------------------|
| Linux x86_64      | `ubuntu-24.04`      | tar.gz  | `$BIN-linux-x86_64.tar.gz`               |
| Linux arm64       | `ubuntu-24.04-arm`  | tar.gz  | `$BIN-linux-arm64.tar.gz`                |
| macOS Intel       | `macos-15-intel`    | tar.gz  | `$BIN-darwin-x86_64.tar.gz`              |
| macOS Apple Si.   | `macos-latest`      | tar.gz  | `$BIN-darwin-arm64.tar.gz`               |
| Windows x86_64    | `windows-latest`    | zip     | `$BIN-windows-x86_64.zip`                |
| Windows arm64*    | `windows-11-arm`    | zip     | `$BIN-windows-arm64.zip`                 |

\* Windows arm64 is optional -- drop the row if the consumer does not need it.

Each archive ships alongside a `<asset>.sha256` sidecar produced by `sha256sum`
on Linux/macOS and `Get-FileHash -Algorithm SHA256` on Windows.

## Workflow placeholders

The `build-release.yml.template` exposes these placeholders. Replace before
committing the workflow into the consumer repo.

| Placeholder            | Meaning                                              |
|------------------------|------------------------------------------------------|
| `{{BINARY_NAME}}`      | Asset stem, matches the installer's `BINARY_NAME`.   |
| `{{BUILD_CMD_LINUX}}`  | Shell command that produces the Linux binary.        |
| `{{BUILD_CMD_MACOS}}`  | Shell command that produces the macOS binary.        |
| `{{BUILD_CMD_WINDOWS}}`| PowerShell command that produces the Windows binary. |
| `{{SMOKE_TEST}}`       | Command (e.g. `./$BIN --version`) for `release-validation`. |
| `{{MATRIX_SUBSET}}`    | Optional include/exclude rules to trim the matrix.   |

## Installer placeholders

The `install.sh.template` and `install.ps1.template` expose:

| Placeholder              | Meaning                                                  |
|--------------------------|----------------------------------------------------------|
| `{{BINARY_NAME}}`        | Same stem the workflow emits.                            |
| `{{REPO}}`               | `owner/repo` slug for GitHub Releases API + downloads.   |
| `{{DEFAULT_INSTALL_DIR}}`| Default destination (`$HOME/.local/bin`, `$env:USERPROFILE\bin`, etc.). |

## Tag -> prerelease detection

`build-release.yml.template` flags a release as **prerelease** unless the tag
matches the stable regex `^v[0-9]+\.[0-9]+\.[0-9]+$`. PEP 440 prerelease tags
(`v1.2.3a1`, `v1.2.3b2`, `v1.2.3rc1`) are explicitly recognised as prereleases.
Anything else (e.g. `v1.2.3-alpha`) is also treated as prerelease.

## Choosing a subset

Most consumers do not need all six targets. The probe phase of the skill asks
the user; common subsets:

- **CLI tools (Linux/macOS only):** drop Windows + Windows arm64.
- **Electron desktop apps:** keep Linux x86_64, both macOS targets, Windows x86_64.
- **Server-side tooling:** Linux x86_64 + Linux arm64 are usually enough.

Use `{{MATRIX_SUBSET}}` to exclude unused entries instead of editing the
matrix block by hand -- preserves the structure for later additions.
