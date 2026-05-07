/**
 * Internal types for the timeline visualization.
 */

/** Configuration for the timeline layout. */
export interface TimelineConfig {
  /** Total width of the SVG viewport (before zoom). */
  readonly width: number;
  /** Height of each lane. */
  readonly laneHeight: number;
  /** Width of the left gutter (label column). */
  readonly gutterWidth: number;
  /** Padding between lanes. */
  readonly lanePadding: number;
  /** Number of bins for the token heatmap. */
  readonly heatmapBins: number;
  /** Total number of adaptive ticks. */
  readonly tickCount: number;
}

/** Default timeline configuration. */
export const DEFAULT_CONFIG: TimelineConfig = {
  width: 1200,
  laneHeight: 32,
  gutterWidth: 80,
  lanePadding: 4,
  heatmapBins: 60,
  tickCount: 60,
};

/** Zoom state for the timeline. */
export interface ZoomState {
  readonly scale: number;
  readonly panX: number;
}

/** A resolved lane assignment for a tool call. */
export interface LaneAssignment {
  readonly toolCallId: string;
  readonly lane: number;
  readonly startFrac: number;
  readonly endFrac: number;
  readonly toolName: string;
  readonly model: string | null;
  readonly success: boolean | null;
  readonly durationMs: number | null;
  readonly startTs: string | null;
}

/** A resolved model segment for the model lane. */
export interface ModelSegment {
  readonly model: string;
  readonly startFrac: number;
  readonly endFrac: number;
  readonly startTs: string;
  readonly endTs: string;
  readonly durationMs: number;
}
