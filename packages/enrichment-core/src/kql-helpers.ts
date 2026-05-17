/**
 * KQL query helpers for filtering agent session events by tenant and user.
 *
 * These helpers generate WHERE clauses and full queries against the
 * `AgentSessionEvents_CL` custom table written by the DCR sink adapter.
 */

/** Name of the Azure Monitor custom table for agent session events. */
export const AGENT_SESSION_EVENTS_TABLE = 'AgentSessionEvents_CL';

/**
 * Escapes special characters in a KQL string literal value to prevent injection.
 *
 * Escapes backslashes, double quotes, single quotes, and newline characters so
 * the value can be safely embedded inside a KQL double-quoted string literal.
 */
export function escapeKqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Builds a KQL filter clause for team-view (all sessions in a tenant).
 *
 * @example
 * buildTeamViewFilter('acme-corp')
 * // => '| where TenantId == "acme-corp"'
 */
export function buildTeamViewFilter(tenantId: string): string {
  return `| where TenantId == "${escapeKqlString(tenantId)}"`;
}

/**
 * Builds a KQL filter clause for per-user view.
 *
 * @example
 * buildUserViewFilter('alice@example.com')
 * // => '| where SourceUser == "alice@example.com"'
 */
export function buildUserViewFilter(userId: string): string {
  return `| where SourceUser == "${escapeKqlString(userId)}"`;
}

/**
 * Builds a complete session list KQL query against {@link AGENT_SESSION_EVENTS_TABLE}
 * with optional tenant/user filtering.
 *
 * The produced query summarises events by session, ordering by most-recent
 * activity first. Omit `tenantId` or `userId` to broaden the scope.
 *
 * @example
 * buildScopedSessionListKql({ tenantId: 'acme-corp', userId: 'alice@example.com' })
 */
export function buildScopedSessionListKql(scope: {
  readonly tenantId?: string | undefined;
  readonly userId?: string | undefined;
  /** Max sessions to return. Default 200. */
  readonly limit?: number | undefined;
}): string {
  const { tenantId, userId, limit = 200 } = scope;

  const lines: string[] = [AGENT_SESSION_EVENTS_TABLE];

  if (tenantId !== undefined) {
    lines.push(buildTeamViewFilter(tenantId));
  }

  if (userId !== undefined) {
    lines.push(buildUserViewFilter(userId));
  }

  lines.push(
    '| summarize ',
    '    Tool = take_any(Tool),',
    '    EventCount = count(),',
    '    FirstEventTs = min(EventTs),',
    '    LastEventTs = max(EventTs),',
    '    SourceMachine = take_any(SourceMachine)',
    '  by SessionId',
    '| order by LastEventTs desc',
    `| take ${limit}`,
  );

  return lines.join('\n');
}
