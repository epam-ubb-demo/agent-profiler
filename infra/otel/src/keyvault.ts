// Key Vault resources for the OTel Gateway infrastructure
// Creates Key Vault with Private Endpoint, DNS zone, diagnostic settings,
// secret storage, and conditional resource locks.

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";

import { addDiagnosticSettings } from "./monitoring.js";
import { kvName, privateEndpointName } from "./naming.js";
import type { SharedArgs } from "./types.js";

export interface KeyVaultArgs extends SharedArgs {
  subnetId: pulumi.Output<string>;
  vnetId: pulumi.Output<string>;
  logAnalyticsWorkspaceId: pulumi.Output<string>;
  appInsightsConnectionString: pulumi.Output<string>;
}

/**
 * Key Vault stack component resource.
 *
 * Provisions an Azure Key Vault with RBAC authorisation, a private endpoint
 * with DNS zone, an Application Insights connection string secret,
 * diagnostic settings, and a conditional resource lock for production.
 */
export class KeyVaultStack extends pulumi.ComponentResource {
  public readonly keyVaultId: pulumi.Output<string>;
  public readonly keyVaultUri: pulumi.Output<string>;
  public readonly keyVaultName: pulumi.Output<string>;

  constructor(
    name: string,
    args: KeyVaultArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:keyvault:KeyVaultStack", name, {}, opts);

    const config = new pulumi.Config();
    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    const isProd = args.environment === "prod";
    const enableResourceLocks =
      config.getBoolean("enableResourceLocks") ?? false;

    const clientConfig = azure.authorization.getClientConfigOutput();

    // --- Key Vault ---
    const vault = new azure.keyvault.Vault(
      "key-vault",
      {
        vaultName: kvName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        properties: {
          tenantId: clientConfig.tenantId,
          sku: { family: "A", name: azure.keyvault.SkuName.Standard },
          enableSoftDelete: true,
          ...(isProd ? { enablePurgeProtection: true } : {}),
          enableRbacAuthorization: true,
          networkAcls: { defaultAction: "Deny", bypass: "AzureServices" },
          createMode: "default",
        },
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Key Vault Secret: Application Insights connection string ---
    new azure.keyvault.Secret(
      "secret-appinsights-connection-string",
      {
        secretName: "appinsights-connection-string",
        vaultName: vault.name,
        resourceGroupName: args.resourceGroupName,
        properties: { value: args.appInsightsConnectionString },
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Private Endpoint ---
    const pepName = privateEndpointName("kv", namingArgs);
    const pep = new azure.network.PrivateEndpoint(
      "pep-kv",
      {
        privateEndpointName: pepName,
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        subnet: { id: args.subnetId },
        privateLinkServiceConnections: [
          {
            name: "kv",
            privateLinkServiceId: vault.id,
            groupIds: ["vault"],
          },
        ],
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Private DNS Zone ---
    const dnsZone = new azure.network.PrivateZone(
      "dns-zone-kv",
      {
        privateZoneName: "privatelink.vaultcore.azure.net",
        resourceGroupName: args.resourceGroupName,
        location: "Global",
        tags: args.tags,
      },
      { parent: this },
    );

    // --- VNet Link ---
    new azure.network.VirtualNetworkLink(
      "dns-vnet-link-kv",
      {
        virtualNetworkLinkName: "vnet-link-kv",
        privateZoneName: dnsZone.name,
        resourceGroupName: args.resourceGroupName,
        location: "Global",
        virtualNetwork: { id: args.vnetId },
        registrationEnabled: false,
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Private DNS Zone Group (registers PE IP in DNS zone) ---
    new azure.network.PrivateDnsZoneGroup(
      "dns-zone-group-kv",
      {
        privateDnsZoneGroupName: "kv",
        privateEndpointName: pepName,
        resourceGroupName: args.resourceGroupName,
        privateDnsZoneConfigs: [
          {
            name: "vault",
            privateDnsZoneId: dnsZone.id,
          },
        ],
      },
      { parent: this, dependsOn: [pep] },
    );

    // --- Diagnostic Settings ---
    addDiagnosticSettings(
      "kv",
      vault.id,
      args.logAnalyticsWorkspaceId,
      this,
    );

    // --- Resource Lock (prod only) ---
    if (enableResourceLocks && isProd) {
      new azure.authorization.ManagementLockByScope(
        "lock-key-vault",
        {
          lockName: "CanNotDelete-key-vault",
          scope: vault.id,
          level: "CanNotDelete",
          notes: "Prevent accidental deletion of Key Vault",
        },
        { parent: this },
      );
    }

    // --- Outputs ---
    this.keyVaultId = vault.id;
    this.keyVaultUri = vault.properties.apply((p) => p?.vaultUri ?? "");
    this.keyVaultName = vault.name;

    this.registerOutputs({
      keyVaultId: this.keyVaultId,
      keyVaultUri: this.keyVaultUri,
      keyVaultName: this.keyVaultName,
    });
  }
}
