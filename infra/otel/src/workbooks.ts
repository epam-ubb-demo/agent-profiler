// Application Insights workbook dashboards for OTel Gateway observability
// Provides overview, Copilot usage, and health dashboards as Azure Workbooks

import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import type { SharedArgs } from "./types.js";
import { azureName } from "./naming.js";

export interface WorkbookArgs extends SharedArgs {
  appInsightsId: pulumi.Output<string>;
  logAnalyticsWorkspaceId: pulumi.Output<string>;
}

export class WorkbookStack extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: WorkbookArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:dashboards:WorkbookStack", name, {}, opts);

    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    // 1. OTel Gateway Overview workbook
    new azure.insights.Workbook(
      "wb-otel-overview",
      {
        resourceName: azureName("wb", "otel-overview", namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        kind: "shared",
        displayName: "OTel Gateway Overview",
        category: "workbook",
        sourceId: args.appInsightsId,
        serializedData: JSON.stringify({
          version: "Notebook/1.0",
          items: [
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "union requests, dependencies, traces, customMetrics",
                  "| summarize count() by itemType, bin(timestamp, 1h)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Ingestion Volume Over Time",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "customMetrics",
                  '| where name == "gen_ai.client.token.usage"',
                  '| extend model = tostring(customDimensions["gen_ai.response.model"])',
                  "| summarize totalTokens = sum(value) by model",
                  "| top 10 by totalTokens desc",
                ].join("\n"),
                size: 1,
                title: "Top 10 Models by Token Usage",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "requests",
                  '| where resultCode startswith "4" or resultCode startswith "5"',
                  "| summarize errorCount = count() by bin(timestamp, 1h),",
                  '    errorCategory = iff(resultCode startswith "4", "4xx", "5xx")',
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Error Rate (4xx/5xx) Over Time",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
          ],
        }),
        tags: args.tags,
      },
      { parent: this },
    );

    // 2. Copilot Usage Dashboard
    new azure.insights.Workbook(
      "wb-copilot-usage",
      {
        resourceName: azureName("wb", "copilot-usage", namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        kind: "shared",
        displayName: "Copilot Usage Dashboard",
        category: "workbook",
        sourceId: args.appInsightsId,
        serializedData: JSON.stringify({
          version: "Notebook/1.0",
          items: [
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "customMetrics",
                  '| where name == "gen_ai.client.token.usage"',
                  '| extend model = tostring(customDimensions["gen_ai.response.model"])',
                  "| summarize totalTokens = sum(value) by model, bin(timestamp, 1h)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Token Usage by Model",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "requests",
                  '| extend pseudoId = tostring(customDimensions["enduser.pseudo.id"]),',
                  '         cost = todouble(customDimensions["github.copilot.cost"])',
                  "| summarize totalCost = sum(cost) by pseudoId",
                  "| top 20 by totalCost desc",
                ].join("\n"),
                size: 1,
                title: "Cost Breakdown by Pseudo User",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "dependencies",
                  '| where type == "execute_tool"',
                  '| extend toolName = tostring(customDimensions["tool.name"]),',
                  '         success = tobool(customDimensions["tool.success"])',
                  "| summarize calls = count(), failures = countif(success == false) by toolName",
                  "| extend successRate = round(100.0 * (calls - failures) / calls, 1)",
                  "| order by calls desc",
                ].join("\n"),
                size: 1,
                title: "Tool Call Frequency and Success Rate",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "requests",
                  '| where name == "invoke_agent"',
                  "| summarize percentiles(duration, 50, 90, 95, 99) by bin(timestamp, 1h)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Agent Invocation Duration Percentiles",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
          ],
        }),
        tags: args.tags,
      },
      { parent: this },
    );

    // 3. Gateway Health Dashboard
    new azure.insights.Workbook(
      "wb-gateway-health",
      {
        resourceName: azureName("wb", "gateway-health", namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        kind: "shared",
        displayName: "Gateway Health Dashboard",
        category: "workbook",
        sourceId: args.appInsightsId,
        serializedData: JSON.stringify({
          version: "Notebook/1.0",
          items: [
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "customMetrics",
                  '| where name == "container.restarts"',
                  "| summarize restarts = sum(value) by bin(timestamp, 1h)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Container Restarts Over Time",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "customMetrics",
                  '| where name == "process.memory.usage" or name == "otelcol_memory_limiter_threshold"',
                  "| summarize avgValue = avg(value) by name, bin(timestamp, 5m)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Memory Usage vs Limiter Threshold",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "customMetrics",
                  '| where name == "otelcol_exporter_queue_size"',
                  "| summarize avgDepth = avg(value) by bin(timestamp, 5m)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Batch Processor Queue Depth",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
            {
              type: 3,
              content: {
                version: "KqlItem/1.0",
                query: [
                  "requests",
                  '| where name == "health" or url endswith "/health"',
                  "| summarize avgDuration = avg(duration) by bin(timestamp, 5m)",
                  "| render timechart",
                ].join("\n"),
                size: 1,
                title: "Health Probe Response Time",
                timeContext: { durationMs: 86400000 },
                queryType: 0,
                resourceType: "microsoft.insights/components",
              },
            },
          ],
        }),
        tags: args.tags,
      },
      { parent: this },
    );

    this.registerOutputs({});
  }
}
