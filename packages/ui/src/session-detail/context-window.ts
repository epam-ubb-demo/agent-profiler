/**
 * Pure-function utility that derives context window composition data
 * from {@link ShutdownMetrics} for the stacked SVG bar visualisation.
 */

import type { ShutdownMetrics } from '@agent-profiler/core';

/** A single segment of the context window stacked bar. */
export interface ContextWindowSegment {
  /** Human-readable label, e.g. "System prompt". */
  readonly label: string;
  /** Absolute token count for this segment. */
  readonly tokens: number;
  /** Width proportion of the bar (0–1). */
  readonly proportion: number;
  /** CSS variable name, e.g. `'var(--uui-primary-50)'`. */
  readonly colour: string;
}

/** Aggregated context window data ready for rendering. */
export interface ContextWindowData {
  /** Total tokens currently in use. */
  readonly currentTokens: number;
  /** Ordered segments that make up the context window. */
  readonly segments: readonly ContextWindowSegment[];
}

/**
 * Compute the context window composition from shutdown metrics.
 *
 * Returns `null` when no metrics are available; returns an empty
 * `segments` array when the total segment token count is zero.
 */
export function computeContextWindow(
  shutdown: ShutdownMetrics | null,
): ContextWindowData | null {
  if (shutdown === null) return null;

  const { systemTokens, conversationTokens, toolDefinitionsTokens } = shutdown;
  const totalSegmentTokens =
    systemTokens + conversationTokens + toolDefinitionsTokens;

  if (totalSegmentTokens === 0) {
    return { currentTokens: shutdown.currentTokens, segments: [] };
  }

  const raw: readonly ContextWindowSegment[] = [
    {
      label: 'System prompt',
      tokens: systemTokens,
      proportion: systemTokens / totalSegmentTokens,
      colour: 'var(--uui-info-50)',
    },
    {
      label: 'Conversation',
      tokens: conversationTokens,
      proportion: conversationTokens / totalSegmentTokens,
      colour: 'var(--uui-success-50)',
    },
    {
      label: 'Tool definitions',
      tokens: toolDefinitionsTokens,
      proportion: toolDefinitionsTokens / totalSegmentTokens,
      colour: 'var(--uui-warning-50)',
    },
  ];

  return {
    currentTokens: shutdown.currentTokens,
    segments: raw.filter((s) => s.tokens !== 0),
  };
}
