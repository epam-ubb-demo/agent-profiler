/**
 * TurnPanel — collapsible card displaying a single turn's details.
 *
 * Shows turn header (index, timestamp, model), user message (truncated),
 * assistant messages, tool calls, and token usage summary.
 */

import type { ToolCall, Turn } from '@agent-profiler/core';
import { FlexRow, Text } from '@epam/uui';
import { memo, useCallback, useState } from 'react';

/** Maximum characters shown in collapsed user message. */
const MESSAGE_PREVIEW_LENGTH = 200;

export interface TurnPanelProps {
  /** The turn to display. */
  readonly turn: Turn;
  /** Session start timestamp for computing relative time. */
  readonly sessionStartTs?: string | null;
  /** Called when a tool call is clicked (opens detail modal). */
  readonly onToolCallClick?: (toolCall: ToolCall) => void;
  /** Whether this turn is currently highlighted/selected. */
  readonly isSelected?: boolean;
}

export const TurnPanel = memo(function TurnPanel({
  turn,
  sessionStartTs,
  onToolCallClick,
  isSelected = false,
}: TurnPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // Compute relative timestamp
  const relativeTime = computeRelativeTime(turn.startTs, sessionStartTs);

  // Derive model from first assistant message
  const model = turn.assistantMessages[0]?.model ?? null;

  // Token totals
  const totalInput = turn.assistantMessages.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutput = turn.assistantMessages.reduce((s, m) => s + m.outputTokens, 0);
  const totalCache = turn.assistantMessages.reduce((s, m) => s + m.cacheReadTokens, 0);

  const userContent = turn.userMessage?.content ?? '';
  const isTruncated = userContent.length > MESSAGE_PREVIEW_LENGTH;
  const displayMessage = expanded ? userContent : userContent.slice(0, MESSAGE_PREVIEW_LENGTH);

  return (
    <div
      data-testid="turn-panel"
      style={{
        borderRadius: 6,
        border: `1px solid ${isSelected ? 'var(--uui-info-50)' : 'var(--uui-neutral-40)'}`,
        background: isSelected ? 'var(--uui-info-5)' : undefined,
        transition: 'all 200ms',
      }}
    >
      {/* Header */}
      <button
        data-testid="turn-panel-header"
        onClick={toggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <Text size="18" fontWeight="600">#{turn.turnId}</Text>
        {relativeTime && <Text size="18" color="secondary">{relativeTime}</Text>}
        {model && <Text size="18" color="secondary">{model}</Text>}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--uui-text-disabled)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div
          data-testid="turn-panel-body"
          style={{
            borderTop: '1px solid var(--uui-neutral-40)',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* User message */}
          {userContent && (
            <section>
              <Text size="18" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>User</Text>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: 'var(--uui-text-primary)', margin: 0 }}>
                {displayMessage}
              </p>
              {isTruncated && (
                <button
                  data-testid="show-more-btn"
                  style={{
                    marginTop: 4,
                    fontSize: '0.75rem',
                    color: 'var(--uui-info-50)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(true);
                  }}
                >
                  {displayMessage.length < userContent.length ? 'Show more…' : ''}
                </button>
              )}
            </section>
          )}

          {/* Assistant messages */}
          {turn.assistantMessages.length > 0 && (
            <section>
              <Text size="18" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>Assistant</Text>
              {turn.assistantMessages.map((msg, i) => (
                <p key={i} style={{ fontSize: '0.875rem', color: 'var(--uui-text-primary)', margin: 0 }}>
                  {msg.content.slice(0, MESSAGE_PREVIEW_LENGTH)}
                  {msg.content.length > MESSAGE_PREVIEW_LENGTH ? '…' : ''}
                  <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--uui-text-secondary)' }}>
                    ({msg.outputTokens} tokens)
                  </span>
                </p>
              ))}
            </section>
          )}

          {/* Tool calls */}
          {turn.toolCalls.length > 0 && (
            <section>
              <Text size="18" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>Tool Calls</Text>
              <ul
                data-testid="tool-calls-list"
                style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {turn.toolCalls.map((tc) => (
                  <li key={tc.toolCallId}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToolCallClick?.(tc);
                      }}
                      style={{
                        display: 'flex',
                        width: '100%',
                        alignItems: 'center',
                        gap: 8,
                        borderRadius: 6,
                        padding: '4px 8px',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Text size="24" fontWeight="600">{tc.toolName}</Text>
                      {tc.durationMs != null && (
                        <Text size="18" color="secondary">{tc.durationMs}ms</Text>
                      )}
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color:
                            tc.success === true
                              ? 'var(--uui-success-50)'
                              : tc.success === false
                                ? 'var(--uui-critical-50)'
                                : 'var(--uui-text-secondary)',
                        }}
                      >
                        {tc.success === true ? '✓' : tc.success === false ? '✗' : '?'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Token summary */}
          {(totalInput > 0 || totalOutput > 0) && (
            <FlexRow data-testid="token-summary" columnGap="18" rawProps={{ 'data-testid': 'token-summary' }}>
              <Text size="18" color="secondary">In: {totalInput}</Text>
              <Text size="18" color="secondary">Out: {totalOutput}</Text>
              {totalCache > 0 && <Text size="18" color="secondary">Cache: {totalCache}</Text>}
            </FlexRow>
          )}
        </div>
      )}
    </div>
  );
});

/** Computes a relative time string from session start. */
function computeRelativeTime(
  turnTs: string | null,
  sessionStart: string | null | undefined,
): string | null {
  if (!turnTs || !sessionStart) return null;
  const diffMs = new Date(turnTs).getTime() - new Date(sessionStart).getTime();
  if (isNaN(diffMs) || diffMs < 0) return null;
  const secs = Math.floor(diffMs / 1000);
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return mins > 0 ? `+${mins}m ${remainSecs}s` : `+${remainSecs}s`;
}
