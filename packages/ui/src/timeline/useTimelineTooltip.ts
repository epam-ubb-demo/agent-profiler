/**
 * useTimelineTooltip — manages tooltip state for the SVG timeline.
 *
 * Returns tooltip content, position, visibility and show/hide callbacks
 * that lane components attach to their SVG elements.
 */

import { useCallback, useRef, useState } from 'react';

import type { TooltipContent, TooltipHandlers } from './types';

export interface TooltipState {
  readonly content: TooltipContent | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

const OFFSET_X = 14;
const OFFSET_Y = 16;
const EDGE_PAD = 12;

function clampPosition(
  clientX: number,
  clientY: number,
  tipW: number,
  tipH: number,
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = clientX + OFFSET_X;
  let y = clientY + OFFSET_Y;

  if (x + tipW + EDGE_PAD > vw) x = clientX - tipW - OFFSET_X;
  if (y + tipH + EDGE_PAD > vh) y = clientY - tipH - OFFSET_Y;
  if (x < EDGE_PAD) x = EDGE_PAD;
  if (y < EDGE_PAD) y = EDGE_PAD;

  return { x, y };
}

export function useTimelineTooltip(): {
  state: TooltipState;
  handlers: TooltipHandlers;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
} {
  const [state, setState] = useState<TooltipState>({
    content: null,
    x: 0,
    y: 0,
    visible: false,
  });

  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const show = useCallback(
    (content: TooltipContent, event: React.MouseEvent) => {
      const el = tooltipRef.current;
      const tipW = el?.offsetWidth ?? 200;
      const tipH = el?.offsetHeight ?? 100;
      const { x, y } = clampPosition(event.clientX, event.clientY, tipW, tipH);
      setState({ content, x, y, visible: true });
    },
    [],
  );

  const move = useCallback(
    (event: React.MouseEvent) => {
      const el = tooltipRef.current;
      const tipW = el?.offsetWidth ?? 200;
      const tipH = el?.offsetHeight ?? 100;
      const { x, y } = clampPosition(event.clientX, event.clientY, tipW, tipH);
      setState((prev) => ({ ...prev, x, y }));
    },
    [],
  );

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const handlers: TooltipHandlers = { show, move, hide };

  return { state, handlers, tooltipRef };
}
