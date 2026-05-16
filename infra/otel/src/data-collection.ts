/**
 * Pulumi component that provisions the Azure Monitor Data Collection
 * infrastructure required for the DCR custom-table enrichment sink.
 *
 * Resources created:
 *  - Data Collection Endpoint (DCE) — public-ingestion enabled
 *  - Data Collection Rule (DCR) — declares the AgentSessionEvents_CL stream
 *    and routes it to the shared Log Analytics workspace
 *
 * Outputs:
 *  - `dceEndpoint`   — ingestion URL required by `@agent-profiler/sink-dcr`
 *  - `dcrImmutableId` — immutable rule ID required by `@agent-profiler/sink-dcr`
 */

import * as pulumi from "@pulumi/pulumi";
import * as insights from "@pulumi/azure-native/insights/v20220601/index.js";

import { dceName, dcrName } from "./naming.js";
import type { SharedArgs } from "./types.js";

// ---------------------------------------------------------------------------
// Constants shared between the DCR stream declaration and the sink package.
// ---------------------------------------------------------------------------

/** Custom stream name used in the DCR declaration and the SDK upload call. */
export const STREAM_NAME = "Custom-AgentSessionEvents_CL";

/** Friendly name for the Log Analytics destination within the DCR. */
const LAW_DESTINATION_NAME = "law-enrichment";

// ---------------------------------------------------------------------------
// DataCollectionStack
// ---------------------------------------------------------------------------

export interface DataCollectionArgs extends SharedArgs {
  /** Resource ID of the Log Analytics workspace to route events to. */
  logAnalyticsWorkspaceId: pulumi.Input<string>;
}

/**
 * Pulumi ComponentResource that provisions a DCE and DCR for the
 * AgentSessionEvents_CL custom table.
 */
export class DataCollectionStack extends pulumi.ComponentResource {
  /** DCE ingestion URL — pass as `endpoint` to `DcrEnrichmentSink`. */
  readonly dceEndpoint: pulumi.Output<string>;

  /** DCR immutable ID — pass as `ruleId` to `DcrEnrichmentSink`. */
  readonly dcrImmutableId: pulumi.Output<string>;

  constructor(name: string, args: DataCollectionArgs, opts?: pulumi.ComponentResourceOptions) {
    super("agent-profiler:monitoring:DataCollectionStack", name, {}, opts);

    const namingArgs = {
      environment: args.environment,
      region:      args.region,
      instance:    args.instance,
    };

    // ------------------------------------------------------------------
    // Data Collection Endpoint
    // ------------------------------------------------------------------
    const dce = new insights.DataCollectionEndpoint(
      `${name}-dce`,
      {
        dataCollectionEndpointName: dceName(namingArgs),
        resourceGroupName:          args.resourceGroupName,
        location:                   args.region,
        networkAcls: {
          publicNetworkAccess: "Enabled",
        },
        tags: args.tags,
      },
      { parent: this },
    );

    // logsIngestion.endpoint is a required string on the inner type;
    // the Output wraps DataCollectionEndpointResponseLogsIngestion | undefined.
    this.dceEndpoint = dce.logsIngestion.apply(li => li?.endpoint ?? "");

    // ------------------------------------------------------------------
    // Data Collection Rule
    // ------------------------------------------------------------------
    const dcr = new insights.DataCollectionRule(
      `${name}-dcr`,
      {
        dataCollectionRuleName:   dcrName(namingArgs),
        resourceGroupName:        args.resourceGroupName,
        location:                 args.region,
        dataCollectionEndpointId: dce.id,

        // Stream declaration — column names and types must match DcrRow.
        streamDeclarations: {
          [STREAM_NAME]: {
            columns: [
              { name: "TimeGenerated",  type: "datetime" },
              { name: "EventTs",        type: "datetime" },
              { name: "PushedAt",       type: "datetime" },
              { name: "EventId",        type: "string"   },
              { name: "SessionId",      type: "string"   },
              { name: "Tool",           type: "string"   },
              { name: "ToolVersion",    type: "string"   },
              { name: "Category",       type: "string"   },
              { name: "PayloadSchema",  type: "string"   },
              { name: "SourceMachine",  type: "string"   },
              { name: "SourceUser",     type: "string"   },
              { name: "TenantId",       type: "string"   },
              { name: "Payload",        type: "string"   },
              { name: "Ordinal",        type: "long"     },
              { name: "SchemaVersion",  type: "int"      },
            ],
          },
        },

        destinations: {
          logAnalytics: [
            {
              name:                LAW_DESTINATION_NAME,
              workspaceResourceId: args.logAnalyticsWorkspaceId,
            },
          ],
        },

        dataFlows: [
          {
            streams:      [STREAM_NAME],
            destinations: [LAW_DESTINATION_NAME],
            outputStream: STREAM_NAME,
          },
        ],

        tags: args.tags,
      },
      { parent: this, dependsOn: [dce] },
    );

    this.dcrImmutableId = dcr.immutableId;

    this.registerOutputs({
      dceEndpoint:    this.dceEndpoint,
      dcrImmutableId: this.dcrImmutableId,
    });
  }
}
