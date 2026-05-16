import type { SinkRegistry } from '@agent-profiler/enrichment-core';

import { DcrEnrichmentSink } from './sink.js';
import type { DcrSinkConfig } from './sink.js';

/**
 * Creates a {@link DcrEnrichmentSink} and registers it into the provided
 * {@link SinkRegistry}.
 *
 * @param registry - Registry to register the sink into.
 * @param config - Sink configuration including the DCE endpoint, DCR rule ID,
 *   and stream name.
 * @returns The newly created and registered sink instance.
 */
export function registerDcrSink(
  registry: SinkRegistry,
  config: DcrSinkConfig,
): DcrEnrichmentSink {
  const sink = new DcrEnrichmentSink(config);
  registry.register(sink);
  return sink;
}
