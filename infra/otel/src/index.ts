// Main Pulumi entry point for the OTel Gateway infrastructure
// Orchestrates resource group, networking, and monitoring stacks

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";

import { ContainerAppStack } from "./container-app.js";
import { DataCollectionStack } from "./data-collection.js";
import { GatewayStack } from "./gateway.js";
import { IdentityStack } from "./identity.js";
import { KeyVaultStack } from "./keyvault.js";
import { MonitoringStack, addDiagnosticSettings } from "./monitoring.js";
import { resourceGroupName } from "./naming.js";
import { NetworkStack } from "./network.js";
import { createTags, registerAutoTagging } from "./tags.js";
import { WorkbookStack } from "./workbooks.js";

const config = new pulumi.Config();
const environment = config.require("environment");
const region = config.require("region");
const instance = config.require("instance");

const enableAppGateway = config.getBoolean("enableAppGateway") ?? false;

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

// Data Collection stack (DCE + DCR for custom-table enrichment sink)
const dataCollection = new DataCollectionStack("data-collection", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  logAnalyticsWorkspaceId: monitoring.logAnalyticsWorkspaceId,
});

// Key Vault stack
const keyVault = new KeyVaultStack("keyvault", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  subnetId: network.pepSubnetId,
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
// Must run after keyVault so the PE is moved off snet-aca before the CAE claims it
const containerApp = new ContainerAppStack("container-app", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  acaSubnetId: network.acaSubnetId,
  logAnalyticsWorkspaceId: monitoring.logAnalyticsWorkspaceId,
  logAnalyticsCustomerId: monitoring.logAnalyticsCustomerId,
  logAnalyticsSharedKey: monitoring.logAnalyticsSharedKey,
  appInsightsConnectionString: monitoring.appInsightsConnectionString,
}, { dependsOn: [keyVault] });

// Container app metric alerts — must scope to the individual resource, not the resource group
new azure.insights.MetricAlert("alert-container-restarts", {
  ruleName: `container-restarts-${environment}`,
  resourceGroupName: resourceGroup.name,
  location: "Global",
  description: "Alert when container restart count exceeds zero",
  severity: 2,
  enabled: true,
  evaluationFrequency: "PT5M",
  windowSize: "PT15M",
  scopes: [containerApp.containerAppId],
  criteria: {
    odataType: "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria",
    allOf: [
      {
        criterionType: "StaticThresholdCriterion",
        name: "RestartCount",
        metricName: "RestartCount",
        metricNamespace: "Microsoft.App/containerApps",
        operator: "GreaterThan",
        threshold: 0,
        timeAggregation: "Total",
      },
    ],
  },
  actions: [{ actionGroupId: monitoring.actionGroupId }],
  tags,
});

new azure.insights.MetricAlert("alert-client-errors", {
  ruleName: `client-errors-${environment}`,
  resourceGroupName: resourceGroup.name,
  location: "Global",
  description: "Alert when client error (4xx) responses are detected",
  severity: 2,
  enabled: true,
  evaluationFrequency: "PT5M",
  windowSize: "PT15M",
  scopes: [containerApp.containerAppId],
  criteria: {
    odataType: "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria",
    allOf: [
      {
        criterionType: "StaticThresholdCriterion",
        name: "ClientErrors",
        metricName: "Requests",
        metricNamespace: "Microsoft.App/containerApps",
        operator: "GreaterThan",
        threshold: 0,
        timeAggregation: "Total",
        dimensions: [
          {
            name: "statusCodeCategory",
            operator: "Include",
            values: ["4xx"],
          },
        ],
      },
    ],
  },
  actions: [{ actionGroupId: monitoring.actionGroupId }],
  tags,
});

if (environment === "prod") {
  new azure.insights.MetricAlert("alert-replica-zero", {
    ruleName: `replica-zero-${environment}`,
    resourceGroupName: resourceGroup.name,
    location: "Global",
    description: "Alert when running replica count drops to zero in production",
    severity: 1,
    enabled: true,
    evaluationFrequency: "PT1M",
    windowSize: "PT5M",
    scopes: [containerApp.containerAppId],
    criteria: {
      odataType: "Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria",
      allOf: [
        {
          criterionType: "StaticThresholdCriterion",
          name: "RunningReplicas",
          metricName: "Replicas",
          metricNamespace: "Microsoft.App/containerApps",
          operator: "LessThanOrEqual",
          threshold: 0,
          timeAggregation: "Average",
        },
      ],
    },
    actions: [{ actionGroupId: monitoring.actionGroupId }],
    tags,
  });
}

// Workbook dashboards
void new WorkbookStack("workbooks", {
  environment,
  region,
  instance,
  resourceGroupName: resourceGroup.name,
  tags,
  appInsightsId: monitoring.appInsightsId,
});

// Application Gateway stack (prod only, when enabled)
if (enableAppGateway && environment === "prod") {
  const gateway = new GatewayStack("gateway", {
    environment,
    region,
    instance,
    resourceGroupName: resourceGroup.name,
    tags,
    agwSubnetId: network.agwSubnetId!,
    publicIpId: network.publicIpId!,
    containerAppFqdn: containerApp.containerAppFqdn,
    logAnalyticsWorkspaceId: monitoring.logAnalyticsWorkspaceId,
  });

  addDiagnosticSettings("agw", gateway.gatewayId, monitoring.logAnalyticsWorkspaceId);
}

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
export const dceEndpoint = dataCollection.dceEndpoint;
export const dcrImmutableId = dataCollection.dcrImmutableId;
