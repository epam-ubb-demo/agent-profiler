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

/**
 * Extension point for caching assembled sessions.
 *
 * Not implemented in this package — consumers provide their own
 * implementation. Designed to support future offline mode where
 * previously-fetched sessions remain accessible without network
 * connectivity.
 *
 * @remarks
 * Cache implementations should be resilient to storage failures;
 * the data source treats all cache operations as best-effort and
 * falls back to live queries when the cache is unavailable.
 */
export interface SessionCache {
  /** Retrieve a previously cached session, or `undefined` if not cached or stale. */
  get(sessionId: string): Session | undefined;

  /** Store an assembled session for later retrieval. Replaces any existing entry. */
  set(sessionId: string, session: Session): void;

  /** Check whether a valid (non-stale) cache entry exists for the given session. */
  has(sessionId: string): boolean;

  /** Remove a session from the cache entirely. Returns `true` if an entry was removed. */
  delete(sessionId: string): boolean;

  /**
   * Mark a cached session as stale so the next access triggers a refresh.
   * Implementations may choose to remove the entry immediately or flag it.
   */
  invalidate(sessionId: string): void;

  /** Remove all cached sessions. Typically called when the workspace ID or time range changes. */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 7;

/** Pattern for valid session IDs — alphanumeric, hyphens, underscores, and dots. */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_.\-]+$/;

/** Maximum allowed length for a session ID to prevent oversized KQL literals. */
const MAX_SESSION_ID_LENGTH = 256;

/** Validate a session ID. Returns the ID if valid, or `null` for invalid input. */
function validateSessionId(raw: string): string | null {
  if (raw.length === 0 || raw.length > MAX_SESSION_ID_LENGTH || !SESSION_ID_PATTERN.test(raw)) {
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
    maxSpanCount?: number | undefined;
  }) {
    this.workspaceId = config.workspaceId;
    this.timeRange = config.timeRange;
    this.cache = config.cache;
    this.queryClient = new QueryClient({
      workspaceId: config.workspaceId,
      credential: config.credential,
      maxSpanCount: config.maxSpanCount,
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
        .flatMap((row) => {
          const raw = String(row['sessionId'] ?? '');
          const sessionId = validateSessionId(raw);
          if (sessionId === null) {
            return [];
          }
          const rawStartTs = row['startTs'];
          const createdAt =
            rawStartTs instanceof Date
              ? rawStartTs
              : new Date(String(rawStartTs ?? ''));

          // Filter out rows with unparseable timestamps rather than falling back to epoch
          if (!Number.isFinite(createdAt.getTime())) {
            return [];
          }

          return [
            {
              id: sessionId,
              name: sessionId,
              path: `ai://${this.workspaceId}/${sessionId}`,
              createdAt,
              adapter: this.type,
            },
          ];
        });
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

      // Check cache first — cache read failures must not prevent live queries
      try {
        const cached = this.cache?.get(validId);
        if (cached !== undefined) {
          return cached;
        }
      } catch {
        // Silently ignore cache read errors and fall through to query
      }

      const range = this.timeRange ?? defaultTimeRange();
      const kql = buildGetSessionKql(validId);
      const result = await this.queryClient.queryWithTruncationCheck(kql, range);

      if (result.rows.length === 0) {
        return null;
      }

      const { truncated } = result;

      const assembled = assembleSession(result.rows);

      // Merge truncation warning into parseStatus without masking existing issues.
      // Only downgrade 'ok' → 'partial'; if already non-ok, append truncation note.
      let session: Session;
      if (!truncated) {
        session = assembled;
      } else if (assembled.parseStatus.status === 'ok') {
        session = {
          ...assembled,
          parseStatus: {
            status: 'partial' as const,
            error: `Result set truncated at ${result.rows.length} spans — session may be incomplete`,
          },
        };
      } else {
        const existingError = assembled.parseStatus.error ?? '';
        session = {
          ...assembled,
          parseStatus: {
            ...assembled.parseStatus,
            error: existingError
              ? `${existingError}; result set truncated at ${result.rows.length} spans`
              : `Result set truncated at ${result.rows.length} spans — session may be incomplete`,
          },
        };
      }

      // Store in cache if available — cache write failures must not affect the return value
      if (this.cache) {
        try {
          this.cache.set(validId, session);
        } catch {
          // Silently ignore cache write errors
        }
      }

      return session;
    } catch {
      return null;
    }
  }
}
