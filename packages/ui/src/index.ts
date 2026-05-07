/**
 * @agent-profiler/ui — public API barrel.
 *
 * Exports timeline visualization components and related hooks.
 */

export * from './timeline/index';
export { useTimelineZoom } from './hooks/useTimelineZoom';
export type { UseTimelineZoomReturn } from './hooks/useTimelineZoom';
