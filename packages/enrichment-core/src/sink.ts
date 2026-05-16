import type { EnrichmentEvent } from './enrichment-event.js';

export interface RejectInfo {
  readonly ordinal: number;
  readonly reason: string;
}

export interface PushResult {
  readonly acceptedOrdinals: readonly number[];
  readonly rejected: readonly RejectInfo[];
  /** Suggested retry delay in milliseconds, if the sink is temporarily unavailable. */
  readonly retryAfter?: number | undefined;
}

export class RetriableSinkError extends Error {
  public readonly retryAfterMs: number | undefined;

  constructor(message: string, retryAfterMs?: number | undefined) {
    super(message);
    this.name = 'RetriableSinkError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface EnrichmentSink {
  /** Unique identifier for this sink instance. */
  readonly id: string;

  /** Returns true when the sink is reachable and ready to accept data. */
  availability(): Promise<boolean>;

  /** Returns true when this sink handles the given category. */
  supportsCategory(category: string): boolean;

  /** Push a batch of events. Returns a PushResult describing what was accepted. */
  push(batch: readonly EnrichmentEvent[]): Promise<PushResult>;
}
