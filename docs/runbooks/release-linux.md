# Linux Release Runbook

## Prerequisites

- No code signing certificate required for Linux packages.
- The build runs on `ubuntu-latest` in GitHub Actions.

## Triggering the Release

1. Go to **Actions** → **Release** workflow.
2. Click **Run workflow**.
3. Select **linux** (or **all**) as the platform.
4. Wait for the build to complete (~5-10 min).
5. Download the artifacts:
   - `*.AppImage` — portable, runs on most Linux distros
   - `*.deb` — Debian/Ubuntu package

## Verifying the AppImage

```bash
# Make executable
chmod +x Agent-Profiler-*.AppImage

# Run directly
./Agent-Profiler-*.AppImage

# Or extract to inspect contents
./Agent-Profiler-*.AppImage --appimage-extract
ls squashfs-root/
```

### AppImage requirements

- FUSE must be available on the host system (most distros include it).
- If FUSE is missing: `sudo apt install fuse libfuse2`

## Verifying the .deb Package

```bash
# Inspect package metadata
dpkg-deb --info agent-profiler_*.deb

# Install
sudo dpkg -i agent-profiler_*.deb

# Or with dependency resolution
sudo apt install ./agent-profiler_*.deb

# Launch
agent-profiler

# Uninstall
sudo apt remove agent-profiler
```

## Testing on Ubuntu

For local testing on an Ubuntu machine or VM:

```bash
pnpm --filter @agent-profiler/desktop run build
pnpm --filter @agent-profiler/desktop run dist:linux
```

Outputs appear in `apps/desktop/dist-release/`.

### Docker-based testing (optional)

```bash
# Build in a clean Ubuntu environment
docker run --rm -v $(pwd):/workspace -w /workspace node:20 bash -c "
  corepack enable && pnpm install --frozen-lockfile &&
  pnpm --filter @agent-profiler/desktop run build &&
  pnpm --filter @agent-profiler/desktop run dist:linux
"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| AppImage won't start | Check FUSE: `sudo apt install libfuse2` |
| `.deb` dependency errors | Use `apt install ./file.deb` instead of `dpkg -i` |
| Sandbox errors | Try `--no-sandbox` flag or fix user namespaces: `sysctl kernel.unprivileged_userns_clone=1` |
| Icon not showing | Ensure `build/icon.png` exists and is ≥ 512x512 |
| Build fails on macOS | Linux targets can only be built on Linux runners (or Docker) |
