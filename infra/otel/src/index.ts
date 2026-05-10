// Main Pulumi entry point for the OTel Gateway infrastructure
// Orchestrates resource group, networking, and monitoring stacks

import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import { createTags, registerAutoTagging } from "./tags.js";
import { resourceGroupName } from "./naming.js";
import { NetworkStack } from "./network.js";
import { MonitoringStack, addDiagnosticSettings } from "./monitoring.js";

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

// Wire diagnostic settings for resources owned by other stacks
addDiagnosticSettings("vnet", network.vnetId, monitoring.logAnalyticsWorkspaceId);

// Exports
export const resourceGroupOutput = resourceGroup.name;
export const vnetId = network.vnetId;
export const appInsightsConnectionString = monitoring.appInsightsConnectionString;
