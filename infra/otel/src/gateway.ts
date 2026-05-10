// Application Gateway resources for the OTel Gateway infrastructure
// Provisions WAF policy, Application Gateway v2, diagnostic settings,
// and optional resource locks for production environments.
//
// Health probe design (T7.5.1, issue #259):
// ACA ingress only exposes port 4318, so the health probe targets the
// OTLP endpoint at /v1/traces on that port. The probe accepts HTTP
// status codes 200–499 — the OTLP endpoint returns 400 for empty GET
// requests, which confirms the collector is running and reachable.

import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import type { SharedArgs } from "./types.js";
import { agwName } from "./naming.js";

export interface GatewayArgs extends SharedArgs {
  agwSubnetId: pulumi.Output<string>;
  publicIpId: pulumi.Output<string>;
  containerAppFqdn: pulumi.Output<string>;
  logAnalyticsWorkspaceId: pulumi.Output<string>;
}

/**
 * Gateway stack component resource.
 *
 * Provisions a WAF v2 Application Gateway with OWASP 3.2 rule set,
 * backend pool targeting the OTel Collector Container App, health
 * probes on the collector's health check extension, and diagnostic
 * settings forwarded to Log Analytics.
 */
export class GatewayStack extends pulumi.ComponentResource {
  public readonly gatewayId: pulumi.Output<string>;
  public readonly gatewayPrivateIp: pulumi.Output<string>;

  constructor(
    name: string,
    args: GatewayArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:gateway:GatewayStack", name, {}, opts);

    const config = new pulumi.Config();
    const enableResourceLocks =
      config.getBoolean("enableResourceLocks") ?? false;
    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    const gwName = agwName(namingArgs);
    const gatewayPrivateIp = config.get("gatewayPrivateIp") ?? "10.0.1.4";

    const clientConfig = azure.authorization.getClientConfigOutput();

    // Self-reference ID for internal AppGW sub-resource references
    const agwId = pulumi.interpolate`/subscriptions/${clientConfig.subscriptionId}/resourceGroups/${args.resourceGroupName}/providers/Microsoft.Network/applicationGateways/${gwName}`;

    // --- WAF Policy ---
    const wafPolicy = new azure.network.WebApplicationFirewallPolicy(
      "waf-policy",
      {
        policyName: `${gwName}-waf`,
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        managedRules: {
          managedRuleSets: [
            { ruleSetType: "OWASP", ruleSetVersion: "3.2" },
          ],
        },
        policySettings: {
          mode: "Prevention",
          requestBodyCheck: true,
          // 2 MB — OTLP batched trace payloads regularly exceed the default 128 KB
          maxRequestBodySizeInKb: 2048,
          fileUploadLimitInMb: 1,
        },
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Application Gateway v2 ---
    const appGateway = new azure.network.ApplicationGateway(
      "agw",
      {
        applicationGatewayName: gwName,
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        sku: { name: "WAF_v2", tier: "WAF_v2", capacity: 2 },
        zones: ["1", "2", "3"],
        gatewayIPConfigurations: [
          {
            name: "gateway-ip",
            subnet: { id: args.agwSubnetId },
          },
        ],
        frontendIPConfigurations: [
          {
            name: "frontend-public",
            publicIPAddress: { id: args.publicIpId },
          },
          {
            name: "frontend-private",
            privateIPAllocationMethod: "Static",
            privateIPAddress: gatewayPrivateIp,
            subnet: { id: args.agwSubnetId },
          },
        ],
        frontendPorts: [{ name: "otlp-port", port: 4318 }],
        backendAddressPools: [
          {
            name: "otel-collector-pool",
            backendAddresses: [{ fqdn: args.containerAppFqdn }],
          },
        ],
        backendHttpSettingsCollection: [
          {
            name: "otlp-settings",
            port: 4318,
            protocol: "Http",
            requestTimeout: 30,
            pickHostNameFromBackendAddress: true,
            probe: {
              id: pulumi.interpolate`${agwId}/probes/health-probe`,
            },
          },
        ],
        httpListeners: [
          {
            name: "otlp-listener",
            frontendIPConfiguration: {
              id: pulumi.interpolate`${agwId}/frontendIPConfigurations/frontend-private`,
            },
            frontendPort: {
              id: pulumi.interpolate`${agwId}/frontendPorts/otlp-port`,
            },
            protocol: "Http",
          },
        ],
        requestRoutingRules: [
          {
            name: "otlp-rule",
            ruleType: "Basic",
            priority: 100,
            httpListener: {
              id: pulumi.interpolate`${agwId}/httpListeners/otlp-listener`,
            },
            backendAddressPool: {
              id: pulumi.interpolate`${agwId}/backendAddressPools/otel-collector-pool`,
            },
            backendHttpSettings: {
              id: pulumi.interpolate`${agwId}/backendHttpSettingsCollection/otlp-settings`,
            },
          },
        ],
        probes: [
          {
            name: "health-probe",
            protocol: "Https",
            pickHostNameFromBackendHttpSettings: true,
            path: "/v1/traces",
            port: 4318,
            interval: 15,
            timeout: 10,
            unhealthyThreshold: 3,
            match: {
              statusCodes: ["200-499"],
            },
          },
        ],
        firewallPolicy: { id: wafPolicy.id },
        tags: args.tags,
      },
      { parent: this, dependsOn: [wafPolicy] },
    );

    // --- Resource Lock (prod only) ---
    if (enableResourceLocks && args.environment === "prod") {
      new azure.authorization.ManagementLockByScope(
        "lock-agw",
        {
          lockName: "CanNotDelete-agw",
          scope: appGateway.id,
          level: "CanNotDelete",
          notes: "Prevent accidental deletion of Application Gateway",
        },
        { parent: this },
      );
    }

    // --- Outputs ---
    this.gatewayId = appGateway.id;
    this.gatewayPrivateIp = pulumi.output(gatewayPrivateIp);

    this.registerOutputs({
      gatewayId: this.gatewayId,
      gatewayPrivateIp: this.gatewayPrivateIp,
    });
  }
}
