import type {
  MarkerStore,
  PlannedCategory,
  SessionEnrichmentSource,
  SessionRef,
  SyncPlan,
  SyncPlanner,
} from '@agent-profiler/enrichment-core';

/**
 * Default SyncPlanner implementation.
 *
 * Consults a MarkerStore to read existing cursors and a
 * SessionEnrichmentSource to enumerate available categories.
 */
export class DefaultSyncPlanner implements SyncPlanner {
  constructor(
    private readonly markerStore: MarkerStore,
    private readonly source: SessionEnrichmentSource,
  ) {}

  async planFull(ref: SessionRef): Promise<SyncPlan> {
    const categories = await this.source.categoriesFor(ref);
    const planned: PlannedCategory[] = categories.map((category) => ({
      category,
      fromOrdinal: 0,
      resetCursor: true,
    }));
    return { ref, categories: planned, mode: 'full' };
  }

  async planSelective(ref: SessionRef, categories: readonly string[]): Promise<SyncPlan> {
    const planned: PlannedCategory[] = categories.map((category) => ({
      category,
      fromOrdinal: 0,
      resetCursor: true,
    }));
    return { ref, categories: planned, mode: 'selective' };
  }

  async planIncremental(ref: SessionRef): Promise<SyncPlan> {
    const [marker, categories] = await Promise.all([
      this.markerStore.read(ref),
      this.source.categoriesFor(ref),
    ]);

    const planned: PlannedCategory[] = categories.map((category) => {
      const cursor = marker?.cursors[category];
      // Resume from the ordinal after the last ingested one, or from 0 if no cursor.
      const fromOrdinal = cursor !== undefined ? cursor.lastOrdinal + 1 : 0;
      return {
        category,
        fromOrdinal,
        resetCursor: false,
      };
    });
    return { ref, categories: planned, mode: 'incremental' };
  }
}
