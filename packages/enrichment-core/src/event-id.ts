/**
 * Builds a deterministic event ID per ADR-0009.
 * Format: `${tenantId ?? ""}:${userId ?? ""}:${tool}:${sessionId}:${category}:${ordinal}`
 */
export function buildEventId(parts: {
  tenantId?: string | undefined;
  userId?: string | undefined;
  tool: string;
  sessionId: string;
  category: string;
  ordinal: number;
}): string {
  const { tenantId, userId, tool, sessionId, category, ordinal } = parts;
  return `${tenantId ?? ''}:${userId ?? ''}:${tool}:${sessionId}:${category}:${ordinal}`;
}
