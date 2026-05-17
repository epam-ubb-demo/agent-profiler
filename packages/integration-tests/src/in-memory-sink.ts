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
  /** When set, the sink rejects events at these ordinals. */
  readonly rejectOrdinals?: ReadonlySet<number> | undefined;
  /** When true, push() throws RetriableSinkError. */
  readonly failOnPush?: boolean | undefined;
}

export class InMemorySink implements EnrichmentSink {
  readonly id: string;
  private readonly supportedCategories: readonly string[];
  private readonly rejectOrdinals: ReadonlySet<number>;
  private readonly failOnPush: boolean;

  /** All events accepted by the sink, in push order. */
  readonly pushedEvents: EnrichmentEvent[] = [];
  /** Number of times push() was called. */
  pushCallCount = 0;

  constructor(options?: InMemorySinkOptions) {
    this.id = options?.id ?? 'in-memory-sink';
    this.supportedCategories = options?.supportedCategories ?? [];
    this.rejectOrdinals = options?.rejectOrdinals ?? new Set();
    this.failOnPush = options?.failOnPush ?? false;
  }

  async availability(): Promise<boolean> {
    return !this.failOnPush;
  }

  supportsCategory(_category: string): boolean {
    // Empty array = support all categories
    return this.supportedCategories.length === 0 || this.supportedCategories.includes(_category);
  }

  async push(batch: readonly EnrichmentEvent[]): Promise<PushResult> {
    this.pushCallCount++;

    if (this.failOnPush) {
      throw new RetriableSinkError('Sink unavailable', 100);
    }

    const accepted: number[] = [];
    const rejected: RejectInfo[] = [];

    for (const event of batch) {
      if (this.rejectOrdinals.has(event.ordinal)) {
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
