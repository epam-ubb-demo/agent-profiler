---
description: Version-sync validation pattern for monorepos — ensure all package manifests match the git tag before publishing
license: MIT
---

# Version Sync

Use this skill when implementing pre-publish validation in a tag-based release pipeline to ensure that every package manifest version matches the git tag that triggered the release.

## Problem

In a monorepo, independent packages can drift out of sync: one package may have been bumped while another was forgotten. Publishing without a version check leaves the registry in an inconsistent state where the git tag does not accurately describe what was published.

## Validation Pattern

Before building or publishing any artifact:

1. Read the version field from every manifest file in scope.
2. Compare each version against the git tag (strip the leading `v`).
3. Fail the pipeline immediately if any version does not match.
4. Report which packages mismatched and what version was found vs. expected.

## Supported Manifest Formats

| Ecosystem | File | Version field |
|-----------|------|---------------|
| Node.js | `package.json` | `.version` |
| Python | `pyproject.toml` | `[project].version` or `[tool.poetry.dependencies].version` |
| Rust | `Cargo.toml` | `[package].version` |
| .NET | `*.csproj` | `<Version>` element |

## Reference Validation Script

Copy and adapt this shell script as a step in the `validate` job. It supports `package.json`, `pyproject.toml`, and `Cargo.toml`.

```bash
#!/usr/bin/env bash
# version-sync.sh
# Usage: VERSION_TAG=v1.2.3 PACKAGES="packages/rag packages/mcp" ./version-sync.sh
set -euo pipefail

# Strip leading 'v' from the tag
EXPECTED="${VERSION_TAG#v}"
FAILED=0

for PKG in $PACKAGES; do
  if [ -f "$PKG/package.json" ]; then
    ACTUAL=$(node -p "require('./$PKG/package.json').version")
    FILE="$PKG/package.json"
  elif [ -f "$PKG/pyproject.toml" ]; then
    # Extract version from [project] or [tool.poetry] sections; handles both quote styles
    ACTUAL=$(python3 -c "
import sys
try:
    import tomllib
except ImportError:
    import tomli as tomllib
with open('$PKG/pyproject.toml', 'rb') as f:
    data = tomllib.load(f)
v = data.get('project', {}).get('version') or data.get('tool', {}).get('poetry', {}).get('version', '')
print(v)
sys.exit(0 if v else 1)
")
    FILE="$PKG/pyproject.toml"
  elif [ -f "$PKG/Cargo.toml" ]; then
    # Extract version from the [package] section only, not workspace-level fields
    ACTUAL=$(python3 -c "
import sys
try:
    import tomllib
except ImportError:
    import tomli as tomllib
with open('$PKG/Cargo.toml', 'rb') as f:
    data = tomllib.load(f)
v = data.get('package', {}).get('version', '')
print(v)
sys.exit(0 if v else 1)
")
    FILE="$PKG/Cargo.toml"
  else
    echo "ERROR: No supported manifest found in $PKG" >&2
    FAILED=1
    continue
  fi

  if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "MISMATCH: $FILE has version '$ACTUAL', expected '$EXPECTED'" >&2
    FAILED=1
  else
    echo "OK: $FILE matches tag ($ACTUAL)"
  fi
done

exit $FAILED
```

### GitHub Actions step (Node.js monorepo example)

```yaml
- name: Verify version sync
  env:
    VERSION_TAG: ${{ github.ref_name }}
    PACKAGES: "packages/rag packages/mcp"
  run: bash scripts/version-sync.sh
```

> **Security note**: Always pass `github.ref_name` via an `env:` block — never interpolate it directly into the shell script with `${{ }}`. Interpolating user-controlled values into shell commands allows command injection if a crafted tag name contains shell metacharacters. Using `env:` treats the value as data, not executable code.

## Exit criteria

- All manifests report the same version as the git tag.
- The validate job fails immediately (non-zero exit) if any mismatch is detected.
- The mismatch report identifies exactly which file and which version was found.

## When to skip

Skip version-sync only when the repository uses a single manifest at the root and the tag is the only version source (i.e., version is not stored in any file). Document the exception in the pipeline.
