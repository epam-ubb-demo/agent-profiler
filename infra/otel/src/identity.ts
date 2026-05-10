// Identity resources for the OTel Gateway infrastructure
// Creates a User-assigned Managed Identity with RBAC role assignments
// for Monitoring Metrics Publisher and Key Vault Secrets User.

import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import type { SharedArgs } from "./types.js";
import { managedIdentityName } from "./naming.js";

export interface IdentityArgs extends SharedArgs {
  appInsightsId: pulumi.Output<string>;
  keyVaultId: pulumi.Output<string>;
}

/**
 * Identity stack component resource.
 *
 * Provisions a User-assigned Managed Identity and scoped RBAC role
 * assignments for Monitoring Metrics Publisher (on Application Insights)
 * and Key Vault Secrets User (on Key Vault).
 */
export class IdentityStack extends pulumi.ComponentResource {
  public readonly managedIdentityId: pulumi.Output<string>;
  public readonly managedIdentityClientId: pulumi.Output<string>;
  public readonly managedIdentityPrincipalId: pulumi.Output<string>;

  constructor(
    name: string,
    args: IdentityArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:security:IdentityStack", name, {}, opts);

    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    const clientConfig = azure.authorization.getClientConfigOutput();

    // --- User-assigned Managed Identity ---
    const managedIdentity = new azure.managedidentity.UserAssignedIdentity(
      "managed-identity",
      {
        resourceName: managedIdentityName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Role Assignment: Monitoring Metrics Publisher (on App Insights) ---
    const metricsPublisherRoleId = pulumi.interpolate`/subscriptions/${clientConfig.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/3913510d-42f4-4e42-8a64-420c390055eb`;

    new azure.authorization.RoleAssignment(
      "ra-metrics-publisher",
      {
        scope: args.appInsightsId,
        roleDefinitionId: metricsPublisherRoleId,
        principalId: managedIdentity.principalId.apply((id) => id ?? ""),
        principalType: "ServicePrincipal",
      },
      { parent: this },
    );

    // --- Role Assignment: Key Vault Secrets User (on Key Vault) ---
    const kvSecretsUserRoleId = pulumi.interpolate`/subscriptions/${clientConfig.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86b69e6`;

    new azure.authorization.RoleAssignment(
      "ra-kv-secrets-user",
      {
        scope: args.keyVaultId,
        roleDefinitionId: kvSecretsUserRoleId,
        principalId: managedIdentity.principalId.apply((id) => id ?? ""),
        principalType: "ServicePrincipal",
      },
      { parent: this },
    );

    // --- Outputs ---
    this.managedIdentityId = managedIdentity.id;
    this.managedIdentityClientId = managedIdentity.clientId.apply(
      (id) => id ?? "",
    );
    this.managedIdentityPrincipalId = managedIdentity.principalId.apply(
      (id) => id ?? "",
    );

    this.registerOutputs({
      managedIdentityId: this.managedIdentityId,
      managedIdentityClientId: this.managedIdentityClientId,
      managedIdentityPrincipalId: this.managedIdentityPrincipalId,
    });
  }
}
