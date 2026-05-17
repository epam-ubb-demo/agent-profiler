/**
 * Cross-cutting tenant/user identity configuration.
 * Injected into the sync orchestrator so every outbound event
 * carries the configured partition keys (ADR-0016).
 */
export interface TenantConfig {
  /** Workspace or team identifier. When absent, sessions are "personal". */
  readonly tenantId?: string | undefined;
  /** Individual contributor identifier. When absent, only per-machine views available. */
  readonly userId?: string | undefined;
}
