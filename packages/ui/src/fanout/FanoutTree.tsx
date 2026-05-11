/**
 * FanoutTree — renders session fanout turns as a tree structure.
 *
 * Each node represents a sub-agent invocation with connecting lines
 * showing parent-to-child relationships.
 * Renders nothing gracefully when no fanout data exists.
 */

import type { FanoutTurn, Session } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo } from 'react';

import { FanoutNode } from './FanoutNode';

export interface FanoutTreeProps {
  /** Session whose fanoutTurns to display. */
  readonly session: Session;
  /** Called when a node is clicked for inspection. */
  readonly onNodeClick?: (turn: FanoutTurn) => void;
}

export const FanoutTree = memo(function FanoutTree({ session, onNodeClick }: FanoutTreeProps) {
  if (session.fanoutTurns.length === 0) {
    return null;
  }

  return (
    <div data-testid="fanout-tree" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
      <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: 8 } }}>Fan-out Tree</Text>
      {session.fanoutTurns.map((ft) => (
        <FanoutNode key={ft.turnId} turn={ft} depth={0} onNodeClick={onNodeClick} />
      ))}
    </div>
  );
});
