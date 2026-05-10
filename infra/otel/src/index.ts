// Main Pulumi entry point for the OTel Gateway infrastructure
// Orchestrates resource group, networking, and monitoring stacks

import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { createTags, registerAutoTagging } from "./tags.js";
import { resourceGroupName } from "./naming.js";
import { NetworkStack } from "./network.js";
import { MonitoringStack, addDiagnosticSettings } from "./monitoring.js";
import { ContainerAppStack } from "./container-app.js";
import { KeyVaultStack } from "./keyvault.js";
import { IdentityStack } from "./identity.js";

const config = new pulumi.Config();
const environment = config.require("environment");
const region = config.require("region");
const instance = config.require("instance");

const tags = createTags({ environment });
registerAutoTagging(tags);

// Resource Group
const rgName = resourceGroupName({ environment, region, instance });
const resourceGroup = new azure.resources.ResourceGroup("resource-group", {
  resourceGroupName: rgName,
  location: region,
  tags,
});

// Network stack
const network = new NetworkStack("network", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
});

// Monitoring stack
const monitoring = new MonitoringStack("monitoring", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
});

// Key Vault stack
const keyVault = new KeyVaultStack("keyvault", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  subnetId: network.acaSubnetId,
  vnetId: network.vnetId,
  logAnalyticsWorkspaceId: monitoring.logAnalyticsWorkspaceId,
  appInsightsConnectionString: monitoring.appInsightsConnectionString,
});

// Identity stack
const identity = new IdentityStack("identity", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  appInsightsId: monitoring.appInsightsId,
  keyVaultId: keyVault.keyVaultId,
});

// Container App stack (OTel Collector)
const containerApp = new ContainerAppStack("container-app", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  acaSubnetId: network.acaSubnetId,
  logAnalyticsWorkspaceId: monitoring.logAnalyticsWorkspaceId,
  appInsightsConnectionString: monitoring.appInsightsConnectionString,
});

// Wire diagnostic settings for resources owned by other stacks
addDiagnosticSettings("vnet", network.vnetId, monitoring.logAnalyticsWorkspaceId);
addDiagnosticSettings("cae", containerApp.caeId, monitoring.logAnalyticsWorkspaceId);

// Exports
export const resourceGroupOutput = resourceGroup.name;
export const vnetId = network.vnetId;
export const appInsightsConnectionString = monitoring.appInsightsConnectionString;
export const containerAppFqdn = containerApp.containerAppFqdn;
export const containerAppId = containerApp.containerAppId;
export const keyVaultUri = keyVault.keyVaultUri;
export const managedIdentityClientId = identity.managedIdentityClientId;
