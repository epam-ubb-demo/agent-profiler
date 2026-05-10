import type * as pulumi from "@pulumi/pulumi";

export interface SharedArgs {
  environment: string;
  region: string;
  instance: string;
  resourceGroupName: pulumi.Output<string>;
  tags: Record<string, string>;
}

export interface NetworkOutputs {
  vnetId: pulumi.Output<string>;
  vnetName: pulumi.Output<string>;
  acaSubnetId: pulumi.Output<string>;
  agwSubnetId?: pulumi.Output<string> | undefined;
}

export interface MonitoringOutputs {
  logAnalyticsWorkspaceId: pulumi.Output<string>;
  appInsightsId: pulumi.Output<string>;
  appInsightsConnectionString: pulumi.Output<string>;
  appInsightsInstrumentationKey: pulumi.Output<string>;
}

export interface ContainerAppOutputs {
  caeId: pulumi.Output<string>;
  containerAppId: pulumi.Output<string>;
  containerAppFqdn: pulumi.Output<string>;
}
