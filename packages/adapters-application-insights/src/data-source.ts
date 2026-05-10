/**
 * Application Insights session data source.
 *
 * Implements the {@link SessionDataSource} contract by querying an
 * Azure Log Analytics workspace through the {@link QueryClient}.
 */

import type { Session } from '@agent-profiler/core';
import type {
  AdapterType,
  SessionDataSource,
  SessionListItem,
} from '@agent-profiler/data-source';
import type { TokenCredential } from '@azure/identity';

import { QueryClient } from './query-client';
import { assembleSession } from './session-assembler';
import type { TimeRange } from './types';

// ---------------------------------------------------------------------------
// Cache interface
// ---------------------------------------------------------------------------

/** Extension point for caching assembled sessions. Not implemented in this package. */
export interface SessionCache {
  get(sessionId: string): Session | undefined;
  set(sessionId: string, session: Session): void;
  has(sessionId: string): boolean;
  delete(sessionId: string): boolean;
  clear(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 7;

/** Pattern for valid session IDs — alphanumeric, hyphens, underscores, and dots. */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_.\-]+$/;

/** Validate a session ID. Returns the ID if valid, or `null` for invalid input. */
function validateSessionId(raw: string): string | null {
  if (raw.length === 0 || !SESSION_ID_PATTERN.test(raw)) {
    return null;
  }
  return raw;
}

/** Build a default time range covering the last N days from now. */
function defaultTimeRange(days: number = DEFAULT_DAYS): TimeRange {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1_000);
  return { startTime, endTime };
}

// ---------------------------------------------------------------------------
// KQL queries
// ---------------------------------------------------------------------------

const LIST_SESSIONS_KQL = `let sessionSpans = AppDependencies
| union AppRequests
| where isnotempty(customDimensions)
| extend sessionId = iif(
    isnotempty(tostring(customDimensions.["copilot_chat.session.id"])),
    tostring(customDimensions.["copilot_chat.session.id"]),
    operation_Id
  )
| where isnotempty(sessionId);
sessionSpans
| summarize
    startTs = min(timestamp),
    endTs = max(timestamp),
    spanCount = count(),
    selectedModel = take_any(tostring(customDimensions.["gen_ai.request.model"]))
  by sessionId
| order by startTs desc
| take 200`;

function buildGetSessionKql(sessionId: string): string {
  // sessionId is already validated by validateSessionId
  return `let targetSession = "${sessionId}";
AppDependencies
| union AppRequests
| where operation_Id == targetSession
    or tostring(customDimensions.["copilot_chat.session.id"]) == targetSession
| project
    id,
    operation_Id,
    operation_ParentId,
    name,
    timestamp,
    duration,
    success,
    customDimensions
| order by timestamp asc`;
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

/**
 * {@link SessionDataSource} backed by Azure Application Insights.
 *
 * All public methods follow the "never throw" contract —
 * errors are caught and safe defaults are returned.
 */
export class ApplicationInsightsDataSource implements SessionDataSource {
  readonly type: AdapterType = 'application-insights';

  private readonly queryClient: QueryClient;
  private readonly workspaceId: string;
  private readonly timeRange: TimeRange | undefined;
  private readonly cache: SessionCache | undefined;

  constructor(config: {
    workspaceId: string;
    credential?: TokenCredential | undefined;
    timeRange?: TimeRange | undefined;
    cache?: SessionCache | undefined;
  }) {
    this.workspaceId = config.workspaceId;
    this.timeRange = config.timeRange;
    this.cache = config.cache;
    this.queryClient = new QueryClient({
      workspaceId: config.workspaceId,
      credential: config.credential,
    });
  }

  // -----------------------------------------------------------------------
  // SessionDataSource implementation
  // -----------------------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      return await this.queryClient.testConnection();
    } catch {
      return false;
    }
  }

  async listSessions(): Promise<SessionListItem[]> {
    try {
      const range = this.timeRange ?? defaultTimeRange();
      const result = await this.queryClient.query(LIST_SESSIONS_KQL, range);

      return result.rows
        .map((row) => {
          const sessionId = String(row['sessionId'] ?? '');
          const rawStartTs = row['startTs'];
          const createdAt =
            rawStartTs instanceof Date
              ? rawStartTs
              : new Date(String(rawStartTs ?? ''));

          return {
            id: sessionId,
            name: sessionId,
            path: `ai://${this.workspaceId}/${sessionId}`,
            createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(0),
            adapter: 'application-insights' as const,
          };
        })
        .filter((item) => item.id !== '');
    } catch {
      return [];
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const validId = validateSessionId(sessionId);
      if (validId === null) {
        return null;
      }

      // Check cache first
      const cached = this.cache?.get(validId);
      if (cached !== undefined) {
        return cached;
      }

      const range = this.timeRange ?? defaultTimeRange();
      const kql = buildGetSessionKql(validId);
      const result = await this.queryClient.query(kql, range);

      if (result.rows.length === 0) {
        return null;
      }

      const session = assembleSession(result.rows);

      // Store in cache if available
      if (this.cache) {
        this.cache.set(validId, session);
      }

      return session;
    } catch {
      return null;
    }
  }
}
