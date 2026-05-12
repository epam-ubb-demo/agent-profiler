// Monitoring resources for the OTel Gateway infrastructure
// Creates Log Analytics, Application Insights, action groups, metric alerts,
// diagnostic settings helper, and optional resource locks.

import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";

import {
  actionGroupName,
  appInsightsName,
  logAnalyticsName,
} from "./naming.js";
import type { SharedArgs } from "./types.js";

export type MonitoringArgs = SharedArgs;

/**
 * Monitoring stack component resource.
 *
 * Provisions Log Analytics Workspace, Application Insights (workspace-based),
 * an action group, metric alert rules, and conditional resource locks for
 * production environments.
 */
export class MonitoringStack extends pulumi.ComponentResource {
  public readonly logAnalyticsWorkspaceId: pulumi.Output<string>;
  public readonly logAnalyticsCustomerId: pulumi.Output<string>;
  public readonly logAnalyticsSharedKey: pulumi.Output<string>;
  public readonly appInsightsId: pulumi.Output<string>;
  public readonly appInsightsConnectionString: pulumi.Output<string>;
  public readonly appInsightsInstrumentationKey: pulumi.Output<string>;
  public readonly actionGroupId: pulumi.Output<string>;

  constructor(
    name: string,
    args: MonitoringArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:monitoring:MonitoringStack", name, {}, opts);

    const config = new pulumi.Config();
    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    const logRetentionDays = config.getNumber("logRetentionDays") ?? 30;
    const enableResourceLocks =
      config.getBoolean("enableResourceLocks") ?? false;

    const clientConfig = azure.authorization.getClientConfigOutput();

    // --- Log Analytics Workspace ---
    const logAnalytics = new azure.operationalinsights.Workspace(
      "log-analytics",
      {
        workspaceName: logAnalyticsName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        sku: { name: "PerGB2018" },
        retentionInDays: logRetentionDays,
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Application Insights (workspace-based) ---
    const appInsights = new azure.insights.Component(
      "app-insights",
      {
        resourceName: appInsightsName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        kind: "web",
        applicationType: "web",
        workspaceResourceId: logAnalytics.id,
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Action Group ---
    const actionGroup = new azure.insights.ActionGroup(
      "action-group",
      {
        actionGroupName: actionGroupName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: "Global",
        groupShortName: "otel-alerts",
        enabled: true,
        emailReceivers: [
          {
            name: "otel-alerts-email",
            emailAddress: "otel-alerts@example.com",
            useCommonAlertSchema: true,
          },
        ],
        tags: args.tags,
      },
      { parent: this },
    );

    const actionGroupId = actionGroup.id;

    // 4. Key Vault access denied
    new azure.insights.MetricAlert(
      "alert-kv-denied",
      {
        ruleName: `kv-access-denied-${args.environment}`,
        resourceGroupName: args.resourceGroupName,
        location: "Global",
        description: "Alert when Key Vault access is denied",
        severity: 2,
        enabled: true,
        evaluationFrequency: "PT5M",
        windowSize: "PT15M",
        scopes: [pulumi.interpolate`/subscriptions/${clientConfig.subscriptionId}/resourceGroups/${args.resourceGroupName}`],
        targetResourceType: "Microsoft.KeyVault/vaults",
        targetResourceRegion: args.region,
        criteria: {
          odataType:
            "Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria",
          allOf: [
            {
              criterionType: "StaticThresholdCriterion",
              name: "KvUnauthorised",
              metricName: "ServiceApiResult",
              metricNamespace: "Microsoft.KeyVault/vaults",
              operator: "GreaterThan",
              threshold: 0,
              timeAggregation: "Total",
              dimensions: [
                {
                  name: "StatusCode",
                  operator: "Include",
                  values: ["401", "403"],
                },
              ],
            },
          ],
        },
        actions: [{ actionGroupId }],
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Resource Locks (prod only) ---
    if (enableResourceLocks && args.environment === "prod") {
      new azure.authorization.ManagementLockByScope(
        "lock-log-analytics",
        {
          lockName: "CanNotDelete-log-analytics",
          scope: logAnalytics.id,
          level: "CanNotDelete",
          notes: "Prevent accidental deletion of Log Analytics workspace",
        },
        { parent: this },
      );

      new azure.authorization.ManagementLockByScope(
        "lock-app-insights",
        {
          lockName: "CanNotDelete-app-insights",
          scope: appInsights.id,
          level: "CanNotDelete",
          notes: "Prevent accidental deletion of Application Insights",
        },
        { parent: this },
      );
    }

    // --- Outputs ---
    this.logAnalyticsWorkspaceId = logAnalytics.id;
    this.logAnalyticsCustomerId = logAnalytics.customerId.apply((id) => id ?? "");
    this.logAnalyticsSharedKey = azure.operationalinsights
      .getSharedKeysOutput(
        {
          resourceGroupName: args.resourceGroupName,
          workspaceName: logAnalytics.name,
        },
        { dependsOn: logAnalytics },
      )
      .apply((k) => k.primarySharedKey ?? "");
    this.appInsightsId = appInsights.id;
    this.appInsightsConnectionString = appInsights.connectionString.apply(
      (cs) => cs ?? "",
    );
    this.appInsightsInstrumentationKey =
      appInsights.instrumentationKey.apply((key) => key ?? "");
    this.actionGroupId = actionGroup.id;

    this.registerOutputs({
      logAnalyticsWorkspaceId: this.logAnalyticsWorkspaceId,
      logAnalyticsCustomerId: this.logAnalyticsCustomerId,
      logAnalyticsSharedKey: this.logAnalyticsSharedKey,
      appInsightsId: this.appInsightsId,
      appInsightsConnectionString: this.appInsightsConnectionString,
      appInsightsInstrumentationKey: this.appInsightsInstrumentationKey,
      actionGroupId: this.actionGroupId,
    });
  }
}

/**
 * Add diagnostic settings to a resource, forwarding logs and metrics
 * to the specified Log Analytics workspace.
 *
 * This is an exported helper for use by other infrastructure modules (F7.2, F7.3).
 * Networking resources are owned by NetworkStack, so diagnostic settings for the
 * VNet are wired in index.ts rather than here.
 */
export function addDiagnosticSettings(
  resourceName: string,
  resourceId: pulumi.Input<string>,
  logAnalyticsWorkspaceId: pulumi.Input<string>,
  parent?: pulumi.Resource,
): azure.insights.DiagnosticSetting {
  const opts: pulumi.ComponentResourceOptions = {};
  if (parent !== undefined) {
    opts.parent = parent;
  }
  return new azure.insights.DiagnosticSetting(
    `diag-${resourceName}`,
    {
      name: `diag-${resourceName}`,
      resourceUri: resourceId,
      workspaceId: logAnalyticsWorkspaceId,
      logs: [
        {
          categoryGroup: "allLogs",
          enabled: true,
        },
      ],
      metrics: [
        {
          category: "AllMetrics",
          enabled: true,
        },
      ],
    },
    opts,
  );
}
