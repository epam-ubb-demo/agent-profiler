// Networking resources for the OTel Gateway infrastructure
// Creates VNet, subnets, NSGs, and conditionally an Application Gateway public IP

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";

import { nsgName, pipName, subnetName, vnetName } from "./naming.js";
import type { SharedArgs } from "./types.js";

export type NetworkArgs = SharedArgs;

/**
 * Network stack component resource.
 *
 * Provisions the virtual network, ACA and (optionally) AppGW subnets,
 * network security groups, and a public IP for the Application Gateway
 * when running in production.
 */
export class NetworkStack extends pulumi.ComponentResource {
  public readonly vnetId: pulumi.Output<string>;
  public readonly vnetName: pulumi.Output<string>;
  public readonly acaSubnetId: pulumi.Output<string>;
  public readonly agwSubnetId: pulumi.Output<string> | undefined;
  public readonly publicIpId: pulumi.Output<string> | undefined;

  constructor(
    name: string,
    args: NetworkArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:network:NetworkStack", name, {}, opts);

    const config = new pulumi.Config();
    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    const vnetCidr = config.get("vnetCidr") ?? "10.0.0.0/16";
    const acaSubnetCidr = config.get("acaSubnetCidr") ?? "10.0.2.0/23";
    const agwSubnetCidr = config.get("agwSubnetCidr") ?? "10.0.1.0/24";
    const enableAppGateway = config.getBoolean("enableAppGateway") ?? false;

    // Narrow OTLP source: when AppGW is enabled, only accept from the AppGW subnet
    const acaOtlpSource = enableAppGateway && args.environment === "prod" ? agwSubnetCidr : "VirtualNetwork";

    // --- Virtual Network ---
    const vnet = new azure.network.VirtualNetwork(
      "vnet",
      {
        virtualNetworkName: vnetName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        addressSpace: { addressPrefixes: [vnetCidr] },
        tags: args.tags,
      },
      { parent: this },
    );

    // --- ACA Subnet NSG ---
    const acaNsg = new azure.network.NetworkSecurityGroup(
      "nsg-aca",
      {
        networkSecurityGroupName: nsgName("aca", namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        securityRules: [
          {
            name: "AllowVNetOtlpInbound",
            priority: 100,
            direction: "Inbound",
            access: "Allow",
            protocol: "Tcp",
            sourceAddressPrefix: acaOtlpSource,
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "4318",
          },
          {
            name: "DenyInternetInbound",
            priority: 4096,
            direction: "Inbound",
            access: "Deny",
            protocol: "*",
            sourceAddressPrefix: "Internet",
            sourcePortRange: "*",
            destinationAddressPrefix: "*",
            destinationPortRange: "*",
          },
        ],
        tags: args.tags,
      },
      { parent: this },
    );

    // --- ACA Subnet (NO delegation for Consumption-only environment) ---
    const acaSubnet = new azure.network.Subnet(
      "snet-aca",
      {
        subnetName: subnetName("aca", namingArgs),
        resourceGroupName: args.resourceGroupName,
        virtualNetworkName: vnet.name,
        addressPrefix: acaSubnetCidr,
        networkSecurityGroup: { id: acaNsg.id },
      },
      { parent: this, dependsOn: [vnet, acaNsg] },
    );

    this.vnetId = vnet.id;
    this.vnetName = vnet.name;
    this.acaSubnetId = acaSubnet.id;

    // --- AppGW resources (prod only) ---
    if (enableAppGateway && args.environment === "prod") {
      const agwNsg = new azure.network.NetworkSecurityGroup(
        "nsg-agw",
        {
          networkSecurityGroupName: nsgName("agw", namingArgs),
          resourceGroupName: args.resourceGroupName,
          location: args.region,
          securityRules: [
            {
              name: "AllowGatewayManagerInbound",
              priority: 100,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "GatewayManager",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "65200-65535",
            },
            {
              name: "AllowVNetOtlpInbound",
              priority: 200,
              direction: "Inbound",
              access: "Allow",
              protocol: "Tcp",
              sourceAddressPrefix: "VirtualNetwork",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "4318",
            },
            {
              name: "DenyInternetInbound",
              priority: 4096,
              direction: "Inbound",
              access: "Deny",
              protocol: "*",
              sourceAddressPrefix: "Internet",
              sourcePortRange: "*",
              destinationAddressPrefix: "*",
              destinationPortRange: "*",
            },
          ],
          tags: args.tags,
        },
        { parent: this },
      );

      const agwSubnet = new azure.network.Subnet(
        "snet-agw",
        {
          subnetName: subnetName("agw", namingArgs),
          resourceGroupName: args.resourceGroupName,
          virtualNetworkName: vnet.name,
          addressPrefix: agwSubnetCidr,
          networkSecurityGroup: { id: agwNsg.id },
        },
        { parent: this, dependsOn: [vnet, agwNsg] },
      );

      // Public IP is required by Application Gateway v2 infrastructure
      // but the frontend uses a private IP. The internet deny NSG rule is intentional.
      const pip = new azure.network.PublicIPAddress(
        "pip-agw",
        {
          publicIpAddressName: pipName("agw", namingArgs),
          resourceGroupName: args.resourceGroupName,
          location: args.region,
          sku: { name: "Standard" },
          publicIPAllocationMethod: "Static",
          zones: ["1", "2", "3"],
          tags: args.tags,
        },
        { parent: this },
      );

      this.agwSubnetId = agwSubnet.id;
      this.publicIpId = pip.id;
    }

    this.registerOutputs({
      vnetId: this.vnetId,
      vnetName: this.vnetName,
      acaSubnetId: this.acaSubnetId,
      agwSubnetId: this.agwSubnetId,
      publicIpId: this.publicIpId,
    });
  }
}
