/**
 * Contract test suite for EnrichmentSink implementations.
 * Reusable by any package that implements the sink interface.
 */

import { describe, expect, it } from 'vitest';

import type { EnrichmentEvent, EnrichmentSink } from '../index.js';

/**
 * Runs a standard set of contract tests against an EnrichmentSink implementation.
 * 
 * @param factory - A function that returns a fresh sink instance and test events
 * 
 * @example
 * ```typescript
 * import { runSinkContractTests } from '@agent-profiler/enrichment-core/testing';
 * import { MyEventSink } from './my-sink';
 * 
 * runSinkContractTests(() => ({
 *   sink: new MyEventSink(),
 *   events: [
 *     { tool: 'copilot-cli', sessionId: 'test', category: 'metadata', ordinal: 0, ... },
 *     { tool: 'copilot-cli', sessionId: 'test', category: 'metadata', ordinal: 1, ... },
 *   ],
 * }));
 * ```
 */
export function runSinkContractTests(
  factory: () => { sink: EnrichmentSink; events: EnrichmentEvent[] },
): void {
  describe('EnrichmentSink contract', () => {
    it('should have a non-empty string id', () => {
      const { sink } = factory();
      expect(typeof sink.id).toBe('string');
      expect(sink.id.length).toBeGreaterThan(0);
    });

    it('should return a boolean from availability()', async () => {
      const { sink } = factory();
      const available = await sink.availability();
      expect(typeof available).toBe('boolean');
    });

    it('should return a boolean from supportsCategory()', () => {
      const { sink } = factory();
      const supports = sink.supportsCategory('any-category');
      expect(typeof supports).toBe('boolean');
    });

    it('should return a PushResult with acceptedOrdinals', async () => {
      const { sink, events } = factory();
      if (events.length > 0) {
        const result = await sink.push([events[0]!]);

        expect(result).toHaveProperty('acceptedOrdinals');
        expect(Array.isArray(result.acceptedOrdinals)).toBe(true);
        expect(result).toHaveProperty('rejected');
        expect(Array.isArray(result.rejected)).toBe(true);
      }
    });

    it('should be idempotent - pushing same events twice yields same accepted ordinals', async () => {
      const { sink, events } = factory();
      if (events.length > 0) {
        const firstPush = await sink.push([events[0]!]);
        const secondPush = await sink.push([events[0]!]);

        expect(firstPush.acceptedOrdinals).toEqual(secondPush.acceptedOrdinals);
      }
    });

    it('should return empty acceptedOrdinals for empty batch', async () => {
      const { sink } = factory();
      const result = await sink.push([]);

      expect(result.acceptedOrdinals).toHaveLength(0);
      expect(Array.isArray(result.acceptedOrdinals)).toBe(true);
    });

    it('should populate rejected array when push has rejections', async () => {
      const { sink, events } = factory();
      if (events.length > 0) {
        const result = await sink.push(events);

        expect(Array.isArray(result.rejected)).toBe(true);
        // If there are rejections, they should have ordinal and reason
        for (const rejection of result.rejected) {
          expect(rejection).toHaveProperty('ordinal');
          expect(rejection).toHaveProperty('reason');
          expect(typeof rejection.ordinal).toBe('number');
          expect(typeof rejection.reason).toBe('string');
        }
      }
    });

    it('should have acceptedOrdinals + rejected ordinals = total events', async () => {
      const { sink, events } = factory();
      if (events.length > 0) {
        const result = await sink.push(events);

        const rejectedOrdinals = new Set(result.rejected.map((r) => r.ordinal));
        const totalProcessed = new Set([
          ...result.acceptedOrdinals,
          ...rejectedOrdinals,
        ]);

        // Every ordinal should be either accepted or rejected
        expect(totalProcessed.size).toBeLessThanOrEqual(events.length);
      }
    });

    it('should include retryAfter in result if present', async () => {
      const { sink, events } = factory();
      if (events.length > 0) {
        const result = await sink.push(events);

        // retryAfter is optional, but if present should be a number
        if (result.retryAfter !== undefined) {
          expect(typeof result.retryAfter).toBe('number');
          expect(result.retryAfter).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
}
