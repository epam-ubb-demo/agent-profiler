import type { TokenCredential } from '@azure/identity';

/** Configuration for the Application Insights query client. */
export interface AppInsightsConfig {
  /** Azure Log Analytics Workspace ID. */
  readonly workspaceId: string;
  /** Optional custom credential (defaults to DefaultAzureCredential). */
  readonly credential?: TokenCredential | undefined;
  /** Query timeout in milliseconds (default: 60_000). */
  readonly timeoutMs?: number | undefined;
}

/** Time range for queries. */
export interface TimeRange {
  readonly startTime: Date;
  readonly endTime: Date;
}

/** Typed query result. */
export interface QueryResult {
  /** Rows returned by the query, each as a key-value record. */
  readonly rows: Record<string, unknown>[];
}

/** Base domain error for Application Insights operations. */
export class AppInsightsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppInsightsError';
  }
}

/** Raised when Azure credential resolution or authentication fails. */
export class AuthenticationError extends AppInsightsError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_FAILED');
    this.name = 'AuthenticationError';
  }
}

/** Raised when the target Log Analytics workspace cannot be found. */
export class WorkspaceNotFoundError extends AppInsightsError {
  constructor(workspaceId: string) {
    super(`Workspace not found: ${workspaceId}`, 'WORKSPACE_NOT_FOUND');
    this.name = 'WorkspaceNotFoundError';
  }
}

/** Raised when a KQL query exceeds the configured timeout. */
export class QueryTimeoutError extends AppInsightsError {
  constructor(timeoutMs: number) {
    super(`Query timed out after ${timeoutMs}ms`, 'QUERY_TIMEOUT');
    this.name = 'QueryTimeoutError';
  }
}
