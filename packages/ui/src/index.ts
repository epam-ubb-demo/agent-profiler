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

// Session detail view
export * from './session-detail';

// Error boundary
export { ErrorBoundary } from './ErrorBoundary';
export type { ErrorBoundaryProps } from './ErrorBoundary';

// PDF export button
export { PdfExportButton } from './pdf/PdfExportButton';

// Auto-update notification
export { UpdateNotification } from './components/UpdateNotification';
export type {
  UpdateNotificationProps,
  UpdateNotificationState,
  UpdaterIpc,
} from './components/UpdateNotification';
