import type { SinkRegistry } from '@agent-profiler/enrichment-core';

import { AzureMonitorEnrichmentSink } from './sink.js';
import type { AzureMonitorSinkConfig } from './sink.js';

/**
 * Creates an {@link AzureMonitorEnrichmentSink} and registers it into the
 * provided {@link SinkRegistry}.
 *
 * @param registry - Registry to register the sink into.
 * @param config - Sink configuration including the upload function.
 * @returns The newly created and registered sink instance.
 */
export function registerAzureMonitorSink(
  registry: SinkRegistry,
  config: AzureMonitorSinkConfig,
): AzureMonitorEnrichmentSink {
  const sink = new AzureMonitorEnrichmentSink(config);
  registry.register(sink);
  return sink;
}
