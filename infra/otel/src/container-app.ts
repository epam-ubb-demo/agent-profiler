// Container App resources for the OTel Collector deployment
// Provisions Container Apps Environment and the OTel Collector Container App

import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as azure from "@pulumi/azure-native";
import * as azureApp from "@pulumi/azure-native/app/v20240301/index.js";
import * as pulumi from "@pulumi/pulumi";

import { caeName, containerAppName } from "./naming.js";
import type { SharedArgs } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ContainerAppArgs extends SharedArgs {
  acaSubnetId: pulumi.Output<string>;
  logAnalyticsWorkspaceId: pulumi.Output<string>;
  logAnalyticsCustomerId: pulumi.Output<string>;
  logAnalyticsSharedKey: pulumi.Output<string>;
  appInsightsConnectionString: pulumi.Output<string>;
}

/**
 * Container App stack component resource.
 *
 * Provisions a Container Apps Environment and the OTel Collector
 * Container App with environment-specific configuration, scaling,
 * ingress rules, and health probes.
 */
export class ContainerAppStack extends pulumi.ComponentResource {
  public readonly caeId: pulumi.Output<string>;
  public readonly containerAppId: pulumi.Output<string>;
  public readonly containerAppFqdn: pulumi.Output<string>;

  constructor(
    name: string,
    args: ContainerAppArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("agent-profiler:container:ContainerAppStack", name, {}, opts);

    const config = new pulumi.Config();
    const namingArgs = {
      environment: args.environment,
      region: args.region,
      instance: args.instance,
    };

    const isProd = args.environment === "prod";
    const isDemo = args.environment === "demo";

    // Read replica config
    const minReplicas = config.getNumber("minReplicas") ?? 0;
    const maxReplicas = config.getNumber("maxReplicas") ?? 2;

    // Read OTel collector image config
    const otelCollectorImage =
      config.get("otelCollectorImage") ?? "otel/opentelemetry-collector-contrib";
    const otelCollectorTag = config.get("otelCollectorTag") ?? "0.102.0";

    // Read allowed IP ranges for demo
    const allowedIpRanges = config.get("allowedIpRanges");
    const publicAccess = config.getBoolean("publicAccess") ?? false;

    // Resource protection for prod
    const enableResourceLocks =
      config.getBoolean("enableResourceLocks") ?? false;

    // --- Read OTel Collector config file ---
    // Determine which config file to use based on environment
    const configDir = join(__dirname, "..", "config");
    let configFileName: string;
    if (isProd) {
      configFileName = "otel-collector.prod.yaml";
    } else if (isDemo) {
      configFileName = "otel-collector.demo.yaml";
    } else {
      configFileName = "otel-collector.yaml";
    }
    const otelConfigContent = fs.readFileSync(
      join(configDir, configFileName),
      "utf-8",
    );

    // --- Container Apps Environment ---
    const cae = new azureApp.ManagedEnvironment(
      "cae",
      {
        environmentName: caeName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        location: args.region,
        zoneRedundant: isProd,
        vnetConfiguration: {
          infrastructureSubnetId: args.acaSubnetId,
        },
        appLogsConfiguration: {
          destination: "log-analytics",
          logAnalyticsConfiguration: {
            customerId: args.logAnalyticsCustomerId,
            sharedKey: args.logAnalyticsSharedKey,
          },
        },
        tags: args.tags,
      },
      { parent: this },
    );

    // --- Resource limits per environment ---
    const cpuLimit = isProd ? 1.0 : 0.25;
    const memoryLimit = isProd ? "2Gi" : "1Gi"; // Demo tier: 1Gi container; memory_limiter capped at 600+150=750 MiB (~274 MiB headroom)

    // --- Ingress configuration ---
    // External ingress only for demo with public access enabled
    const ingressExternal = isDemo && publicAccess;
    // ACA implicitly denies everything not in the allow list — no explicit deny-all rule needed
    const ipSecurityRestrictions =
      ingressExternal && allowedIpRanges
        ? allowedIpRanges.split(",").map((cidr, index) => ({
            name: `allow-range-${index}`,
            ipAddressRange: cidr.trim(),
            action: "Allow" as string,
          }))
        : undefined;

    // --- Container App ---
    const containerApp = new azureApp.ContainerApp(
      "container-app",
      {
        containerAppName: containerAppName(namingArgs),
        resourceGroupName: args.resourceGroupName,
        managedEnvironmentId: cae.id,
        configuration: {
          secrets: [
            {
              name: "appinsights-connection-string",
              value: args.appInsightsConnectionString,
            },
            {
              name: "otel-collector-config",
              value: otelConfigContent,
            },
          ],
          ingress: {
            external: ingressExternal,
            targetPort: 4318,
            transport: "http",
            ...(ipSecurityRestrictions !== undefined
              ? { ipSecurityRestrictions }
              : {}),
          },
        },
        template: {
          containers: [
            {
              name: "otel-collector",
              image: `${otelCollectorImage}:${otelCollectorTag}`,
              resources: {
                cpu: cpuLimit,
                memory: memoryLimit,
              },
              args: [
                "--config=/etc/otelcol-contrib/otel-collector-config",
              ],
              env: [
                {
                  name: "APPLICATIONINSIGHTS_CONNECTION_STRING",
                  secretRef: "appinsights-connection-string",
                },
                {
                  name: "ENV",
                  value: args.environment,
                },
                {
                  name: "OTEL_SAMPLING_PERCENTAGE",
                  value: String(config.getNumber("samplingPercentage") ?? 10),
                },
              ],
              volumeMounts: [
                {
                  volumeName: "otel-config",
                  mountPath: "/etc/otelcol-contrib",
                },
              ],
              probes: [
                {
                  type: "Liveness",
                  httpGet: {
                    port: 13133,
                    path: "/",
                  },
                  periodSeconds: 10,
                  failureThreshold: 3,
                },
                {
                  type: "Readiness",
                  httpGet: {
                    port: 13133,
                    path: "/",
                  },
                  periodSeconds: 5,
                  initialDelaySeconds: 5,
                },
              ],
            },
          ],
          scale: {
            minReplicas,
            maxReplicas,
            rules: [
              {
                name: "http-scaling",
                http: {
                  metadata: {
                    concurrentRequests: "50",
                  },
                },
              },
            ],
          },
          volumes: [
            {
              name: "otel-config",
              storageType: "Secret",
              secrets: [
                {
                  secretRef: "otel-collector-config",
                  path: "otel-collector-config",
                },
              ],
            },
          ],
        },
        tags: args.tags,
      },
      {
        parent: this,
        protect: isProd,
        retainOnDelete: isProd,
      },
    );

    // --- Resource lock (prod only) ---
    if (enableResourceLocks && isProd) {
      new azure.authorization.ManagementLockByScope(
        "lock-container-app",
        {
          lockName: "CanNotDelete-container-app",
          scope: containerApp.id,
          level: "CanNotDelete",
          notes: "Prevent accidental deletion of OTel Collector Container App",
        },
        { parent: this },
      );
    }

    // --- Outputs ---
    this.caeId = cae.id;
    this.containerAppId = containerApp.id;
    this.containerAppFqdn = containerApp.latestRevisionFqdn.apply(
      (fqdn) => fqdn ?? "",
    );

    this.registerOutputs({
      caeId: this.caeId,
      containerAppId: this.containerAppId,
      containerAppFqdn: this.containerAppFqdn,
    });
  }
}
