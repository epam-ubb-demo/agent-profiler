import type { SessionRef } from './enrichment-event.js';

export interface PlannedCategory {
  category: string;
  /** Ordinal to start reading from (inclusive). 0 means from the beginning. */
  fromOrdinal: number;
  /** When true, the existing cursor for this category must be reset before syncing. */
  resetCursor: boolean;
}

export interface SyncPlan {
  ref: SessionRef;
  categories: readonly PlannedCategory[];
  mode: 'full' | 'selective' | 'incremental';
}

export interface SyncPlanner {
  /** Build a plan that re-syncs every category from scratch. */
  planFull(ref: SessionRef): Promise<SyncPlan>;

  /** Build a plan limited to the supplied categories. */
  planSelective(ref: SessionRef, categories: readonly string[]): Promise<SyncPlan>;

  /** Build a plan that only processes categories with new events since the last run. */
  planIncremental(ref: SessionRef): Promise<SyncPlan>;
}
