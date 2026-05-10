// Naming convention following Azure Cloud Adoption Framework
// Pattern: <abbreviation>-<workload>-<environment>-<region>-<instance>

export interface NamingArgs {
  environment: string;
  region: string;
  instance: string;
}

export function azureName(
  abbreviation: string,
  workload: string,
  args: NamingArgs,
): string {
  return `${abbreviation}-${workload}-${args.environment}-${args.region}-${args.instance}`;
}

// Key Vault has 24-char limit — omit region
export function keyVaultName(workload: string, args: NamingArgs): string {
  return `kv-${workload}-${args.environment}-${args.instance}`;
}

// Pre-defined resource name generators
export function resourceGroupName(args: NamingArgs): string {
  return azureName("rg", "otel", args);
}

export function vnetName(args: NamingArgs): string {
  return azureName("vnet", "otel", args);
}

export function subnetName(component: string, args: NamingArgs): string {
  return azureName("snet", component, args);
}

export function nsgName(component: string, args: NamingArgs): string {
  return azureName("nsg", component, args);
}

export function pipName(component: string, args: NamingArgs): string {
  return azureName("pip", component, args);
}

export function agwName(args: NamingArgs): string {
  return azureName("agw", "otel", args);
}

export function caeName(args: NamingArgs): string {
  return azureName("cae", "otel", args);
}

export function containerAppName(args: NamingArgs): string {
  return azureName("ca", "otelcol", args);
}

export function kvName(args: NamingArgs): string {
  return keyVaultName("otel", args);
}

export function managedIdentityName(args: NamingArgs): string {
  return azureName("id", "otelcol", args);
}

export function logAnalyticsName(args: NamingArgs): string {
  return azureName("log", "otel", args);
}

export function appInsightsName(args: NamingArgs): string {
  return azureName("appi", "otel", args);
}

export function privateEndpointName(
  service: string,
  args: NamingArgs,
): string {
  return azureName("pep", service, args);
}

export function actionGroupName(args: NamingArgs): string {
  return azureName("ag", "otel", args);
}
