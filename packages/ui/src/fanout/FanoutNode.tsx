/**
 * FanoutNode — renders a single node in the fan-out tree.
 *
 * Displays agent ID, turn count, total duration, and an expand control.
 * Recursively renders child turns when expanded.
 */

import type { FanoutTurn } from '@agent-profiler/core';
import { memo, useCallback, useState } from 'react';

export interface FanoutNodeProps {
  /** The fan-out turn data for this node. */
  readonly turn: FanoutTurn;
  /** Depth in the tree (for indentation). */
  readonly depth: number;
  /** Called when user clicks to inspect a specific tool call. */
  readonly onNodeClick?: ((turn: FanoutTurn) => void) | undefined;
}

export const FanoutNode = memo(function FanoutNode({ turn, depth, onNodeClick }: FanoutNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // Compute duration
  const durationMs = computeDuration(turn.startTs, turn.endTs);
  const toolCount = turn.toolCalls.length;

  // Determine label: agentName from first subagent, or model, or turnId
  const label =
    turn.subagents[0]?.agentName ?? turn.model ?? `Turn ${turn.turnId}`;

  return (
    <div data-testid="fanout-node" style={{ marginLeft: depth * 20 }}>
      {/* Node header */}
      <button
        data-testid="fanout-node-header"
        className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-50 w-full"
        onClick={toggle}
        aria-expanded={expanded}
      >
        {/* Triangle/chevron indicator */}
        <span
          className={`inline-block text-xs text-slate-400 transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          ▶
        </span>

        {/* Agent label */}
        <span className="text-sm font-medium text-slate-900">{label}</span>

        {/* Stats */}
        <span className="text-xs text-slate-500">
          {toolCount} tool{toolCount !== 1 ? 's' : ''}
        </span>
        {durationMs != null && <span className="text-xs text-slate-500">{durationMs}ms</span>}

        {/* Inspect button */}
        {onNodeClick && (
          <span
            role="button"
            tabIndex={0}
            className="ml-auto text-xs text-blue-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onNodeClick(turn);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onNodeClick(turn);
              }
            }}
          >
            inspect
          </span>
        )}
      </button>

      {/* Expanded content — tool calls */}
      {expanded && (
        <div
          data-testid="fanout-node-body"
          className="ml-5 border-l border-slate-200 pl-3 py-1 space-y-1"
        >
          {turn.toolCalls.map((tc) => (
            <div key={tc.toolCallId} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-900">{tc.toolName}</span>
              {tc.durationMs != null && (
                <span className="text-xs text-slate-500">{tc.durationMs}ms</span>
              )}
              <span
                className={`text-xs font-medium ${
                  tc.success === true
                    ? 'text-green-600'
                    : tc.success === false
                      ? 'text-red-600'
                      : 'text-slate-500'
                }`}
              >
                {tc.success === true ? '✓' : tc.success === false ? '✗' : '?'}
              </span>
            </div>
          ))}

          {/* Recursive sub-agents */}
          {turn.subagents.map((sa, i) => (
            <div key={i} className="mt-1 text-xs text-slate-500">
              Sub-agent: {sa.agentName} ({sa.toolCallCount} calls)
            </div>
          ))}

          {turn.assistantMessages.length > 0 && (
            <div className="mt-1 text-xs text-slate-500">
              {turn.assistantMessages.length} assistant message
              {turn.assistantMessages.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function computeDuration(startTs: string | null, endTs: string | null): number | null {
  if (!startTs || !endTs) return null;
  const diff = new Date(endTs).getTime() - new Date(startTs).getTime();
  return isNaN(diff) ? null : diff;
}
