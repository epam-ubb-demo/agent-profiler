/**
 * TurnPanel — collapsible card displaying a single turn's details.
 *
 * Shows turn header (index, timestamp, model), user message (truncated),
 * assistant messages, tool calls, and token usage summary.
 */

import type { ToolCall, Turn } from '@agent-profiler/core';
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
      className={`rounded-lg border transition-all duration-200 ${
        isSelected ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'
      }`}
    >
      {/* Header */}
      <button
        data-testid="turn-panel-header"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={toggle}
        aria-expanded={expanded}
      >
        <span className="text-xs font-bold text-slate-900">#{turn.turnId}</span>
        {relativeTime && <span className="text-xs text-slate-500">{relativeTime}</span>}
        {model && <span className="text-xs text-slate-500">{model}</span>}
        <span className="ml-auto text-xs text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Body */}
      {expanded && (
        <div data-testid="turn-panel-body" className="border-t border-slate-100 px-4 py-3 space-y-3">
          {/* User message */}
          {userContent && (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-slate-700">User</h4>
              <p className="whitespace-pre-wrap text-sm text-slate-900">{displayMessage}</p>
              {isTruncated && (
                <button
                  data-testid="show-more-btn"
                  className="mt-1 text-xs text-blue-600 hover:underline"
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
              <h4 className="mb-1 text-xs font-semibold text-slate-700">Assistant</h4>
              {turn.assistantMessages.map((msg, i) => (
                <p key={i} className="text-sm text-slate-900">
                  {msg.content.slice(0, MESSAGE_PREVIEW_LENGTH)}
                  {msg.content.length > MESSAGE_PREVIEW_LENGTH ? '…' : ''}
                  <span className="ml-2 text-xs text-slate-500">
                    ({msg.outputTokens} tokens)
                  </span>
                </p>
              ))}
            </section>
          )}

          {/* Tool calls */}
          {turn.toolCalls.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold text-slate-700">Tool Calls</h4>
              <ul className="space-y-1" data-testid="tool-calls-list">
                {turn.toolCalls.map((tc) => (
                  <li key={tc.toolCallId}>
                    <button
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToolCallClick?.(tc);
                      }}
                    >
                      <span className="font-medium text-slate-900">{tc.toolName}</span>
                      {tc.durationMs != null && (
                        <span className="text-xs text-slate-500">{tc.durationMs}ms</span>
                      )}
                      <span
                        className={`ml-auto text-xs font-medium ${
                          tc.success === true
                            ? 'text-green-600'
                            : tc.success === false
                              ? 'text-red-600'
                              : 'text-slate-500'
                        }`}
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
            <section data-testid="token-summary" className="flex gap-4 text-xs text-slate-500">
              <span>In: {totalInput}</span>
              <span>Out: {totalOutput}</span>
              {totalCache > 0 && <span>Cache: {totalCache}</span>}
            </section>
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
