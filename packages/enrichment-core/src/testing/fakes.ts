/**
 * Shared fake/mock implementations for testing contracts.
 * These are test utilities used by contract test suites.
 */

import type {
  EnrichmentCursor,
  EnrichmentEvent,
  EnrichmentSink,
  Marker,
  MarkerStore,
  SessionEnrichmentSource,
  SessionRef,
  ToolId,
} from '../index.js';
import type { PushResult } from '../sink.js';

/**
 * Creates a minimal fake SessionEnrichmentSource for testing.
 */
export function createFakeSource(
  tool: ToolId,
  options?: {
    categories?: readonly string[];
    sessions?: readonly SessionRef[];
  },
): SessionEnrichmentSource {
  const categories = options?.categories ?? ['default'];
  const sessions = options?.sessions ?? [];

  return {
    tool,
    async *discoverSessions() {
      for (const session of sessions) {
        yield session;
      }
    },
    async *readEvents() {
      // Empty by default
    },
    watch: () => ({
      on: () => {},
      close: () => {},
    }),
    categoriesFor: async () => categories,
  };
}

/**
 * Creates a minimal fake EnrichmentSink for testing.
 */
export function createFakeSink(options?: {
  id?: string;
  available?: boolean;
  supportedCategories?: readonly string[];
}): EnrichmentSink {
  const id = options?.id ?? 'test-sink';
  const available = options?.available ?? true;
  const supportedCategories = options?.supportedCategories ?? ['*'];

  return {
    id,
    availability: async () => available,
    supportsCategory: (category: string) =>
      supportedCategories.includes('*') || supportedCategories.includes(category),
    push: async (batch: readonly EnrichmentEvent[]): Promise<PushResult> => ({
      acceptedOrdinals: batch.map(e => e.ordinal),
      rejected: [],
    }),
  };
}

/**
 * Creates a minimal fake MarkerStore for testing.
 */
export function createFakeMarkerStore(): MarkerStore {
  const markers = new Map<string, Marker>();

  return {
    read: async (ref: SessionRef) => {
      const key = `${ref.tool}:${ref.sessionId}`;
      return markers.get(key);
    },
    write: async (ref: SessionRef, marker: Marker) => {
      const key = `${ref.tool}:${ref.sessionId}`;
      markers.set(key, marker);
    },
    resetCategories: async (ref: SessionRef, categories: readonly string[]) => {
      const key = `${ref.tool}:${ref.sessionId}`;
      const marker = markers.get(key);
      if (marker) {
        const updated = { ...marker };
        for (const category of categories) {
          delete updated.cursors[category];
          delete updated.payloadSchemaVersions[category];
        }
        markers.set(key, updated);
      }
    },
    resetAll: async (ref: SessionRef) => {
      const key = `${ref.tool}:${ref.sessionId}`;
      markers.delete(key);
    },
  };
}

/**
 * Creates a test cursor for the given parameters.
 */
export function createTestCursor(
  tool: ToolId,
  sessionId: string,
  category: string,
  lastOrdinal: number,
): EnrichmentCursor {
  const now = new Date().toISOString();
  return {
    tool,
    sessionId,
    category,
    lastOrdinal,
    lastEventId: `::${tool}:${sessionId}:${category}:${lastOrdinal}`,
    lastEventTs: now,
    lastIngestedAt: now,
  };
}

/**
 * Creates a test marker for the given parameters.
 */
export function createTestMarker(
  tool: ToolId,
  sessionId: string,
  cursors: Record<string, EnrichmentCursor> = {},
  payloadSchemaVersions: Record<string, string> = {},
): Marker {
  return {
    schemaVersion: 2,
    tool,
    sessionId,
    cursors,
    payloadSchemaVersions,
  };
}

/**
 * Creates a test enrichment event for the given parameters.
 */
export function createTestEvent(
  tool: ToolId,
  sessionId: string,
  category: string,
  ordinal: number,
  payload: Record<string, unknown> = {},
): EnrichmentEvent {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    tool,
    toolVersion: '1.0.0',
    sourceMachine: 'test-machine',
    sessionId,
    category,
    ordinal,
    eventId: `::${tool}:${sessionId}:${category}:${ordinal}`,
    eventTs: now,
    payloadSchema: `${tool}/${category}/v1`,
    payload,
  };
}

/**
 * Creates a test session ref for the given parameters.
 */
export function createTestSessionRef(
  tool: ToolId,
  sessionId: string,
  locationHint?: string,
): SessionRef {
  return {
    tool,
    sessionId,
    locationHint: locationHint ?? `/test/session/${sessionId}`,
  };
}
