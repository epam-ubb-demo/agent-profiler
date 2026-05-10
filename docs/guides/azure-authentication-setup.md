# Azure Authentication Setup for Application Insights Adapter

This guide covers how to configure Azure credentials for the `@agent-profiler/adapters-application-insights` package. The adapter uses the Azure Identity SDK's `DefaultAzureCredential`, which automatically discovers credentials from multiple sources.

## Prerequisites

- An Azure subscription
- A Log Analytics workspace containing OTel span data (exported by the OTel Gateway)
- One of the authentication methods described below

## Authentication Methods

### Azure CLI (local development)

The simplest option for local development. `DefaultAzureCredential` automatically picks up Azure CLI credentials.

1. **Install the Azure CLI** — follow the [official instructions](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli).

2. **Sign in:**

   ```bash
   az login
   ```

3. **Verify your session:**

   ```bash
   az account show
   ```

   Confirm the `id` (subscription) and `tenantId` match the subscription that owns your Log Analytics workspace.

No additional configuration is needed — the adapter's `DefaultAzureCredential` discovers CLI tokens automatically.

### Environment Variables (service principal)

Best suited for CI/CD pipelines or headless environments where interactive login is not possible.

1. **Create an App Registration** in Azure Active Directory (Microsoft Entra ID):
   - Azure Portal → Microsoft Entra ID → App registrations → New registration
   - Note the **Application (client) ID** and **Directory (tenant) ID**

2. **Create a client secret:**
   - App registration → Certificates & secrets → New client secret
   - Copy the secret **Value** (it is only shown once)

3. **Set environment variables:**

   ```bash
   export AZURE_TENANT_ID="<your-tenant-id>"
   export AZURE_CLIENT_ID="<your-client-id>"
   export AZURE_CLIENT_SECRET="<your-client-secret>"
   ```

`DefaultAzureCredential` reads these variables and authenticates as the service principal.

### Managed Identity (Azure-hosted environments)

For applications running on Azure infrastructure (VMs, App Service, Azure Kubernetes Service). No credentials to manage — Azure handles token issuance.

1. **Enable system-assigned managed identity:**
   - Azure Portal → your resource (VM, App Service, etc.) → Identity → System assigned → Status: **On**

2. **Assign the RBAC role** (see [RBAC Configuration](#rbac-configuration) below).

`DefaultAzureCredential` automatically detects managed identity when running on Azure infrastructure.

## RBAC Configuration

Regardless of the authentication method, the identity (user, service principal, or managed identity) must have the **Log Analytics Reader** role on the target Log Analytics workspace.

### Via Azure Portal

1. Azure Portal → Log Analytics workspaces → select your workspace
2. Access Control (IAM) → Add → Add role assignment
3. Role: **Log Analytics Reader**
4. Members: select the user, service principal, or managed identity
5. Review + assign

### Via Azure CLI

```bash
az role assignment create \
  --assignee <principal-id> \
  --role "Log Analytics Reader" \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.OperationalInsights/workspaces/<workspace-name>
```

Replace the placeholder values:

| Placeholder | Where to find it |
|---|---|
| `<principal-id>` | User object ID, service principal object ID, or managed identity principal ID |
| `<subscription-id>` | `az account show --query id` |
| `<resource-group>` | Resource group containing the workspace |
| `<workspace-name>` | Name of the Log Analytics workspace |

## Finding Your Workspace ID

The adapter requires the **Workspace ID** (a GUID), not the workspace name.

1. Azure Portal → Log Analytics workspaces → select your workspace
2. Overview or Properties pane → **Workspace ID**

Copy this GUID and pass it to the adapter:

```typescript
const dataSource = new ApplicationInsightsDataSource({
  workspaceId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
});
```

## Troubleshooting

| Error | Likely Cause | Resolution |
|---|---|---|
| `AuthenticationError` (`AUTHENTICATION_FAILED`) | No valid credential found | Verify `az login` session is active or environment variables are set correctly |
| `WorkspaceNotFoundError` (`WORKSPACE_NOT_FOUND`) | Incorrect workspace ID or insufficient permissions | Check the workspace ID GUID; verify the Log Analytics Reader role is assigned |
| `QueryTimeoutError` (`QUERY_TIMEOUT`) | Large time range or complex query | Narrow the time range; increase `timeoutMs` in the adapter configuration |
| `CredentialUnavailableError` | `DefaultAzureCredential` could not find any credential source | Ensure at least one authentication method is configured (CLI, env vars, or managed identity) |

## Programmatic Credential Override

If `DefaultAzureCredential` is not suitable, you can pass any `TokenCredential` implementation directly:

```typescript
import { ClientSecretCredential } from '@azure/identity';
import { ApplicationInsightsDataSource } from '@agent-profiler/adapters-application-insights';

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

const dataSource = new ApplicationInsightsDataSource({
  workspaceId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  credential,
});
```

This is useful when you need explicit control over the credential lifecycle or when using certificate-based authentication (`CertificateCredential`), workload identity (`WorkloadIdentityCredential`), or other specialised credential types.
