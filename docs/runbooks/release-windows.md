# Windows Release Runbook

## Prerequisites

- **Code Signing Certificate** — an EV or standard code signing certificate from a trusted CA (e.g., DigiCert, Sectigo, GlobalSign).
- Certificate exported as `.p12` / `.pfx` format with private key.

## GitHub Secrets to Configure

| Secret | Description |
|--------|-------------|
| `WIN_CERT_P12` | Base64-encoded `.p12` / `.pfx` certificate |
| `WIN_CERT_PASSWORD` | Password for the certificate file |

### Encoding the certificate

```powershell
# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Set-Content cert-base64.txt
```

```bash
# Bash
base64 -i certificate.pfx -o cert-base64.txt
```

Configure in **Settings → Secrets and variables → Actions** in the GitHub repository.

## Triggering the Release

1. Go to **Actions** → **Release** workflow.
2. Click **Run workflow**.
3. Select **windows** (or **all**) as the platform.
4. Wait for the build to complete (~8-12 min).
5. Download the `.exe` artifact from the completed run.

## Verifying the Installer

1. Download the NSIS `.exe` installer artifact.
2. Right-click the `.exe` → **Properties** → **Digital Signatures** tab.
   - Verify the signature is valid and shows your organisation name.
3. Run the installer:
   - Confirm UAC prompt shows the correct publisher name.
   - Verify installation completes, desktop/start-menu shortcuts are created.
   - Launch the app and confirm it starts correctly.
4. Test uninstall via **Settings → Apps** or Control Panel.

## Unsigned Builds

When `CSC_LINK` and `CSC_KEY_PASSWORD` are not set, electron-builder skips code signing. The resulting installer will trigger Windows SmartScreen warnings.

For local testing:

```bash
pnpm --filter @agent-profiler/desktop run build
pnpm --filter @agent-profiler/desktop run dist:win
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| SmartScreen blocks installer | Certificate not trusted or EV cert required; sign with valid cert |
| `signtool` not found | Ensure Windows SDK is installed on the runner |
| Invalid certificate password | Verify `WIN_CERT_PASSWORD` matches the `.p12` export password |
| Build fails on macOS/Linux | Windows NSIS target can only be built on Windows runners |
| Installer too large | Check `files` glob in electron-builder config; exclude dev dependencies |
