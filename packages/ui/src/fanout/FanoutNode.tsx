/**
 * FanoutNode — renders a single node in the fan-out tree.
 *
 * Displays agent ID, turn count, total duration, and an expand control.
 * Recursively renders child turns when expanded.
 */

import type { FanoutTurn } from '@agent-profiler/core';
import { FlexRow, Text } from '@epam/uui';
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
        onClick={toggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 6,
          padding: '6px 8px',
          textAlign: 'left',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Triangle/chevron indicator */}
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 200ms',
            transform: expanded ? 'rotate(90deg)' : undefined,
            color: 'var(--uui-text-disabled)',
            fontSize: '0.75rem',
          }}
        >
          ▶
        </span>

        {/* Agent label */}
        <Text size="24" fontWeight="600">{label}</Text>

        {/* Stats */}
        <Text size="18" color="secondary">
          {toolCount} tool{toolCount !== 1 ? 's' : ''}
        </Text>
        {durationMs != null && <Text size="18" color="secondary">{durationMs}ms</Text>}

        {/* Inspect button */}
        {onNodeClick && (
          <span
            role="button"
            tabIndex={0}
            style={{ marginLeft: 'auto', color: 'var(--uui-info-50)', fontSize: '0.75rem', cursor: 'pointer' }}
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
          style={{ marginLeft: '1.25rem', borderLeft: '1px solid var(--uui-neutral-40)', paddingLeft: '0.75rem', paddingTop: '0.25rem', paddingBottom: '0.25rem' }}
        >
          {turn.toolCalls.map((tc) => (
            <FlexRow key={tc.toolCallId} columnGap="6" alignItems="center">
              <Text size="24" fontWeight="600">{tc.toolName}</Text>
              {tc.durationMs != null && (
                <Text size="18" color="secondary">{tc.durationMs}ms</Text>
              )}
              <Text
                size="18"
                fontWeight="600"
                color={
                  tc.success === true
                    ? 'success'
                    : tc.success === false
                      ? 'critical'
                      : 'secondary'
                }
              >
                {tc.success === true ? '✓' : tc.success === false ? '✗' : '?'}
              </Text>
            </FlexRow>
          ))}

          {/* Recursive sub-agents */}
          {turn.subagents.map((sa, i) => (
            <Text key={i} size="18" color="secondary" rawProps={{ style: { marginTop: '0.25rem' } }}>
              Sub-agent: {sa.agentName} ({sa.toolCallCount} calls)
            </Text>
          ))}

          {turn.assistantMessages.length > 0 && (
            <Text size="18" color="secondary" rawProps={{ style: { marginTop: '0.25rem' } }}>
              {turn.assistantMessages.length} assistant message
              {turn.assistantMessages.length !== 1 ? 's' : ''}
            </Text>
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
