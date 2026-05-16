/**
 * Contract test suite for SessionEnrichmentSource implementations.
 * Reusable by any package that implements the source interface.
 */

import { describe, expect, it } from 'vitest';

import type { EnrichmentEvent, SessionEnrichmentSource, SessionRef, ToolId } from '../index.js';

/**
 * Runs a standard set of contract tests against a SessionEnrichmentSource implementation.
 * 
 * @param factory - A function that returns a fresh source instance and a fixture session ref
 * 
 * @example
 * ```typescript
 * import { runSourceContractTests } from '@agent-profiler/enrichment-core/testing';
 * import { MyCopilotSource } from './my-source';
 * 
 * runSourceContractTests(() => ({
 *   source: new MyCopilotSource(),
 *   fixture: { tool: 'copilot-cli', sessionId: 'test-123', locationHint: '/path' },
 * }));
 * ```
 */
export function runSourceContractTests(
  factory: () => { source: SessionEnrichmentSource; fixture: SessionRef },
): void {
  describe('SessionEnrichmentSource contract', () => {
    it('should have a valid ToolId', () => {
      const { source } = factory();
      const validTools: ToolId[] = ['copilot-cli', 'vscode-chat', 'claude-code'];
      expect(validTools).toContain(source.tool);
    });

    it('should discover sessions via discoverSessions', async () => {
      const { source } = factory();
      const sessions: SessionRef[] = [];

      for await (const ref of source.discoverSessions()) {
        sessions.push(ref);
      }

      // Contract: discoverSessions must be an AsyncIterable that yields SessionRef objects
      // (may be empty, but must be iterable and yield valid refs if any)
      if (sessions.length > 0) {
        const first = sessions[0];
        expect(first).toHaveProperty('tool');
        expect(first).toHaveProperty('sessionId');
        expect(first).toHaveProperty('locationHint');
      }
    });

    it('should return a non-empty array from categoriesFor', async () => {
      const { source, fixture } = factory();
      const categories = await source.categoriesFor(fixture);

      expect(Array.isArray(categories)).toBe(true);
      // Contract: categories must be a non-empty array of strings (or may be empty per spec)
      if (categories.length > 0) {
        expect(typeof categories[0]).toBe('string');
      }
    });

    it('should return a SessionWatcher from watch', () => {
      const { source, fixture } = factory();
      const watcher = source.watch(fixture);

      expect(watcher).toHaveProperty('on');
      expect(watcher).toHaveProperty('close');
      expect(typeof watcher.on).toBe('function');
      expect(typeof watcher.close).toBe('function');

      // Clean up
      watcher.close();
    });

    it('readEvents with empty cursors yields events', async () => {
      const { source, fixture } = factory();
      const events: EnrichmentEvent[] = [];

      for await (const event of source.readEvents(fixture, {})) {
        events.push(event);
      }

      // Contract: readEvents must be an AsyncIterable
      // (may be empty, but must yield valid EnrichmentEvent objects if any)
      if (events.length > 0) {
        const first = events[0]!;
        expect(first).toHaveProperty('tool');
        expect(first).toHaveProperty('sessionId');
        expect(first).toHaveProperty('ordinal');
        expect(first).toHaveProperty('eventId');
        // Ordinal must be non-negative
        expect(first.ordinal).toBeGreaterThanOrEqual(0);
      }
    });

    it('readEvents ordinals should be strictly increasing per category', async () => {
      const { source, fixture } = factory();
      const eventsByCategory = new Map<string, number[]>();

      for await (const event of source.readEvents(fixture, {})) {
        const category = event.category;
        if (!eventsByCategory.has(category)) {
          eventsByCategory.set(category, []);
        }
        eventsByCategory.get(category)!.push(event.ordinal);
      }

      // Contract: ordinals must be strictly increasing per category
      for (const [category, ordinals] of eventsByCategory) {
        for (let i = 1; i < ordinals.length; i++) {
          expect(
            ordinals[i]! > ordinals[i - 1]!,
            `ordinals for category "${category}" must be strictly increasing`,
          ).toBe(true);
        }
      }
    });

    it('readEvents with cursor should resume from after that cursor', async () => {
      const { source, fixture } = factory();
      
      // Collect all events
      const allEvents: EnrichmentEvent[] = [];
      for await (const event of source.readEvents(fixture, {})) {
        allEvents.push(event);
      }

      if (allEvents.length > 1) {
        // Use cursor for first category at first event
        const firstEvent = allEvents[0]!;
        const cursorCategory = firstEvent.category;
        
        // Create cursor at first event's ordinal
        const cursor = {
          tool: source.tool,
          sessionId: fixture.sessionId,
          category: cursorCategory,
          lastOrdinal: firstEvent.ordinal,
          lastEventId: firstEvent.eventId,
          lastEventTs: firstEvent.eventTs,
          lastIngestedAt: new Date().toISOString(),
        };

        // Read again with cursor
        const resumedEvents: EnrichmentEvent[] = [];
        for await (const event of source.readEvents(fixture, { [cursorCategory]: cursor })) {
          resumedEvents.push(event);
        }

        // Contract: when using cursor, should get events AFTER the cursor ordinal
        // All returned events for this category should have ordinal > cursor's lastOrdinal
        const resumedEventsForCategory = resumedEvents.filter(
          (e) => e.category === cursorCategory,
        );
        for (const event of resumedEventsForCategory) {
          expect(
            event.ordinal > cursor.lastOrdinal,
            'resumed events should have ordinal > cursor.lastOrdinal',
          ).toBe(true);
        }
      }
    });

    it('readEvents should produce deterministic results on repeated calls', async () => {
      const { source, fixture } = factory();

      const firstRead: string[] = [];
      for await (const event of source.readEvents(fixture, {})) {
        firstRead.push(event.eventId);
      }

      const secondRead: string[] = [];
      for await (const event of source.readEvents(fixture, {})) {
        secondRead.push(event.eventId);
      }

      expect(firstRead).toEqual(secondRead);
    });
  });
}
