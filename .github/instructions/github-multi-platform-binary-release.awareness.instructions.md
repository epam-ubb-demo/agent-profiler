---
description: Multi-OS / multi-arch binary release pipeline detected -- load github-multi-platform-binary-release skill to scaffold matrix workflow and install bootstrappers.
applyTo: "**"
---

# Multi-OS Binary Release

When a GitHub repository needs to publish pre-built executables to GitHub Releases across operating systems and CPU architectures -- CLIs, Electron apps, Rust/Go binaries, `install.sh` / `install.ps1` flows, anything modelled on the `microsoft/apm` release pipeline -- load the **github-multi-platform-binary-release** skill. For npm / PyPI / Docker / NuGet registry publishing, use **github-setup-tag-release** instead.
