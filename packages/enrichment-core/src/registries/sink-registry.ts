import { DuplicateRegistrationError, NotFoundError } from '../errors.js';
import type { EnrichmentSink } from '../sink.js';

/**
 * Registry of {@link EnrichmentSink} instances, keyed by sink {@link EnrichmentSink.id}.
 */
export class SinkRegistry {
  readonly #sinks = new Map<string, EnrichmentSink>();

  /**
   * Register a sink.
   * @throws {DuplicateRegistrationError} if a sink with this id is already registered.
   */
  register(sink: EnrichmentSink): void {
    if (this.#sinks.has(sink.id)) {
      throw new DuplicateRegistrationError('SinkRegistry', sink.id);
    }
    this.#sinks.set(sink.id, sink);
  }

  /**
   * Retrieve the sink with the given id.
   * @throws {NotFoundError} if no sink is registered with this id.
   */
  forId(id: string): EnrichmentSink {
    const sink = this.#sinks.get(id);
    if (sink === undefined) {
      throw new NotFoundError('SinkRegistry', id);
    }
    return sink;
  }

  /** Return all registered sinks in insertion order. */
  list(): readonly EnrichmentSink[] {
    return [...this.#sinks.values()];
  }
}
