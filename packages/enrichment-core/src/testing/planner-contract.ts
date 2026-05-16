/**
 * Contract test suite for SyncPlanner implementations.
 * Reusable by any package that implements the planner interface.
 */

import { describe, expect, it } from 'vitest';

import type { SessionRef, SyncPlanner } from '../index.js';

/**
 * Runs a standard set of contract tests against a SyncPlanner implementation.
 * 
 * @param factory - A function that returns a fresh planner instance and a fixture session ref
 * 
 * @example
 * ```typescript
 * import { runPlannerContractTests } from '@agent-profiler/enrichment-core/testing';
 * import { MyPlanner } from './my-planner';
 * 
 * runPlannerContractTests(() => ({
 *   planner: new MyPlanner(),
 *   ref: { tool: 'copilot-cli', sessionId: 'test-123', locationHint: '/path' },
 * }));
 * ```
 */
export function runPlannerContractTests(
  factory: () => { planner: SyncPlanner; ref: SessionRef },
): void {
  describe('SyncPlanner contract', () => {
    it('should return a SyncPlan with mode "full" from planFull', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planFull(ref);

      expect(plan).toHaveProperty('mode');
      expect(plan.mode).toBe('full');
      expect(plan).toHaveProperty('ref');
      expect(plan).toHaveProperty('categories');
      expect(Array.isArray(plan.categories)).toBe(true);
    });

    it('should set fromOrdinal = 0 for all categories in planFull', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planFull(ref);

      for (const category of plan.categories) {
        expect(category.fromOrdinal).toBe(0);
        expect(category).toHaveProperty('category');
        expect(category).toHaveProperty('resetCursor');
      }
    });

    it('should set resetCursor = true for all categories in planFull', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planFull(ref);

      for (const category of plan.categories) {
        expect(category.resetCursor).toBe(true);
      }
    });

    it('should return a SyncPlan with mode "selective" from planSelective', async () => {
      const { planner, ref } = factory();
      const requestedCategories = ['metadata', 'turns'];
      const plan = await planner.planSelective(ref, requestedCategories);

      expect(plan.mode).toBe('selective');
      expect(plan).toHaveProperty('categories');
      expect(Array.isArray(plan.categories)).toBe(true);
    });

    it('should only include requested categories in planSelective', async () => {
      const { planner, ref } = factory();
      const requested = ['metadata', 'turns'];
      const plan = await planner.planSelective(ref, requested);

      const planCategories = plan.categories.map((c) => c.category);
      // All returned categories should be in the requested set
      for (const cat of planCategories) {
        expect(requested).toContain(cat);
      }
    });

    it('should set fromOrdinal = 0 for selective categories', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planSelective(ref, ['metadata']);

      for (const category of plan.categories) {
        expect(category.fromOrdinal).toBe(0);
      }
    });

    it('should set resetCursor = true for selective categories', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planSelective(ref, ['metadata']);

      for (const category of plan.categories) {
        expect(category.resetCursor).toBe(true);
      }
    });

    it('should return a SyncPlan with mode "incremental" from planIncremental', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planIncremental(ref);

      expect(plan.mode).toBe('incremental');
      expect(plan).toHaveProperty('ref');
      expect(plan).toHaveProperty('categories');
    });

    it('should set resetCursor = false for incremental categories', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planIncremental(ref);

      for (const category of plan.categories) {
        expect(category.resetCursor).toBe(false);
      }
    });

    it('should set fromOrdinal > 0 or = 0 for incremental (depends on markers)', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planIncremental(ref);

      for (const category of plan.categories) {
        expect(typeof category.fromOrdinal).toBe('number');
        expect(category.fromOrdinal).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return valid SessionRef in plan', async () => {
      const { planner, ref } = factory();
      const fullPlan = await planner.planFull(ref);
      const selectivePlan = await planner.planSelective(ref, ['metadata']);
      const incrementalPlan = await planner.planIncremental(ref);

      for (const plan of [fullPlan, selectivePlan, incrementalPlan]) {
        expect(plan.ref).toHaveProperty('tool');
        expect(plan.ref).toHaveProperty('sessionId');
        expect(plan.ref).toHaveProperty('locationHint');
      }
    });

    it('planSelective with empty categories array should return valid plan', async () => {
      const { planner, ref } = factory();
      const plan = await planner.planSelective(ref, []);

      expect(plan).toHaveProperty('mode');
      expect(plan.mode).toBe('selective');
      expect(plan).toHaveProperty('categories');
      // Empty request = empty result
      expect(plan.categories).toHaveLength(0);
    });
  });
}
