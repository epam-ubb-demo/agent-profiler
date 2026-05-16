/**
 * Tests for DefaultSyncPlanner — contract tests + unit tests.
 */

import {
  createFakeMarkerStore,
  createFakeSource,
  createTestCursor,
  createTestMarker,
  createTestSessionRef,
  runPlannerContractTests,
} from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it } from 'vitest';

import { DefaultSyncPlanner } from '../src/default-sync-planner.js';

// ── Contract tests ─────────────────────────────────────────────────────────────

runPlannerContractTests(() => {
  const markerStore = createFakeMarkerStore();
  const source = createFakeSource('copilot-cli', {
    categories: ['metadata', 'turns', 'context'],
  });
  const planner = new DefaultSyncPlanner(markerStore, source);
  const ref = createTestSessionRef('copilot-cli', 'contract-test-session');
  return { planner, ref };
});

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('DefaultSyncPlanner', () => {
  const CATEGORIES = ['metadata', 'turns', 'context'] as const;

  function makePlanner(categories: readonly string[] = CATEGORIES) {
    const markerStore = createFakeMarkerStore();
    const source = createFakeSource('copilot-cli', { categories });
    const planner = new DefaultSyncPlanner(markerStore, source);
    return { planner, markerStore };
  }

  describe('planFull()', () => {
    it('returns all categories from the source with fromOrdinal = 0', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-full-1');

      const plan = await planner.planFull(ref);

      expect(plan.mode).toBe('full');
      expect(plan.categories).toHaveLength(CATEGORIES.length);
      for (const cat of plan.categories) {
        expect(CATEGORIES).toContain(cat.category);
        expect(cat.fromOrdinal).toBe(0);
      }
    });

    it('sets resetCursor = true for every category', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-full-2');

      const plan = await planner.planFull(ref);

      for (const cat of plan.categories) {
        expect(cat.resetCursor).toBe(true);
      }
    });

    it('includes the correct SessionRef in the plan', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-full-3');

      const plan = await planner.planFull(ref);

      expect(plan.ref).toBe(ref);
    });

    it('works with a source that returns zero categories', async () => {
      const { planner } = makePlanner([]);
      const ref = createTestSessionRef('copilot-cli', 'empty-categories-session');

      const plan = await planner.planFull(ref);

      expect(plan.mode).toBe('full');
      expect(plan.categories).toHaveLength(0);
    });
  });

  describe('planSelective()', () => {
    it('only includes the requested categories', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-selective-1');

      const plan = await planner.planSelective(ref, ['metadata', 'turns']);

      expect(plan.mode).toBe('selective');
      expect(plan.categories).toHaveLength(2);
      const names = plan.categories.map((c) => c.category);
      expect(names).toContain('metadata');
      expect(names).toContain('turns');
      expect(names).not.toContain('context');
    });

    it('sets fromOrdinal = 0 and resetCursor = true for all selected categories', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-selective-2');

      const plan = await planner.planSelective(ref, ['metadata']);

      for (const cat of plan.categories) {
        expect(cat.fromOrdinal).toBe(0);
        expect(cat.resetCursor).toBe(true);
      }
    });

    it('returns an empty plan when called with an empty categories array', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-selective-empty');

      const plan = await planner.planSelective(ref, []);

      expect(plan.mode).toBe('selective');
      expect(plan.categories).toHaveLength(0);
    });

    it('includes the correct SessionRef in the plan', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-selective-ref');

      const plan = await planner.planSelective(ref, ['metadata']);

      expect(plan.ref).toBe(ref);
    });

    it('accepts categories that are not known to the source (pass-through)', async () => {
      const { planner } = makePlanner(['metadata']);
      const ref = createTestSessionRef('copilot-cli', 'session-selective-unknown');

      // 'unknown-cat' is not in the source's categories, but planSelective is caller-driven
      const plan = await planner.planSelective(ref, ['unknown-cat']);

      expect(plan.categories).toHaveLength(1);
      expect(plan.categories[0]?.category).toBe('unknown-cat');
    });
  });

  describe('planIncremental()', () => {
    it('returns all source categories with fromOrdinal = 0 when no marker exists', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-incremental-no-marker');

      const plan = await planner.planIncremental(ref);

      expect(plan.mode).toBe('incremental');
      expect(plan.categories).toHaveLength(CATEGORIES.length);
      for (const cat of plan.categories) {
        expect(cat.fromOrdinal).toBe(0);
        expect(cat.resetCursor).toBe(false);
      }
    });

    it('returns fromOrdinal = lastOrdinal + 1 for tracked categories', async () => {
      const { planner, markerStore } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-incremental-with-marker');

      const metadataCursor = createTestCursor('copilot-cli', ref.sessionId, 'metadata', 7);
      const turnsCursor = createTestCursor('copilot-cli', ref.sessionId, 'turns', 3);
      const marker = createTestMarker('copilot-cli', ref.sessionId, {
        metadata: metadataCursor,
        turns: turnsCursor,
      });
      await markerStore.write(ref, marker);

      const plan = await planner.planIncremental(ref);

      const metadataPlan = plan.categories.find((c) => c.category === 'metadata');
      const turnsPlan = plan.categories.find((c) => c.category === 'turns');
      const contextPlan = plan.categories.find((c) => c.category === 'context');

      expect(metadataPlan?.fromOrdinal).toBe(8); // lastOrdinal 7 + 1
      expect(turnsPlan?.fromOrdinal).toBe(4);    // lastOrdinal 3 + 1
      expect(contextPlan?.fromOrdinal).toBe(0);   // no cursor → start from 0
    });

    it('handles a partial marker: tracked categories resume, new categories start at 0', async () => {
      const { planner, markerStore } = makePlanner(['metadata', 'turns', 'context', 'new-cat']);
      const ref = createTestSessionRef('copilot-cli', 'session-partial-marker');

      // Only 'metadata' is tracked; 'turns', 'context', and 'new-cat' are not
      const metadataCursor = createTestCursor('copilot-cli', ref.sessionId, 'metadata', 12);
      const marker = createTestMarker('copilot-cli', ref.sessionId, { metadata: metadataCursor });
      await markerStore.write(ref, marker);

      const plan = await planner.planIncremental(ref);

      const byCategory = Object.fromEntries(plan.categories.map((c) => [c.category, c]));

      expect(byCategory['metadata']?.fromOrdinal).toBe(13); // 12 + 1
      expect(byCategory['turns']?.fromOrdinal).toBe(0);
      expect(byCategory['context']?.fromOrdinal).toBe(0);
      expect(byCategory['new-cat']?.fromOrdinal).toBe(0);
    });

    it('sets resetCursor = false for all categories', async () => {
      const { planner, markerStore } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-incremental-reset-check');

      const cursor = createTestCursor('copilot-cli', ref.sessionId, 'metadata', 5);
      await markerStore.write(
        ref,
        createTestMarker('copilot-cli', ref.sessionId, { metadata: cursor }),
      );

      const plan = await planner.planIncremental(ref);

      for (const cat of plan.categories) {
        expect(cat.resetCursor).toBe(false);
      }
    });

    it('includes the correct SessionRef in the plan', async () => {
      const { planner } = makePlanner();
      const ref = createTestSessionRef('copilot-cli', 'session-incremental-ref');

      const plan = await planner.planIncremental(ref);

      expect(plan.ref).toBe(ref);
    });

    it('returns empty categories when source has no categories', async () => {
      const { planner } = makePlanner([]);
      const ref = createTestSessionRef('copilot-cli', 'session-incremental-empty-source');

      const plan = await planner.planIncremental(ref);

      expect(plan.mode).toBe('incremental');
      expect(plan.categories).toHaveLength(0);
    });

    it('uses fromOrdinal = 0 when cursor lastOrdinal is 0', async () => {
      const { planner, markerStore } = makePlanner(['metadata']);
      const ref = createTestSessionRef('copilot-cli', 'session-incremental-ordinal-zero');

      const cursor = createTestCursor('copilot-cli', ref.sessionId, 'metadata', 0);
      await markerStore.write(
        ref,
        createTestMarker('copilot-cli', ref.sessionId, { metadata: cursor }),
      );

      const plan = await planner.planIncremental(ref);

      const metadataPlan = plan.categories.find((c) => c.category === 'metadata');
      // lastOrdinal 0 + 1 = 1
      expect(metadataPlan?.fromOrdinal).toBe(1);
    });
  });
});
