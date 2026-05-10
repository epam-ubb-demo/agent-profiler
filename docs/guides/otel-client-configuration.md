# OTel Gateway — Client Configuration Guide

This guide explains how to configure GitHub Copilot CLI clients to send
telemetry to the OTel Gateway. It covers environment variables, VS Code
settings, shell configuration, enterprise deployment, verification, and
troubleshooting.

---

## 1. Environment Endpoints

| Environment | Endpoint URL | Access |
|---|---|---|
| Dev | `https://otel-gateway-dev.internal.corp.example.com:4318` | VNet-only (VPN required) |
| Demo | `https://otel-gateway-demo.corp.example.com:4318` | Public with IP allowlist |
| Prod | `https://otel-gateway.corp.example.com:4318` | Private via Application Gateway (VPN/ExpressRoute) |

> **Note:** Replace `corp.example.com` with your organisation's actual domain.

---

## 2. Copilot CLI Environment Variables

Two environment variables control telemetry export from the Copilot CLI:

```bash
# Required: Enable OTel telemetry export
export COPILOT_OTEL_ENABLED=true

# Required: Point to the OTel Gateway OTLP/HTTP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-gateway.corp.example.com:4318
```

| Variable | Purpose |
|---|---|
| `COPILOT_OTEL_ENABLED` | Activates the built-in OpenTelemetry instrumentation inside the Copilot CLI. When set to `true`, the CLI emits traces, metrics, and logs via OTLP. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Specifies the base URL of the OTLP/HTTP collector that receives telemetry. The CLI appends signal-specific paths (e.g. `/v1/traces`, `/v1/metrics`) automatically. |

---

## 3. VS Code Policy Settings

VS Code can be configured to send Copilot telemetry to the OTel Gateway
independently of shell environment variables:

```json
{
  "github.copilot.chat.otel.otlpEndpoint": "https://otel-gateway.corp.example.com:4318"
}
```

This setting can be applied at three levels:

- **User settings** (`settings.json`) — applies to all workspaces for the
  current user. Open with **Ctrl+Shift+P → Preferences: Open User Settings (JSON)**.
- **Workspace settings** (`.vscode/settings.json`) — scoped to a single
  project. Commit this file to share the configuration with team members.
- **Organisation policy** — managed settings deployed via Microsoft Intune or
  Group Policy. These take precedence over user and workspace settings, ensuring
  consistent configuration across the organisation. See
  [Section 5](#5-enterprise-deployment) for details.

---

## 4. Shell Configuration Scripts

Add the following block to your shell's startup file so the variables are set
automatically in every new terminal session.

### Bash (`~/.bashrc` or `~/.bash_profile`)

```bash
# GitHub Copilot OTel Gateway configuration
export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel-gateway.corp.example.com:4318"
```

After editing, reload the configuration:

```bash
source ~/.bashrc
```

### Zsh (`~/.zshrc`)

```bash
# GitHub Copilot OTel Gateway configuration
export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel-gateway.corp.example.com:4318"
```

After editing, reload the configuration:

```bash
source ~/.zshrc
```

### PowerShell (`$PROFILE`)

```powershell
# GitHub Copilot OTel Gateway configuration
$env:COPILOT_OTEL_ENABLED = "true"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel-gateway.corp.example.com:4318"
```

To find and open your profile file:

```powershell
notepad $PROFILE
```

After editing, reload the profile in the current session:

```powershell
. $PROFILE
```

### Fish (`~/.config/fish/config.fish`)

```fish
# GitHub Copilot OTel Gateway configuration
set -gx COPILOT_OTEL_ENABLED true
set -gx OTEL_EXPORTER_OTLP_ENDPOINT "https://otel-gateway.corp.example.com:4318"
```

After editing, reload the configuration:

```fish
source ~/.config/fish/config.fish
```

---

## 5. Enterprise Deployment

For organisations managing large fleets of developer workstations, the
environment variables and VS Code settings can be deployed centrally.

### Microsoft Intune

Use a custom configuration profile to deploy a PowerShell script that sets the
environment variables at the machine level:

```powershell
# intune-otel-env.ps1 — deploy via Intune Scripts
[System.Environment]::SetEnvironmentVariable(
    "COPILOT_OTEL_ENABLED", "true", "Machine")
[System.Environment]::SetEnvironmentVariable(
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "https://otel-gateway.corp.example.com:4318", "Machine")
```

Assign the script to a device group containing developer workstations.

### Group Policy (Windows)

1. Open **Group Policy Management Editor**.
2. Navigate to **Computer Configuration → Preferences → Windows Settings →
   Environment**.
3. Create two new environment variable entries:
   - `COPILOT_OTEL_ENABLED` = `true`
   - `OTEL_EXPORTER_OTLP_ENDPOINT` = `https://otel-gateway.corp.example.com:4318`
4. Set the action to **Create or Update** and link the GPO to the relevant OU.

Alternatively, deploy the variables via a **logon script** under
**User Configuration → Policies → Windows Settings → Scripts → Logon**.

### macOS MDM Profiles

Use a custom MDM profile that runs a shell script at login, or deploy a
`launchd` plist that sets the variables globally:

```bash
#!/bin/bash
# otel-env-setup.sh — deploy via MDM shell script payload
launchctl setenv COPILOT_OTEL_ENABLED true
launchctl setenv OTEL_EXPORTER_OTLP_ENDPOINT \
    "https://otel-gateway.corp.example.com:4318"
```

For persistence across reboots, create a `launchd` plist in
`/Library/LaunchAgents/` that invokes this script.

### VS Code Managed Settings

VS Code settings can be enforced via a `policies.json` file:

- **Windows:** `%ProgramFiles%\Microsoft VS Code\resources\app\policies\policies.json`
- **macOS:** `/Applications/Visual Studio Code.app/Contents/Resources/app/policies/policies.json`

```json
{
  "github.copilot.chat.otel.otlpEndpoint": "https://otel-gateway.corp.example.com:4318"
}
```

Deploy this file through your MDM or software distribution tool. Managed
settings appear as read-only in the VS Code UI, preventing users from
overriding them.

---

## 6. Verification Steps

Follow these steps to confirm that telemetry is flowing from your Copilot CLI
to the OTel Gateway.

### Step 1 — Check Environment Variables Are Set

```bash
echo $COPILOT_OTEL_ENABLED
echo $OTEL_EXPORTER_OTLP_ENDPOINT
```

Expected output:

```
true
https://otel-gateway.corp.example.com:4318
```

On PowerShell:

```powershell
$env:COPILOT_OTEL_ENABLED
$env:OTEL_EXPORTER_OTLP_ENDPOINT
```

### Step 2 — Test Endpoint Connectivity

```bash
curl -v https://otel-gateway.corp.example.com:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 5
```

- **HTTP 200** or **HTTP 400** — the endpoint is reachable and the OTel
  Collector is responding. A 400 simply means the empty payload was rejected as
  invalid OTLP, which is expected.
- **Connection refused / timeout** — see [Troubleshooting](#7-troubleshooting).

### Step 3 — Run a Copilot CLI Session

Start a Copilot session, ask a question, and wait 1–2 minutes for the
telemetry pipeline to flush data through the Collector into Application
Insights.

```bash
# Start a Copilot session, ask a question, then check App Insights
# Within 1-2 minutes, data should appear in the requests table
```

### Step 4 — Verify in Application Insights

Open the **Logs** blade in your Application Insights resource and run the
following KQL query:

```kql
requests
| where timestamp > ago(5m)
| where name == "invoke_agent"
| project timestamp, name, duration, success
| order by timestamp desc
| take 10
```

If rows appear, telemetry is flowing end-to-end.

---

## 7. Troubleshooting

### Connection Refused

| | |
|---|---|
| **Symptoms** | `ECONNREFUSED` or `connection refused` in Copilot CLI output. |
| **Causes** | Firewall blocking port 4318; VPN not connected; incorrect endpoint URL. |
| **Resolution** | 1. Check VPN status and reconnect if necessary.<br>2. Verify firewall rules allow outbound TCP on port 4318.<br>3. Test connectivity with `curl` (see [Step 2](#step-2--test-endpoint-connectivity)).<br>4. Confirm the endpoint URL matches the target environment table in [Section 1](#1-environment-endpoints). |

### TLS Certificate Errors

| | |
|---|---|
| **Symptoms** | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `certificate verify failed`. |
| **Causes** | Self-signed certificate; corporate CA not trusted by the client; certificate expired. |
| **Resolution** | Add the corporate CA certificate to the system trust store:<br>• **macOS:** `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain corp-ca.crt`<br>• **Linux:** Copy the cert to `/usr/local/share/ca-certificates/` and run `sudo update-ca-certificates`.<br>• **Windows:** Import via `certlm.msc` into *Trusted Root Certification Authorities*.<br><br>For **testing only** (never in production):<br>`export NODE_TLS_REJECT_UNAUTHORIZED=0` |

### HTTP 429 — Rate Limiting

| | |
|---|---|
| **Symptoms** | `429 Too Many Requests` responses from the gateway. |
| **Causes** | OTel Collector `memory_limiter` or `batch` processor applying back-pressure; too many concurrent clients hitting a single replica. |
| **Resolution** | 1. Check Container App scaling metrics in the Azure Portal.<br>2. Verify `maxReplicas` is sufficient for the current client count.<br>3. Review `memory_limiter` configuration in the Collector config.<br>4. Consider increasing the `batch` processor timeout to reduce request frequency. |

### DNS Resolution Failure

| | |
|---|---|
| **Symptoms** | `ENOTFOUND` or `getaddrinfo failed` errors. |
| **Causes** | Private DNS zone not linked to the client's VNet; split-horizon DNS misconfiguration; incorrect endpoint hostname. |
| **Resolution** | 1. Verify DNS resolution:<br>`nslookup otel-gateway.corp.example.com`<br>2. Check Azure Private DNS zone configuration and virtual network links.<br>3. Ensure the VPN client is using the correct DNS servers (check `/etc/resolv.conf` or network adapter settings).<br>4. As a temporary workaround, add the endpoint IP to `/etc/hosts`. |

---

## Related Documents

- [Integration Handover](./otel-integration-handover.md)
- [Operations Runbook](../runbooks/otel-gateway-operations.md)
