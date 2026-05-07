/**
 * @agent-profiler/ui — public API barrel.
 *
 * Exports timeline visualization components and related hooks.
 */

export * from './timeline/index';
export { useTimelineZoom } from './hooks/useTimelineZoom';
export type { UseTimelineZoomReturn } from './hooks/useTimelineZoom';
export { useDeepLink } from './hooks/useDeepLink';
export type { UseDeepLinkReturn } from './hooks/useDeepLink';

// Per-turn panels & detail modal
export * from './panels/index';

// Fan-out tree visualization
export * from './fanout/index';

// Comparative multi-session view
export * from './comparative';

// Settings — source picker
export * from './settings';

// Annotations — tagging, commenting, filtering
export * from './annotations';
