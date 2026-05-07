# Code Signing & Update Manifest Verification

This document explains how Agent Profiler releases are signed and how
`electron-updater` verifies update integrity before installation.

## Overview

Electron-builder produces **signed installers** and **signed update manifests**
(`latest.yml` / `latest-mac.yml` / `latest-linux.yml`). When the app checks for
updates, `electron-updater` downloads the manifest, verifies its signature, and
only then downloads the binary.

## How Signing Works

### macOS

1. **Code Signing** — The `.app` bundle is signed with an Apple Developer ID
   certificate (`Developer ID Application: …`).
2. **Notarisation** — The signed `.dmg` is uploaded to Apple's notary service
   which staples a ticket confirming the binary is malware-free.
3. **Hardened Runtime** — Enabled via `hardenedRuntime: true` in
   `electron-builder.config.ts`, required for notarisation.

**Environment variables** (CI secrets):
| Variable | Description |
|----------|-------------|
| `CSC_LINK` | Base64 or path to `.p12` certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | Apple ID email for notarisation |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-char team ID |

### Windows

1. **Authenticode Signing** — The `.exe` / `.nsis` installer is signed with an
   EV or standard code-signing certificate using `signtool`.
2. **SHA-256 digest** — `signingHashAlgorithms: ['sha256']` ensures modern
   digest is used.

**Environment variables** (CI secrets):
| Variable | Description |
|----------|-------------|
| `CSC_LINK` | Base64 or path to `.pfx` certificate |
| `CSC_KEY_PASSWORD` | Password for the `.pfx` |

### Linux

Linux does not have a platform-level code signing mechanism equivalent to macOS
or Windows. Integrity is verified via the SHA-512 checksum in the update manifest.

## Update Manifest Verification

When `electron-updater` checks for updates it:

1. Downloads `latest-{platform}.yml` from the GitHub release.
2. Verifies the **SHA-512 hash** of the binary listed in the manifest matches
   the downloaded binary.
3. On macOS/Windows, the OS also verifies the code signature of the binary
   before execution.

### Manifest structure (`latest.yml` example)

```yaml
version: 1.2.3
files:
  - url: Agent-Profiler-Setup-1.2.3.exe
    sha512: <base64-encoded-sha512>
    size: 98765432
path: Agent-Profiler-Setup-1.2.3.exe
sha512: <base64-encoded-sha512>
releaseDate: '2025-07-01T12:00:00.000Z'
```

## Development Mode (Unsigned)

When building locally without certificates (`CSC_LINK` absent):

- electron-builder produces **unsigned** binaries.
- `electron-updater` still works for _checking_ updates but the OS may warn
  users about unsigned software.
- The `AppUpdater` class gracefully disables itself when `app.isPackaged` is
  `false`, preventing errors in development.

## Generating a Self-Signed Certificate (Testing Only)

```bash
# macOS — create a self-signed cert for local testing
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
openssl pkcs12 -export -out dev-cert.p12 -inkey key.pem -in cert.pem

# Set env vars
export CSC_LINK="$(pwd)/dev-cert.p12"
export CSC_KEY_PASSWORD=""
```

> ⚠️  Self-signed certificates will trigger OS security warnings. Never use in
> production — they are for local build testing only.

## References

- [electron-builder Code Signing docs](https://www.electron.build/code-signing)
- [electron-updater Auto Update docs](https://www.electron.build/auto-update)
- [Apple Notarisation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
