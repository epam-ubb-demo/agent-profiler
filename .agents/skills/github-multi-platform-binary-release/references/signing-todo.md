# Code signing & notarisation -- TODO pointers

Load this reference only when the user asks about code signing, notarisation,
SmartScreen warnings, Gatekeeper rejection, or Apple Developer ID.

This skill **does not** scaffold signing. Signing requires secrets, identities,
and per-platform tooling that vary by organisation. The notes below point the
consumer to the canonical workflows; treat them as starting points, not
prescriptions.

## macOS -- codesign + notarytool

Required artefacts:

- An Apple Developer ID Application certificate exported as `.p12` and stored
  as `MACOS_CERT_P12` (base64) + `MACOS_CERT_PASSWORD` GitHub secrets.
- An app-specific password or notarytool API key in
  `MACOS_NOTARY_USER` / `MACOS_NOTARY_PASSWORD` / `MACOS_NOTARY_TEAM_ID`
  (or `MACOS_NOTARY_KEY_ID` / `MACOS_NOTARY_KEY` / `MACOS_NOTARY_ISSUER_ID`).

Workflow additions (sketch -- adapt for the consumer's actual binary layout):

```yaml
- name: Import signing certificate
  if: runner.os == 'macOS'
  run: |
    echo "$MACOS_CERT_P12" | base64 --decode > cert.p12
    security create-keychain -p actions build.keychain
    security import cert.p12 -k build.keychain -P "$MACOS_CERT_PASSWORD" \
      -T /usr/bin/codesign
    security list-keychains -s build.keychain
    security unlock-keychain -p actions build.keychain

- name: Sign binary
  if: runner.os == 'macOS'
  run: codesign --force --options runtime --sign "Developer ID Application" path/to/binary

- name: Notarise
  if: runner.os == 'macOS'
  run: |
    xcrun notarytool submit dist/archive.zip --wait \
      --apple-id "$MACOS_NOTARY_USER" \
      --password "$MACOS_NOTARY_PASSWORD" \
      --team-id "$MACOS_NOTARY_TEAM_ID"
    xcrun stapler staple path/to/binary
```

Canonical reference:
<https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution>

## Windows -- Authenticode

Two paths:

1. **EV / OV certificate from a CA.** Store the certificate as
   `WINDOWS_CERT_PFX` (base64) + `WINDOWS_CERT_PASSWORD`; sign with
   `signtool sign /f cert.pfx /p "$pwd" /tr http://timestamp.digicert.com /td sha256 /fd sha256 binary.exe`.
2. **Azure Trusted Signing** (no cert handling): use
   `azure/trusted-signing-action@v0` which signs via Azure-managed identities.

Without signing, Windows users hit SmartScreen warnings ("Windows protected
your PC"). Document this in the consumer's README if they choose to ship
unsigned.

Canonical reference:
<https://learn.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools>

## Linux -- checksums + GPG signing of the manifest

Linux distributions don't enforce signing the way macOS / Windows do, but
shipping a GPG-signed checksum manifest is the convention for downstream
package maintainers. Add a step that runs after the artefacts are uploaded:

```yaml
- name: Sign checksums
  if: github.ref_type == 'tag'
  env:
    GPG_PRIVATE_KEY: ${{ secrets.GPG_PRIVATE_KEY }}
    GPG_PASSPHRASE:  ${{ secrets.GPG_PASSPHRASE }}
  run: |
    echo "$GPG_PRIVATE_KEY" | gpg --batch --import
    cat *.sha256 > checksums.txt
    echo "$GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
      --detach-sign --armor checksums.txt
```

Upload `checksums.txt` and `checksums.txt.asc` alongside the binaries.

## Out of scope for this skill

If the consumer needs signing wired in, treat that as a follow-up task:

1. Provision certificates / identities outside the repo.
2. Add secrets to the repository or organisation.
3. Layer the signing steps onto the workflow this skill scaffolded.

Do not embed signing into the base template -- it adds secrets that most
consumers don't have, and silent failure modes when secrets are missing.
