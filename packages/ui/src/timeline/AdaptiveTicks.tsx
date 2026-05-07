/**
 * AdaptiveTicks — renders x-axis time ticks with progressive reveal at zoom levels.
 */

import { memo } from 'react';

import type { TimelineConfig } from './types';
import { formatTime, isTickVisible, tickDensity } from './utils';

export interface AdaptiveTicksProps {
  readonly startMs: number;
  readonly durationMs: number;
  readonly config: TimelineConfig;
  readonly y: number;
  readonly zoom: number;
}

export const AdaptiveTicks = memo(function AdaptiveTicks({
  startMs,
  durationMs,
  config,
  y,
  zoom,
}: AdaptiveTicksProps) {
  const ticks: Array<{ x: number; label: string; density: string }> = [];

  for (let i = 0; i <= config.tickCount; i++) {
    const density = tickDensity(i);
    if (!isTickVisible(density, zoom)) continue;

    const frac = i / config.tickCount;
    const x = frac * config.width;
    const ts = new Date(startMs + frac * durationMs).toISOString();
    const label = formatTime(ts);

    ticks.push({ x, label, density });
  }

  return (
    <g data-testid="adaptive-ticks">
      {ticks.map((tick, i) => {
        const tickHeight = tick.density === 'major' ? 10 : tick.density === 'medium' ? 7 : 4;
        const showLabel = tick.density === 'major' || (tick.density === 'medium' && zoom >= 3);
        return (
          <g key={i}>
            <line
              x1={tick.x}
              y1={y}
              x2={tick.x}
              y2={y + tickHeight}
              stroke="#e3e6f0"
              strokeWidth={tick.density === 'major' ? 1.5 : 0.75}
            />
            {showLabel && (
              <text
                x={tick.x}
                y={y + tickHeight + 10}
                fontSize={9 / zoom}
                fill="#34406b"
                textAnchor="middle"
                pointerEvents="none"
              >
                {tick.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
});
