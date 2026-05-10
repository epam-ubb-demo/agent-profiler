# OTel Gateway — Operations Runbook

This runbook covers day-to-day operations of the OTel Gateway infrastructure, including deployment, monitoring, scaling, troubleshooting, cost management, and maintenance procedures.

> **Audience**: Platform engineers and on-call operators responsible for the Agent Profiler OTel Gateway.

---

## Table of Contents

1. [Deployment Procedure](#1-deployment-procedure)
2. [Monitoring](#2-monitoring)
3. [Scaling](#3-scaling)
4. [Troubleshooting](#4-troubleshooting)
5. [Cost Management](#5-cost-management)
6. [Secret Rotation](#6-secret-rotation)
7. [Fallback Procedure](#7-fallback-procedure)
8. [OTel Collector Version Upgrade](#8-otel-collector-version-upgrade)

---

## 1. Deployment Procedure

All infrastructure is managed via Pulumi (TypeScript, local backend). Changes **must** flow through `pulumi preview` before applying.

### Pre-flight Checklist

```bash
# 1. Verify Azure CLI authentication
az account show --query "{subscription:name, id:id}" -o table

# 2. Verify correct subscription
az account set --subscription "<subscription-id>"

# 3. Verify Pulumi CLI version (>= 3.100)
pulumi version

# 4. Navigate to infrastructure directory
cd infra/otel

# 5. Install dependencies
pnpm install

# 6. Select the target stack
pulumi stack select <environment>  # dev | demo | prod
```

### Preview Changes

```bash
pulumi preview --diff
```

Review the output carefully. Look for unexpected **deletes** or **replacements** — these may indicate a breaking change.

### Deploy

```bash
# Non-production
pulumi up --yes

# Production — ALWAYS review the preview first
pulumi preview --diff
# Review output carefully, then:
pulumi up
# Type 'yes' when prompted
```

> **⚠ Production safeguard**: The Container App resource has `protect: true` and `retainOnDelete: true` set in the IaC. Pulumi will refuse to delete it unless you explicitly remove the protection first.

### Post-deployment Verification

```bash
# Check Container App status
az containerapp show \
  --name <container-app-name> \
  --resource-group <resource-group-name> \
  --query "{status:properties.provisioningState, fqdn:properties.configuration.ingress.fqdn}" \
  -o table

# Verify OTLP endpoint is reachable (port 4318 is exposed via ingress)
curl -s -o /dev/null -w "%{http_code}" \
  "https://<container-app-fqdn>/v1/traces" \
  -X POST -H "Content-Type: application/json" -d '{}'
# Expected: 200 or 400 (endpoint is reachable and responding)
```

**Naming convention** — resource names follow `<abbreviation>-<workload>-<environment>-<region>-<instance>`:

| Resource | Name Pattern | Example (prod) |
|---|---|---|
| Resource Group | `rg-otel-<env>-<region>-<instance>` | `rg-otel-prod-eastus-001` |
| Container App | `ca-otelcol-<env>-<region>-<instance>` | `ca-otelcol-prod-eastus-001` |
| Container Apps Env | `cae-otel-<env>-<region>-<instance>` | `cae-otel-prod-eastus-001` |
| Key Vault | `kv-otel-<env>-<instance>` | `kv-otel-prod-001` |
| Log Analytics | `log-otel-<env>-<region>-<instance>` | `log-otel-prod-eastus-001` |
| App Insights | `appi-otel-<env>-<region>-<instance>` | `appi-otel-prod-eastus-001` |
| App Gateway (prod) | `agw-otel-<env>-<region>-<instance>` | `agw-otel-prod-eastus-001` |

---

## 2. Monitoring

### Where to Look

1. **Application Insights** — Telemetry data (spans, metrics, logs) forwarded by the OTel Collector.
2. **Log Analytics** — Container Apps system logs, diagnostic logs for networking and Key Vault.
3. **Container Apps metrics** — Replica count, requests, CPU/memory utilisation.
4. **Azure Portal → Alerts** — Pre-configured alerts for container restarts, replica count (prod), client errors (4xx), and Key Vault access denied.

### Key KQL Queries

**Collector health — requests per minute**:

```kql
requests
| where timestamp > ago(1h)
| summarize requestCount = count() by bin(timestamp, 1m)
| order by timestamp desc
```

**Error rate over time**:

```kql
requests
| where timestamp > ago(24h)
| summarize
    total = count(),
    errors = countif(success == false)
    by bin(timestamp, 1h)
| extend errorRate = round(100.0 * errors / total, 2)
| order by timestamp desc
```

**Container App system logs**:

```kql
ContainerAppSystemLogs_CL
| where TimeGenerated > ago(1h)
| where Log_s has "error" or Log_s has "warn"
| project TimeGenerated, Log_s, ContainerAppName_s
| order by TimeGenerated desc
```

**Data ingestion volume**:

```kql
customMetrics
| where timestamp > ago(24h)
| summarize dataPoints = count() by bin(timestamp, 1h)
| order by timestamp desc
```

### Configured Alerts

The following metric alerts are provisioned by the IaC (see `infra/otel/src/monitoring.ts`):

| Alert | Severity | Condition | Window |
|---|---|---|---|
| Container Restarts | Sev 2 | RestartCount > 0 | 15 min |
| Replica Zero (prod only) | Sev 1 | Replicas ≤ 0 | 5 min |
| Client Errors (4xx) | Sev 2 | 4xx Requests > 0 | 15 min |
| Key Vault Access Denied | Sev 2 | 401/403 on ServiceApiResult > 0 | 15 min |

Alert notifications are sent to the `otel-alerts` action group via e-mail.

---

## 3. Scaling

### How Auto-scaling Works

- The Container App scales based on HTTP concurrent requests (threshold: **50 per replica**).
- **Dev/Demo**: 0–2 replicas (scale-to-zero enabled).
- **Prod**: 3–10 replicas (always-on, never scales below 3).

These values are set in the per-stack Pulumi config files (`Pulumi.dev.yaml`, `Pulumi.demo.yaml`, `Pulumi.prod.yaml`).

### Manual Override

```bash
# Temporarily increase minimum replicas
pulumi config set minReplicas 5 --stack prod
pulumi up --yes

# Revert after incident
pulumi config set minReplicas 3 --stack prod
pulumi up --yes
```

### Capacity Planning

- Each replica handles ~50 concurrent OTLP requests.
- Prod default (3–10 replicas) supports **150–500 concurrent requests**.
- Monitor `Requests` and `Replicas` metrics in the Azure Portal under the Container App blade.
- If consistently hitting `maxReplicas`, increase the value via Pulumi config:

```bash
pulumi config set maxReplicas 15 --stack prod
pulumi up --yes
```

### Resource Limits per Environment

| Environment | CPU per Replica | Memory per Replica |
|---|---|---|
| Dev / Demo | 0.25 vCPU | 0.5 Gi |
| Prod | 1.0 vCPU | 2.0 Gi |

---

## 4. Troubleshooting

### 4.1 Container App Not Starting

**Symptoms**: Replica count stays at 0 (prod) or revision fails to activate.

**Investigation**:

```bash
az containerapp revision list \
  --name <container-app-name> \
  --resource-group <resource-group-name> \
  -o table
```

```kql
ContainerAppSystemLogs_CL
| where TimeGenerated > ago(1h)
| where Log_s has "error" or Log_s has "pull" or Log_s has "mount"
| order by TimeGenerated desc
```

**Common causes**:
- Image pull failure — registry unreachable or incorrect tag.
- Secret mount issues — the `otel-collector-config` secret volume failed to mount.
- Insufficient resources allocated.

**Resolution**:
1. Verify the image tag exists: `docker pull otel/opentelemetry-collector-contrib:0.102.0`
2. Check secret values are not empty in the Pulumi state.
3. Review the revision health status and system logs for specific error messages.

### 4.2 No Data in Application Insights

**Symptoms**: KQL queries return empty results; dashboards show no telemetry.

**Investigation**:

```kql
requests
| where timestamp > ago(1h)
| count
```

```bash
# Test OTLP endpoint directly
curl -v https://<endpoint>:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{}' --max-time 5
```

**Common causes**:
- `APPLICATIONINSIGHTS_CONNECTION_STRING` secret is missing or incorrect.
- Network path blocked (NSG rules, VNet misconfiguration).
- Tail sampling dropping all data (prod).
- Clients not sending traffic to the gateway.

**Resolution**:
1. Verify the connection string in the Container App's environment variables.
2. Check NSG rules on the `snet-aca` subnet allow inbound traffic on port 4318.
3. Review the `otel-collector.prod.yaml` sampling policies.
4. Confirm client OTLP exporter configuration points to the correct endpoint.

### 4.3 High Latency

**Symptoms**: `invoke_agent` span durations increasing; client-side timeouts.

**Investigation**:

```kql
requests
| where timestamp > ago(1h)
| summarize p50=percentile(duration, 50), p99=percentile(duration, 99) by bin(timestamp, 5m)
| order by timestamp desc
```

**Common causes**:
- Batch processor buffer full.
- `memory_limiter` processor throttling exports.
- Insufficient replicas to handle load.
- Application Insights ingestion delays (transient).

**Resolution**:
1. Review batch settings (`timeout`, `send_batch_size`) in the collector configuration.
2. Check memory utilisation — if approaching the `memory_limiter` threshold, scale up.
3. Increase replicas (see [Section 3: Scaling](#3-scaling)).
4. Review `memory_limiter` configuration in the environment-specific collector config file.

### 4.4 WAF Blocking Legitimate Traffic (Prod)

**Symptoms**: HTTP 403 responses from Application Gateway; clients report "access denied".

**Investigation** — check WAF logs in Log Analytics:

```kql
AzureDiagnostics
| where ResourceType == "APPLICATIONGATEWAYS"
| where action_s == "Blocked"
| project TimeGenerated, ruleId_s, message_s, clientIp_s
| order by TimeGenerated desc
```

**Common causes**:
- WAF rule triggering on OTLP payload content.
- Client IP not in allowed range.

**Resolution**:
1. Add WAF exclusion rules for the specific `ruleId_s` value.
2. Add the client IP to the NSG allow list.
3. If the rule is a false positive, configure an exclusion in the Application Gateway WAF policy.

### 4.5 Key Vault Access Denied

**Symptoms**: Alert fires for KV access denied; container app cannot read secrets.

**Investigation**:

```bash
az keyvault show --name <vault-name> \
  --query "{softDelete:properties.enableSoftDelete, rbac:properties.enableRbacAuthorization}" \
  -o table
```

**Common causes**:
- Managed Identity not assigned the correct RBAC role.
- Key Vault network ACLs blocking access from the Container App subnet.
- Managed Identity not assigned to the Container App.

**Resolution**:
1. Assign `Key Vault Secrets User` role to the Container App's managed identity.
2. Ensure VNet integration allows access — check Key Vault firewall rules.
3. Verify the managed identity (`id-otelcol-<env>-<region>-<instance>`) is associated with the Container App.

### 4.6 Certificate Expiry (Prod — Application Gateway)

**Symptoms**: TLS handshake failures; `ERR_CERT_DATE_INVALID` from clients.

**Investigation**:

```bash
az network application-gateway ssl-cert list \
  --gateway-name <agw-name> \
  --resource-group <resource-group-name> \
  -o table
```

**Common causes**:
- TLS certificate on the Application Gateway has expired.

**Resolution**:
1. Renew the certificate with your certificate authority.
2. Upload the renewed certificate to Key Vault.
3. Update the Application Gateway listener to reference the new certificate version.

---

## 5. Cost Management

### Estimated Costs per Environment

| Environment | Component | Estimated Monthly Cost |
|---|---|---|
| Dev | All resources (scale-to-zero) | ~$0 |
| Demo | ACA (low traffic) + Log Analytics | ~$5–15/mo |
| Prod | ACA (always-on) + AppGW WAF v2 + Log Analytics (90d) | ~$400–600/mo |

### Cost Breakdown (Prod)

| Component | Estimated Cost |
|---|---|
| Application Gateway WAF v2 | ~£250/mo (~$315) |
| Container Apps (3 replicas × 1 CPU × 2 Gi) | ~$50–80/mo |
| Log Analytics (90-day retention) | ~$30–50/mo (varies with ingestion volume) |
| Application Insights | Pay-per-use ingestion |
| Key Vault | ~$0.03 per 10k operations |

### Optimisation Levers

- **Remove Application Gateway from non-prod** — already done; saves ~£250/mo per environment.
- **Reduce log retention in non-prod** — 30 days (dev/demo) vs 90 days (prod).
- **Enable tail sampling** — reduces ingestion volume. Prod config: 100% errors, 10% normal traffic.
- **Scale-to-zero in dev/demo** — `minReplicas: 0` already configured for these environments.

---

## 6. Secret Rotation

### Rotating the App Insights Connection String

```bash
# 1. Get the new connection string from Azure Portal
#    Application Insights → Overview → Connection String

# 2. Navigate to the infrastructure directory
cd infra/otel

# 3. Update the Pulumi secret
pulumi config set --secret appInsightsConnectionString "<new-connection-string>" --stack <env>

# 4. Deploy to update the Container App secret
pulumi up --yes
```

> **Note**: The Container App will automatically pick up the new secret value on the next revision deployment. The `pulumi up` creates a new revision which triggers the update.

---

## 7. Fallback Procedure

### Disabling the Gateway (Direct Export Mode)

> **⚠️ Application Insights is not OTLP-compatible.** The App Insights
> ingestion endpoint (`dc.services.visualstudio.com`) does not accept native
> OTLP payloads. You cannot simply redirect the OTLP exporter to App Insights.

1. **Disable OTLP export on clients** until the gateway is restored:

   ```bash
   # Temporarily disable telemetry export
   unset OTEL_EXPORTER_OTLP_ENDPOINT
   export COPILOT_OTEL_ENABLED=false
   ```

2. **Understand the impact** — while the gateway is down:
   - No telemetry data is collected (tokens, cost, session metrics)
   - Copilot CLI continues to function normally — telemetry is non-blocking
   - Historical data in Application Insights remains available for querying

3. **If a secondary gateway exists**, redirect clients to it:

   ```bash
   export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel-gateway-secondary.corp.example.com:4318"
   ```

4. **Restore normal operation** — once the primary gateway is healthy, re-enable telemetry export:

   ```bash
   export COPILOT_OTEL_ENABLED=true
   export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel-gateway.corp.example.com:4318"
   ```

---

## 8. OTel Collector Version Upgrade

### How to Update the Image Tag Safely

The collector image version is managed via the `otelCollectorTag` Pulumi config key (current: `0.102.0`).

```bash
# 1. Check current version
pulumi config get otelCollectorTag --stack <env>

# 2. Review the changelog for the new version
#    https://github.com/open-telemetry/opentelemetry-collector-contrib/releases

# 3. Update in dev first
pulumi config set otelCollectorTag "0.103.0" --stack dev
pulumi up --yes

# 4. Verify dev is healthy (wait 10 minutes, check monitoring)

# 5. Promote to demo
pulumi config set otelCollectorTag "0.103.0" --stack demo
pulumi up --yes

# 6. Verify demo (wait 30 minutes)

# 7. Promote to prod (with review)
pulumi config set otelCollectorTag "0.103.0" --stack prod
pulumi preview --diff
pulumi up  # Review and confirm
```

### Rollback

```bash
pulumi config set otelCollectorTag "0.102.0" --stack <env>
pulumi up --yes
```

> **Tip**: Always roll forward through environments (dev → demo → prod) and allow soak time between promotions to catch regressions early.

---

## Related Documentation

- [ADR-0008 — OTel Gateway Architecture](../decisions/ADR-0008-otel-gateway-architecture.md)
- [Infrastructure README](../../infra/otel/README.md)
- [Integration Handover Guide](../guides/otel-integration-handover.md)
- [Client Configuration Guide](../guides/otel-client-configuration.md)
