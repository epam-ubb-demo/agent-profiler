/**
 * Horizontal bar chart: token spend per turn.
 *
 * Shows the top 15 most expensive turns ranked by total token count
 * (input + output + cache reads + cache writes).  Bars are scaled relative
 * to the costliest turn so the most expensive one always fills 100 % of the
 * track.  Turn labels use 1-based position numbers since raw UUIDs are not
 * meaningful in a ranked list.
 *
 * Helps users identify which conversation turns drive the most cost so they
 * can optimise prompts or split long tasks across separate sessions.
 */

import type { Turn } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import { formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';

/* --- Constants ----------------------------------------------------------- */

const MAX_BARS = 15;

/* --- Types --------------------------------------------------------------- */

interface TurnBar {
  readonly label: string;
  readonly tokens: number;
  readonly proportion: number;
}

/* --- Props ---------------------------------------------------------------- */

export interface TokensPerTurnChartProps {
  readonly turns: readonly Turn[];
}

/* --- Component ----------------------------------------------------------- */

function TokensPerTurnChartInner({ turns }: TokensPerTurnChartProps) {
  const bars = useMemo((): readonly TurnBar[] => {
    if (turns.length === 0) return [];

    const withTokens = turns
      .map((t, index) => ({
        label: `Turn ${index + 1}`,
        tokens: t.assistantMessages.reduce(
          (sum, m) =>
            sum + m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheWriteTokens,
          0,
        ),
      }))
      .filter((t) => t.tokens > 0);

    withTokens.sort((a, b) => b.tokens - a.tokens);

    const top = withTokens.slice(0, MAX_BARS);
    const maxTokens = top[0]?.tokens ?? 1;

    return top.map((t) => ({ ...t, proportion: t.tokens / maxTokens }));
  }, [turns]);

  if (bars.length === 0) {
    return (
      <Text size="18" color="secondary">
        No per-turn token data available.
      </Text>
    );
  }

  return (
    <div className={styles.turnsBarChart}>
      {bars.map((bar) => (
        <div key={bar.label} className={styles.turnsBarRow}>
          <div className={styles.turnsBarLabel}>{bar.label}</div>
          <div className={styles.turnsBarTrack}>
            <div
              className={styles.turnsBarFill}
              style={{ width: `${bar.proportion * 100}%` }}
            />
          </div>
          <div className={styles.turnsBarValue}>{formatTokenCount(bar.tokens)}</div>
        </div>
      ))}
    </div>
  );
}

export const TokensPerTurnChart = memo(TokensPerTurnChartInner);
TokensPerTurnChart.displayName = 'TokensPerTurnChart';
