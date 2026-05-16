import type { EnrichmentEvent, EnrichmentCursor, SessionRef } from './enrichment-event.js';
import type { ToolId } from './tool-id.js';

export interface SessionWatcher {
  on(event: 'change', handler: (ref: SessionRef) => void): void;
  close(): void;
}

export interface SessionEnrichmentSource {
  readonly tool: ToolId;

  /** Enumerate all sessions known to this source. */
  discoverSessions(): AsyncIterable<SessionRef>;

  /**
   * Yields events forward from cursors.
   *
   * Implementations MUST:
   * - Be resumable: same cursor → same events
   * - Be ordered: ordinal strictly increasing per (sessionId, category)
   * - Be back-pressure friendly: consumer pulls (AsyncIterable)
   */
  readEvents(
    ref: SessionRef,
    cursors: Readonly<Record<string, EnrichmentCursor | undefined>>,
  ): AsyncIterable<EnrichmentEvent>;

  /** Watch a session for new events, calling the handler on each change. */
  watch(ref: SessionRef): SessionWatcher;

  /** Return the categories available for the given session reference. */
  categoriesFor(ref: SessionRef): Promise<readonly string[]>;
}
