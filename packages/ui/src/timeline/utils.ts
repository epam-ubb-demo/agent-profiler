/**
 * Utility functions for the timeline visualization.
 *
 * Includes colour helpers, time formatters, and lane packing algorithms.
 */

import type { AssistantMessage, Compaction, ModelChange, ToolCall } from '@agent-profiler/core';

import type { LaneAssignment, ModelSegment } from './types';

/**
 * Generates a stable colour for a model name based on a simple string hash.
 * Returns an HSL colour string.
 */
export function modelColour(model: string | null): string {
  if (!model) return 'hsl(210, 10%, 70%)';
  let hash = 0;
  for (let i = 0; i < model.length; i++) {
    hash = (hash * 31 + model.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${String(hue)}, 65%, 55%)`;
}

/**
 * Computes the heatmap colour for a given intensity (0–1).
 * Green (low) → Yellow (mid) → Red (high).
 */
export function heatmapColour(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  const hue = 120 - clamped * 120;
  return `hsl(${String(hue)}, 75%, 50%)`;
}

/**
 * Formats an ISO timestamp as HH:MM:SS.
 */
export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--:--';
  return d.toISOString().slice(11, 19);
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/**
 * Computes a fractional position (0–1) within a time range.
 */
export function timeFraction(ts: string | null, startMs: number, durationMs: number): number {
  if (!ts || durationMs <= 0) return 0;
  const t = new Date(ts).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.min(1, (t - startMs) / durationMs));
}

/**
 * Computes token intensity bins for the heatmap.
 * Returns an array of token counts per bin.
 */
export function computeHeatmapBins(
  messages: readonly AssistantMessage[],
  compactions: readonly Compaction[],
  startMs: number,
  durationMs: number,
  binCount: number,
): number[] {
  const bins = new Array<number>(binCount).fill(0);
  if (durationMs <= 0) return bins;

  for (const msg of messages) {
    if (!msg.timestamp) continue;
    const frac = timeFraction(msg.timestamp, startMs, durationMs);
    const bin = Math.min(binCount - 1, Math.floor(frac * binCount));
    bins[bin] = (bins[bin] ?? 0) + msg.outputTokens;
  }

  for (const c of compactions) {
    if (!c.timestamp) continue;
    const frac = timeFraction(c.timestamp, startMs, durationMs);
    const bin = Math.min(binCount - 1, Math.floor(frac * binCount));
    bins[bin] = (bins[bin] ?? 0) + c.inputTokens + c.outputTokens + c.cacheWrite;
  }

  return bins;
}

/**
 * Packs tool calls into swim lanes using a greedy algorithm.
 * Returns lane assignments sorted by start time.
 */
export function packToolLanes(
  toolCalls: readonly ToolCall[],
  startMs: number,
  durationMs: number,
): LaneAssignment[] {
  if (durationMs <= 0) return [];

  // Sort by start time
  const sorted = [...toolCalls]
    .filter((tc) => tc.startTs !== null)
    .sort((a, b) => new Date(a.startTs!).getTime() - new Date(b.startTs!).getTime());

  const laneEndTimes: number[] = [];
  const assignments: LaneAssignment[] = [];

  for (const tc of sorted) {
    const tcStart = new Date(tc.startTs!).getTime();
    const tcEnd = tc.endTs ? new Date(tc.endTs).getTime() : tcStart + (tc.durationMs ?? 100);

    // Find first available lane
    let assignedLane = -1;
    for (let i = 0; i < laneEndTimes.length; i++) {
      if ((laneEndTimes[i] ?? 0) <= tcStart) {
        assignedLane = i;
        break;
      }
    }
    if (assignedLane === -1) {
      assignedLane = laneEndTimes.length;
      laneEndTimes.push(0);
    }
    laneEndTimes[assignedLane] = tcEnd;

    assignments.push({
      toolCallId: tc.toolCallId,
      lane: assignedLane,
      startFrac: timeFraction(tc.startTs, startMs, durationMs),
      endFrac: Math.max(
        timeFraction(tc.startTs, startMs, durationMs) + 0.002,
        (tcEnd - startMs) / durationMs,
      ),
      toolName: tc.toolName,
      model: tc.model,
      success: tc.success,
      durationMs: tc.durationMs,
      startTs: tc.startTs,
    });
  }

  return assignments;
}

/**
 * Computes model segments from model changes and selected model.
 */
export function computeModelSegments(
  selectedModel: string,
  modelChanges: readonly ModelChange[],
  startMs: number,
  durationMs: number,
  startTs: string | null,
  endTs: string | null,
): ModelSegment[] {
  if (durationMs <= 0 || !startTs || !endTs) return [];

  const segments: ModelSegment[] = [];
  const changes = [...modelChanges].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let currentModel = selectedModel;
  let currentStart = startTs;

  for (const change of changes) {
    const changeTs = change.timestamp;
    const startFrac = timeFraction(currentStart, startMs, durationMs);
    const endFrac = timeFraction(changeTs, startMs, durationMs);
    const segStart = new Date(currentStart).getTime();
    const segEnd = new Date(changeTs).getTime();

    if (endFrac > startFrac) {
      segments.push({
        model: currentModel,
        startFrac,
        endFrac,
        startTs: currentStart,
        endTs: changeTs,
        durationMs: segEnd - segStart,
      });
    }

    currentModel = change.model;
    currentStart = changeTs;
  }

  // Final segment
  const startFrac = timeFraction(currentStart, startMs, durationMs);
  const segStart = new Date(currentStart).getTime();
  const segEnd = new Date(endTs).getTime();

  if (startFrac < 1) {
    segments.push({
      model: currentModel,
      startFrac,
      endFrac: 1,
      startTs: currentStart,
      endTs,
      durationMs: segEnd - segStart,
    });
  }

  return segments;
}

/**
 * Determines which adaptive tick should be visible at a given zoom level.
 * Returns a density level: 'major' | 'medium' | 'minor' | 'finest'.
 */
export function tickDensity(index: number): 'major' | 'medium' | 'minor' | 'finest' {
  if (index % 12 === 0) return 'major';
  if (index % 6 === 0) return 'medium';
  if (index % 3 === 0) return 'minor';
  return 'finest';
}

/**
 * Returns true if a tick at the given density level is visible at the given zoom.
 */
export function isTickVisible(density: 'major' | 'medium' | 'minor' | 'finest', zoom: number): boolean {
  switch (density) {
    case 'major':
      return true;
    case 'medium':
      return zoom >= 2;
    case 'minor':
      return zoom >= 4;
    case 'finest':
      return zoom >= 8;
  }
}

/**
 * Formats a timestamp as HH:MM:SS.mmm with an offset from session start.
 * Example: "23:44:25.319 (+29.5m)"
 */
export function formatTimeWithOffset(isoString: string, sessionStartMs: number): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--:--.---';
  const ts = d.toISOString().slice(11, 23); // HH:MM:SS.mmm
  const offsetMs = d.getTime() - sessionStartMs;
  const sign = offsetMs >= 0 ? '+' : '';
  return `${ts} (${sign}${formatDuration(offsetMs)})`;
}

/**
 * Formats a number with thousands separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-GB');
}
