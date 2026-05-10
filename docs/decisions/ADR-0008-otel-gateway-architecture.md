# ADR-0008: OTel Gateway Architecture — Azure Container Apps

## Status

Accepted

## Date

2025-05-10

## Context

Agent Profiler needs a centralised OTel Collector gateway to receive
Copilot CLI telemetry. The Copilot CLI extension emits OpenTelemetry
spans, metrics, and logs that must be collected, processed, and exported
to an observability backend for analysis and visualisation.

The gateway receives OTLP/HTTP on port 4318 and exports to Azure
Application Insights via the `azuremonitor` exporter. This architecture
enables centralised processing — PII redaction, tail sampling, and span
enrichment — before telemetry reaches the backend, rather than pushing
that responsibility onto each individual CLI client.

Three deployment environments are required: **dev**, **demo**, and
**prod**, each with different security and cost profiles. Dev must be
low-cost (ideally free) for day-to-day development. Demo must be
publicly accessible with IP restrictions for stakeholder demonstrations.
Prod must be hardened with WAF, always-on replicas, and zone-redundant
infrastructure.

The infrastructure-as-code approach uses **Pulumi with TypeScript** to
match the monorepo's language. This allows infrastructure definitions to
share the same toolchain (pnpm, Node.js, ESLint, TypeScript compiler) as
application code. A **local backend** was chosen to avoid remote state
dependencies such as Azure Blob Storage or Pulumi Cloud, simplifying
initial bootstrapping and developer onboarding.

## Decision

### Key decisions

| Decision | Rationale |
|----------|-----------|
| **Container Apps over AKS** | Serverless scaling, auto-scale to zero in dev, simpler operational model, lower cost for small-to-medium workloads |
| **Pulumi over Bicep/Terraform** | TypeScript consistency with the existing monorepo; type-safe infrastructure code; native pnpm/Node.js toolchain |
| **Local backend** | No remote state dependency; each developer manages their own passphrase; simplifies CI/CD bootstrapping |
| **Three environments (dev, demo, prod)** | Dev is free (scale-to-zero); Demo is public with IP restrictions for stakeholder demos; Prod is hardened with WAF and always-on replicas |
| **Application Gateway prod-only** | Cost savings of ~£250/month per non-prod environment; dev/demo traffic does not require WAF or zone-redundant ingress |
| **Connection string over Managed Identity** | The `azuremonitor` exporter in otelcol-contrib does not natively support Managed Identity authentication; connection string via environment variable is the supported approach |
| **Consumption-only ACA plan** | /23 subnet with NO delegation to `Microsoft.App/environments`; simpler networking; no workload profiles needed |
| **OTel Collector Contrib image** | `otel/opentelemetry-collector-contrib:0.102.0` provides `azuremonitor` exporter, `tail_sampling`, `transform` processors out of the box |

### Network topology

The infrastructure is deployed into an Azure Virtual Network
(`10.0.0.0/16`) with purpose-specific subnets:

- **ACA subnet** (`10.0.2.0/23`) — hosts the Container Apps Environment.
  The /23 CIDR is the minimum required by Azure Container Apps for
  VNet-integrated environments.
- **Application Gateway subnet** (`10.0.1.0/24`) — prod-only. Hosts the
  WAF v2 gateway that terminates TLS and forwards traffic to the
  internal ACA ingress.

Non-prod environments (dev, demo) do not provision the Application
Gateway subnet or its associated resources.

### Monitoring

Each environment provisions a **Log Analytics workspace** and a
**workspace-based Application Insights** instance. Diagnostic settings
are enabled on all resources to forward platform logs and metrics to Log
Analytics.

Metric alerts are configured for:

- **Container restarts** — detects crash loops in the OTel Collector
- **Replica count** (prod) — alerts when active replicas drop to zero
- **Client errors** — elevated 4xx/5xx rates on the OTLP endpoint
- **Key Vault access denied** — unauthorised secret access attempts

Action groups with email notifications ensure the operations team is
alerted promptly.

### Security

- **NSGs with deny-internet** — Network Security Groups on all subnets
  block direct internet egress; traffic routes through the managed
  platform's egress path.
- **PII redaction** — the `transform/pii` processor in the OTel
  Collector pipeline redacts personally identifiable information before
  export to Application Insights.
- **Resource locks** (prod) — `CanNotDelete` locks on production
  resources prevent accidental deletion.
- **Key Vault** — connection strings and secrets are stored in Azure Key
  Vault and injected into Container App secrets at deployment time.
- **WAF v2** (prod) — Application Gateway with Web Application Firewall
  policy provides OWASP rule-set protection and TLS 1.2 termination.

### Scaling

Container Apps use an **HTTP concurrent-requests scaling rule** with a
threshold of **50 concurrent requests** per replica. Environment-specific
replica bounds:

| Environment | minReplicas | maxReplicas |
|-------------|-------------|-------------|
| dev         | 0           | 2           |
| demo        | 0           | 2           |
| prod        | 3           | 10          |

The `memory_limiter` processor is always the first processor in the
pipeline to prevent OOM kills under burst load. The `batch` processor is
tuned per environment: 512 send batch size for dev, 8192 for prod.

### Alternatives considered

1. **Azure Monitor Distro (OpenTelemetry SDK)** — Direct export from
   each Copilot CLI client to Application Insights. Rejected: no
   centralised processing, no PII redaction, no tail sampling, each
   client needs its own connection string.

2. **AKS-hosted OTel Collector** — Full Kubernetes control plane.
   Rejected: over-engineered for a single-container workload, higher
   operational burden, higher base cost.

3. **Azure Functions as OTLP proxy** — Serverless HTTP trigger receiving
   OTLP. Rejected: cold start latency, no native OTel Collector
   pipeline, custom code required for each processor.

### Well-Architected Framework alignment

| Pillar | Key Measures |
|--------|-------------|
| Reliability | Zone-redundant production CAE, minReplicas=3, liveness/readiness health probes on `:13133`, metric alerts for zero replicas |
| Security | VNet-integrated subnets with deny-internet NSGs, PII redaction via `transform/pii` processor, Key Vault for secrets, WAF v2 in prod, TLS 1.2 termination |
| Cost Optimisation | No Application Gateway in dev/demo (~£250/mo saving each), scale-to-zero in non-prod, Consumption-only ACA plan, PerGB2018 Log Analytics SKU |
| Operational Excellence | Diagnostic settings on all resources, action groups with email alerts, resource locks (`CanNotDelete`) in prod, structured tagging |
| Performance Efficiency | HTTP concurrent-requests scaling rule (50 req threshold), tuned batch processor (512 dev, 8192 prod), `memory_limiter` as first processor |

## Consequences

- All Copilot CLI telemetry flows through a single gateway — centralised
  PII redaction, sampling, and enrichment.
- Three Pulumi stacks (dev, demo, prod) share the same TypeScript
  codebase with configuration-driven differentiation.
- The `azuremonitor` exporter maps OTel spans/metrics/logs to
  Application Insights tables (`requests`, `dependencies`, `traces`,
  `customMetrics`).
- Connection string must be rotated manually and stored in Container App
  secrets.
- AppGW is only provisioned for prod; dev and demo environments expose
  ingress directly (internal or IP-restricted).
- Future migration to Managed Identity for the exporter will require
  upstream otelcol-contrib support.
- Collector version upgrades require updating `otelCollectorTag` config
  and redeploying.
