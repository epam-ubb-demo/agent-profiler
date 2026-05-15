/**
 * Application Insights session data source.
 *
 * Implements the {@link SessionDataSource} contract by querying an
 * Azure Log Analytics workspace through the {@link QueryClient}.
 */

import type {
  AssistantMessage,
  Compaction,
  ModelChange,
  ParseStatus,
  Session,
  ShutdownMetrics,
  ToolCall,
  Turn,
  UserMessage,
  UtilisationSample,
} from '@agent-profiler/core';
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
   * Optional — omit if your cache does not support stale-marking.
   */
  invalidate?(sessionId: string): void;

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

const LIST_SESSIONS_KQL = `let copilotSessions = AppDependencies
| union AppRequests
| where isnotempty(Properties)
| extend sessionId = iif(
    isnotempty(tostring(Properties.["copilot_chat.session.id"])),
    tostring(Properties.["copilot_chat.session.id"]),
    OperationId
  )
| where isnotempty(sessionId)
| summarize
    startTs = min(TimeGenerated),
    endTs = max(TimeGenerated),
    selectedModel = take_any(tostring(Properties.["gen_ai.request.model"]))
  by sessionId;
let enrichmentSessions = AppTraces
| where Properties has "agent_profiler.enrichment"
| where tostring(Properties.["agent_profiler.category"]) == "metadata"
| extend sessionId = tostring(Properties.["agent_profiler.session_id"])
| where isnotempty(sessionId)
| extend payload = parse_json(Message)
| summarize
    startTs = min(todatetime(payload.startTs)),
    endTs = max(todatetime(payload.endTs)),
    selectedModel = take_any(tostring(payload.selectedModel))
  by sessionId;
copilotSessions
| union enrichmentSessions
| summarize
    startTs = min(startTs),
    endTs = max(endTs),
    selectedModel = take_any(selectedModel)
  by sessionId
| order by startTs desc
| take 200`;

function buildGetSessionKql(sessionId: string): string {
  // sessionId is already validated by validateSessionId
  return `let targetSession = "${sessionId}";
AppDependencies
| union AppRequests
| where OperationId == targetSession
    or tostring(Properties.["copilot_chat.session.id"]) == targetSession
| project
    id = Id,
    operation_Id = OperationId,
    operation_ParentId = ParentId,
    name = Name,
    timestamp = TimeGenerated,
    duration = DurationMs,
    success = Success,
    customDimensions = Properties
| order by timestamp asc`;
}

function buildGetEnrichmentSessionKql(sessionId: string): string {
  // sessionId is already validated by validateSessionId
  return `let targetSession = "${sessionId}";
AppTraces
| where Properties has "agent_profiler.enrichment"
| where tostring(Properties.["agent_profiler.session_id"]) == targetSession
| project
    timestamp = TimeGenerated,
    message = Message,
    category = tostring(Properties.["agent_profiler.category"])
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
        // Fallback: try assembling from synced enrichment data in AppTraces
        const enrichmentKql = buildGetEnrichmentSessionKql(validId);
        const enrichmentResult = await this.queryClient.query(enrichmentKql, range);

        if (enrichmentResult.rows.length === 0) {
          return null;
        }

        const enrichmentSession = this.assembleFromEnrichment(validId, enrichmentResult.rows);

        // Cache the enrichment session — best-effort
        if (this.cache) {
          try {
            this.cache.set(validId, enrichmentSession);
          } catch {
            // Silently ignore cache write errors
          }
        }

        return enrichmentSession;
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

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Assemble a {@link Session} from enrichment rows stored in AppTraces.
   *
   * Used as a fallback when no native Copilot telemetry spans are found for
   * a session. The resulting session is always marked `partial` (or preserves
   * the status recorded in the metadata row) because full turn/message data
   * is not available from enrichment alone.
   */
  private assembleFromEnrichment(
    sessionId: string,
    rows: ReadonlyArray<Record<string, unknown>>,
  ): Session {
    const parseJson = (raw: unknown): Record<string, unknown> => {
      try {
        return JSON.parse(String(raw ?? '{}')) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    const metaRows = rows.filter((r) => r['category'] === 'metadata');
    const utilisationRows = rows.filter((r) => r['category'] === 'utilisation');
    const compactionRows = rows.filter((r) => r['category'] === 'compaction');
    const toolResultRows = rows.filter((r) => r['category'] === 'tool_result');

    // Use the last metadata row — if multiple, prefer the most recent
    const metaPayload = metaRows.length > 0
      ? parseJson(metaRows[metaRows.length - 1]?.['message'])
      : {};

    // --- utilisation ---
    const utilisation: UtilisationSample[] = utilisationRows.flatMap((r) => {
      try {
        const p = parseJson(r['message']);
        const b = p['buckets'] as Record<string, unknown> | null | undefined ?? {};
        return [{
          timestamp: String(p['timestamp'] ?? ''),
          percentage: Number(p['percentage'] ?? 0),
          used: Number(p['used'] ?? 0),
          total: Number(p['total'] ?? 0),
          buckets: {
            system: Number(b['system'] ?? 0),
            conversation: Number(b['conversation'] ?? 0),
            toolDefinitions: Number(b['toolDefinitions'] ?? 0),
          },
        }];
      } catch {
        return [];
      }
    });

    // --- compactions ---
    const compactions: Compaction[] = compactionRows.flatMap((r) => {
      try {
        const p = parseJson(r['message']);
        return [{
          timestamp: p['timestamp'] != null ? String(p['timestamp']) : null,
          inputTokens: Number(p['inputTokens'] ?? 0),
          outputTokens: Number(p['outputTokens'] ?? 0),
          cacheRead: Number(p['cacheRead'] ?? 0),
          cacheWrite: Number(p['cacheWrite'] ?? 0),
          model: p['model'] != null ? String(p['model']) : null,
          turnId: p['turnId'] != null ? String(p['turnId']) : null,
        }];
      } catch {
        return [];
      }
    });

    // --- tool calls ---
    const VALID_SKILL_OUTCOMES = new Set(['loaded', 'not_found', 'disabled', 'read_error']);
    const toolCalls: ToolCall[] = toolResultRows.flatMap((r) => {
      try {
        const p = parseJson(r['message']);
        const rawOutcome = p['skillOutcome'];
        const skillOutcome =
          rawOutcome != null && VALID_SKILL_OUTCOMES.has(String(rawOutcome))
            ? (String(rawOutcome) as 'loaded' | 'not_found' | 'disabled' | 'read_error')
            : null;
        return [{
          toolCallId: String(p['toolCallId'] ?? ''),
          toolName: String(p['toolName'] ?? ''),
          model: p['model'] != null ? String(p['model']) : null,
          startTs: p['startTs'] != null ? String(p['startTs']) : null,
          endTs: p['endTs'] != null ? String(p['endTs']) : null,
          durationMs: p['durationMs'] != null ? Number(p['durationMs']) : null,
          success: p['success'] != null ? Boolean(p['success']) : null,
          parentId: p['parentId'] != null ? String(p['parentId']) : null,
          turnId: p['turnId'] != null ? String(p['turnId']) : null,
          eventId: p['eventId'] != null ? String(p['eventId']) : null,
          argumentsPreview: String(p['argumentsPreview'] ?? ''),
          ...(p['skillName'] != null ? { skillName: String(p['skillName']) } : {}),
          ...(p['skillSource'] != null ? { skillSource: String(p['skillSource']) } : {}),
          ...(p['skillContentLength'] != null
            ? { skillContentLength: Number(p['skillContentLength']) }
            : {}),
          ...(skillOutcome != null ? { skillOutcome } : {}),
          ...(p['skillErrorMessage'] != null
            ? { skillErrorMessage: String(p['skillErrorMessage']) }
            : {}),
        }];
      } catch {
        return [];
      }
    });

    // --- assistant messages ---
    const assistantMessageRows = rows.filter((r) => r['category'] === 'assistant_message');
    const assistantMessages: AssistantMessage[] = assistantMessageRows.flatMap((r) => {
      try {
        const p = parseJson(r['message']);
        return [{
          interactionId: p['interactionId'] != null ? String(p['interactionId']) : null,
          requestId: p['requestId'] != null ? String(p['requestId']) : null,
          outputTokens: Number(p['outputTokens'] ?? 0),
          inputTokens: Number(p['inputTokens'] ?? 0),
          cacheReadTokens: Number(p['cacheReadTokens'] ?? 0),
          cacheWriteTokens: Number(p['cacheWriteTokens'] ?? 0),
          model: p['model'] != null ? String(p['model']) : null,
          timestamp: p['timestamp'] != null ? String(p['timestamp']) : null,
          turnId: p['turnId'] != null ? String(p['turnId']) : null,
          eventId: p['eventId'] != null ? String(p['eventId']) : null,
          parentId: p['parentId'] != null ? String(p['parentId']) : null,
          content: String(p['content'] ?? ''),
          reasoningText: String(p['reasoningText'] ?? ''),
        }];
      } catch {
        return [];
      }
    });

    // Group assistant messages by turnId so each Turn can be built with them inline.
    const assistantMessagesByTurnId = new Map<string, AssistantMessage[]>();
    for (const msg of assistantMessages) {
      const key = msg.turnId ?? '';
      const bucket = assistantMessagesByTurnId.get(key) ?? [];
      bucket.push(msg);
      assistantMessagesByTurnId.set(key, bucket);
    }

    // --- turns ---
    const turnRows = rows.filter((r) => r['category'] === 'turn');
    const turns: Turn[] = turnRows.flatMap((r) => {
      try {
        const p = parseJson(r['message']);
        const toolCallIds = Array.isArray(p['toolCallIds'])
          ? (p['toolCallIds'] as string[])
          : [];
        // Match tool calls by ID from the already-parsed toolCalls array.
        const turnToolCalls = toolCallIds
          .map((id) => toolCalls.find((tc) => tc.toolCallId === id))
          .filter((tc): tc is ToolCall => tc != null);

        const rawUserMsg = p['userMessage'];
        const userMessage: UserMessage | null =
          rawUserMsg != null && typeof rawUserMsg === 'object'
            ? {
                interactionId:
                  (rawUserMsg as Record<string, unknown>)['interactionId'] != null
                    ? String((rawUserMsg as Record<string, unknown>)['interactionId'])
                    : null,
                timestamp:
                  (rawUserMsg as Record<string, unknown>)['timestamp'] != null
                    ? String((rawUserMsg as Record<string, unknown>)['timestamp'])
                    : null,
                turnId:
                  (rawUserMsg as Record<string, unknown>)['turnId'] != null
                    ? String((rawUserMsg as Record<string, unknown>)['turnId'])
                    : null,
                content: String(
                  (rawUserMsg as Record<string, unknown>)['content'] ?? '',
                ),
              }
            : null;

        const turnId = String(p['turnId'] ?? '');
        return [{
          turnId,
          startTs: p['startTs'] != null ? String(p['startTs']) : null,
          endTs: p['endTs'] != null ? String(p['endTs']) : null,
          userMessage,
          // Attach assistant messages inline to avoid mutating a readonly property.
          assistantMessages: assistantMessagesByTurnId.get(turnId) ?? [],
          toolCalls: turnToolCalls,
          subagents: [],
        }];
      } catch {
        return [];
      }
    });

    // Derive user messages from turns (avoids storing them twice).
    const userMessages: UserMessage[] = turns
      .filter((t) => t.userMessage != null)
      .map((t) => t.userMessage!);

    // --- shutdown (from metadata payload) ---
    let shutdown: ShutdownMetrics | null = null;
    const rawShutdown = metaPayload['shutdown'];
    if (rawShutdown != null && typeof rawShutdown === 'object') {
      const s = rawShutdown as Record<string, unknown>;
      const rawModelMetrics = s['modelMetrics'];
      shutdown = {
        totalPremiumRequests: Number(s['totalPremiumRequests'] ?? 0),
        totalApiDurationMs: Number(s['totalApiDurationMs'] ?? 0),
        modelMetrics: Array.isArray(rawModelMetrics)
          ? (rawModelMetrics as Record<string, unknown>[]).map((m) => ({
              model: String(m['model'] ?? ''),
              inputTokens: Number(m['inputTokens'] ?? 0),
              outputTokens: Number(m['outputTokens'] ?? 0),
              cacheReadTokens: Number(m['cacheReadTokens'] ?? 0),
              cacheWriteTokens: Number(m['cacheWriteTokens'] ?? 0),
              reasoningTokens: Number(m['reasoningTokens'] ?? 0),
              requestCount: Number(m['requestCount'] ?? 0),
              premiumRequestCost: Number(m['premiumRequestCost'] ?? 0),
              apiDurationMs: Number(m['apiDurationMs'] ?? 0),
            }))
          : [],
        currentTokens: Number(s['currentTokens'] ?? 0),
        systemTokens: Number(s['systemTokens'] ?? 0),
        conversationTokens: Number(s['conversationTokens'] ?? 0),
        toolDefinitionsTokens: Number(s['toolDefinitionsTokens'] ?? 0),
        codeChanges:
          s['codeChanges'] != null && typeof s['codeChanges'] === 'object'
            ? (s['codeChanges'] as Record<string, unknown>)
            : {},
        timestamp: s['timestamp'] != null ? String(s['timestamp']) : null,
      };
    }

    // --- model changes (from metadata payload) ---
    const rawModelChanges = metaPayload['modelChanges'];
    const modelChanges: ModelChange[] = Array.isArray(rawModelChanges)
      ? (rawModelChanges as Record<string, unknown>[]).map((m) => ({
          timestamp: String(m['timestamp'] ?? ''),
          model: String(m['model'] ?? ''),
        }))
      : [];

    // --- parseStatus ---
    // Preserve the status from the metadata row if valid; otherwise mark partial.
    const VALID_STATUSES = new Set<string>(['ok', 'partial', 'failed']);
    const rawParseStatus = metaPayload['parseStatus'];
    let parseStatus: ParseStatus;
    if (rawParseStatus != null && typeof rawParseStatus === 'object') {
      const ps = rawParseStatus as Record<string, unknown>;
      const rawStatus = String(ps['status'] ?? '');
      parseStatus = {
        status: VALID_STATUSES.has(rawStatus)
          ? (rawStatus as 'ok' | 'partial' | 'failed')
          : 'partial',
        error: ps['error'] != null ? String(ps['error']) : null,
      };
    } else {
      parseStatus = {
        status: 'partial',
        error: 'Assembled from enrichment data — native Copilot telemetry not available',
      };
    }

    return {
      sessionId,
      copilotVersion: String(metaPayload['copilotVersion'] ?? ''),
      selectedModel: String(metaPayload['selectedModel'] ?? ''),
      reasoningEffort: String(metaPayload['reasoningEffort'] ?? ''),
      repository: String(metaPayload['repository'] ?? ''),
      branch: String(metaPayload['branch'] ?? ''),
      cwd: String(metaPayload['cwd'] ?? ''),
      startTs: metaPayload['startTs'] != null ? String(metaPayload['startTs']) : null,
      endTs: metaPayload['endTs'] != null ? String(metaPayload['endTs']) : null,
      success: metaPayload['success'] != null ? Boolean(metaPayload['success']) : null,
      modelChanges,
      toolCalls,
      assistantMessages,
      userMessages,
      compactions,
      subagents: [],
      shutdown,
      fanoutTurns: [],
      turns,
      parseStatus,
      utilisation,
    };
  }
}
