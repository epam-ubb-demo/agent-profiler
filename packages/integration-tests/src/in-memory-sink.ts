/**
 * InMemorySink — an {@link EnrichmentSink} implementation that captures all
 * pushed events in memory. Used for pipeline integration tests to verify that
 * the correct events flow from source through the orchestrator to the sink.
 */

import { RetriableSinkError } from '@agent-profiler/enrichment-core';
import type { EnrichmentEvent, EnrichmentSink, PushResult, RejectInfo } from '@agent-profiler/enrichment-core';

export interface InMemorySinkOptions {
  readonly id?: string | undefined;
  readonly supportedCategories?: readonly string[] | undefined;
  /** When set, the sink rejects events whose eventId is in this set. */
  readonly rejectEventIds?: ReadonlySet<string> | undefined;
  /** When true, push() throws RetriableSinkError. */
  readonly failOnPush?: boolean | undefined;
  /**
   * When set, push() throws RetriableSinkError before processing any events
   * in a call once this many events have already been accepted in prior push()
   * calls. The throw happens at the start of the call (before any events in
   * that batch are added to pushedEvents). Simulates a crash mid-sync for
   * resilience testing.
   */
  readonly failAfterPushCount?: number | undefined;
}

export class InMemorySink implements EnrichmentSink {
  readonly id: string;
  private readonly supportedCategories: readonly string[];
  private readonly rejectEventIds: ReadonlySet<string>;
  private readonly failOnPush: boolean;
  private readonly failAfterPushCount: number | undefined;

  /** All events accepted by the sink, in push order. */
  readonly pushedEvents: EnrichmentEvent[] = [];
  /** Number of times push() was called. */
  pushCallCount = 0;

  constructor(options?: InMemorySinkOptions) {
    this.id = options?.id ?? 'in-memory-sink';
    this.supportedCategories = options?.supportedCategories ?? ['*'];
    this.rejectEventIds = options?.rejectEventIds ?? new Set();
    this.failOnPush = options?.failOnPush ?? false;
    this.failAfterPushCount = options?.failAfterPushCount;
  }

  async availability(): Promise<boolean> {
    return !this.failOnPush;
  }

  supportsCategory(category: string): boolean {
    return this.supportedCategories.includes('*') || this.supportedCategories.includes(category);
  }

  async push(batch: readonly EnrichmentEvent[]): Promise<PushResult> {
    this.pushCallCount++;

    if (this.failAfterPushCount !== undefined && this.pushedEvents.length >= this.failAfterPushCount) {
      throw new RetriableSinkError('Sink unavailable after limit', 100);
    }

    if (this.failOnPush) {
      throw new RetriableSinkError('Sink unavailable', 100);
    }

    const accepted: number[] = [];
    const rejected: RejectInfo[] = [];

    for (const event of batch) {
      if (this.rejectEventIds.has(event.eventId)) {
        rejected.push({ ordinal: event.ordinal, reason: 'Rejected by test configuration' });
      } else {
        accepted.push(event.ordinal);
        this.pushedEvents.push(event);
      }
    }

    return { acceptedOrdinals: accepted, rejected };
  }

  /** Reset all captured state. */
  clear(): void {
    this.pushedEvents.length = 0;
    this.pushCallCount = 0;
  }
}
