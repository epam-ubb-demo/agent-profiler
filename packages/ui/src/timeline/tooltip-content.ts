/**
 * Tooltip content builders for each timeline lane.
 *
 * Each function returns a TooltipContent object with a header and key-value rows.
 * Content format mirrors the reference mock-up.
 */

import type { TooltipContent } from './types';
import { formatDuration, formatNumber, formatTime, formatTimeWithOffset } from './utils';

/** Heatmap bin tooltip. */
export function heatmapTipContent(
  binStartMs: number,
  binEndMs: number,
  tokens: number,
  intensityPct: number,
): TooltipContent {
  const start = formatTime(new Date(binStartMs).toISOString());
  const end = formatTime(new Date(binEndMs).toISOString());
  return {
    header: `Window · ${start} → ${end}`,
    rows: [
      { key: 'Tokens', value: formatNumber(tokens) },
      { key: 'Intensity', value: `${String(Math.round(intensityPct))}% of peak` },
    ],
  };
}

/** Model segment tooltip. */
export function modelTipContent(
  model: string,
  fromTs: string,
  toTs: string,
  durationMs: number,
  sessionStartMs: number,
): TooltipContent {
  return {
    header: `Model · ${model}`,
    rows: [
      { key: 'From', value: formatTimeWithOffset(fromTs, sessionStartMs) },
      { key: 'To', value: formatTimeWithOffset(toTs, sessionStartMs) },
      { key: 'Duration', value: formatDuration(durationMs) },
    ],
  };
}

/** Tool call tooltip. */
export function toolTipContent(
  toolName: string,
  model: string | null,
  startTs: string | null,
  durationMs: number | null,
  success: boolean | null,
  argsPreview: string,
  sessionStartMs: number,
): TooltipContent {
  const status = success === null ? '? pending' : success ? '✓ ok' : '✗ error';
  const rows = [
    { key: 'Model', value: model ?? 'unknown' },
    { key: 'Start', value: startTs ? formatTimeWithOffset(startTs, sessionStartMs) : '—' },
    { key: 'Duration', value: durationMs !== null ? formatDuration(durationMs) : '—' },
    { key: 'Status', value: status },
  ];
  if (argsPreview) {
    const truncated = argsPreview.length > 120 ? argsPreview.slice(0, 117) + '…' : argsPreview;
    rows.push({ key: 'Args', value: truncated });
  }
  return { header: `Tool · ${toolName}`, rows };
}

/** Assistant message tooltip. */
export function messageTipContent(
  timestamp: string,
  model: string | null,
  outputTokens: number,
  estimatedCost: number | null,
  sessionStartMs: number,
): TooltipContent {
  const costStr =
    estimatedCost !== null
      ? estimatedCost < 0.005
        ? '<$0.01'
        : `$${estimatedCost.toFixed(2)}`
      : '—';
  return {
    header: `Time · ${formatTimeWithOffset(timestamp, sessionStartMs)}`,
    rows: [
      { key: 'Model', value: model ?? 'unknown' },
      { key: 'Output tokens', value: formatNumber(outputTokens) },
      { key: 'Est. cost', value: costStr },
    ],
  };
}

/** Compaction event tooltip. */
export function compactionTipContent(
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
  cacheRead: number,
  cacheWrite: number,
  model: string | null,
  sessionStartMs: number,
): TooltipContent {
  const total = inputTokens + outputTokens + cacheRead + cacheWrite;
  return {
    header: `Compaction · ${formatTimeWithOffset(timestamp, sessionStartMs)}`,
    rows: [
      { key: 'Model', value: model ?? 'unknown' },
      { key: 'Total tokens', value: formatNumber(total) },
      { key: 'Input', value: formatNumber(inputTokens) },
      { key: 'Output', value: formatNumber(outputTokens) },
      { key: 'Cache read', value: formatNumber(cacheRead) },
      { key: 'Cache write', value: formatNumber(cacheWrite) },
    ],
  };
}
