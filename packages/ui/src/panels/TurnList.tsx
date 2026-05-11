/**
 * TurnList — scrollable, optionally-virtualized list of TurnPanel components.
 *
 * Renders all turns in the session as a vertical list.
 * Uses simple windowing (render only visible ± buffer) when turn count exceeds 50.
 */

import type { Session, ToolCall, Turn } from '@agent-profiler/core';
import { FlexRow } from '@epam/uui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { TurnPanel } from './TurnPanel';

/** Threshold above which virtualization kicks in. */
const VIRTUALIZE_THRESHOLD = 50;
/** Estimated height per turn panel (collapsed). */
const ITEM_HEIGHT = 56;
/** Number of extra items to render above/below viewport. */
const BUFFER_SIZE = 10;

export interface TurnListProps {
  /** Session whose turns to display. */
  readonly session: Session;
  /** Currently selected turn index (highlights the panel). */
  readonly selectedTurnId?: string | null;
  /** Called when a tool call in a turn panel is clicked. */
  readonly onToolCallClick?: (toolCall: ToolCall, turn: Turn) => void;
  /** Imperative: set this to a turn ID to scroll it into view. */
  readonly scrollToTurnId?: string | null;
}

export const TurnList = memo(function TurnList({
  session,
  selectedTurnId,
  onToolCallClick,
  scrollToTurnId,
}: TurnListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  const turns = session.turns;
  const shouldVirtualize = turns.length > VIRTUALIZE_THRESHOLD;

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  // Scroll to turn
  useEffect(() => {
    if (!scrollToTurnId || !containerRef.current) return;
    const idx = turns.findIndex((t) => t.turnId === scrollToTurnId);
    if (idx < 0) return;
    containerRef.current.scrollTop = idx * ITEM_HEIGHT;
  }, [scrollToTurnId, turns]);

  // Compute visible window
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE)
    : 0;
  const endIndex = shouldVirtualize
    ? Math.min(turns.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE)
    : turns.length;

  const totalHeight = shouldVirtualize ? turns.length * ITEM_HEIGHT : undefined;
  const offsetTop = shouldVirtualize ? startIndex * ITEM_HEIGHT : 0;

  const handleToolCallClick = useCallback(
    (tc: ToolCall, turn: Turn) => {
      onToolCallClick?.(tc, turn);
    },
    [onToolCallClick],
  );

  return (
    <div
      ref={containerRef}
      data-testid="turn-list"
      className="overflow-y-auto"
      style={{ height: '100%' }}
      onScroll={shouldVirtualize ? handleScroll : undefined}
    >
      <div style={totalHeight != null ? { height: totalHeight, position: 'relative' } : undefined}>
        <FlexRow
          rowGap="6"
          rawProps={{ style: shouldVirtualize ? { flexDirection: 'column', padding: '12px', transform: `translateY(${offsetTop}px)` } : { flexDirection: 'column', padding: '12px' } }}
        >
          {turns.slice(startIndex, endIndex).map((turn) => (
            <TurnPanel
              key={turn.turnId}
              turn={turn}
              sessionStartTs={session.startTs}
              isSelected={turn.turnId === selectedTurnId}
              onToolCallClick={(tc) => handleToolCallClick(tc, turn)}
            />
          ))}
        </FlexRow>
      </div>
    </div>
  );
});
