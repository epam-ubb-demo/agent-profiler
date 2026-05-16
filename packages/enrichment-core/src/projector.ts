import type { Session } from '@agent-profiler/core';

import type { EnrichmentEvent } from './enrichment-event.js';
import type { ToolId } from './tool-id.js';

export interface SessionProjector {
  readonly tool: ToolId;

  /**
   * Project a set of enrichment events into a {@link Session}.
   * Implementations should be pure / side-effect-free.
   */
  project(events: readonly EnrichmentEvent[]): Session;
}
