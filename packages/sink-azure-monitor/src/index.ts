/**
 * @agent-profiler/sink-azure-monitor — public API barrel.
 *
 * Exports the Azure Monitor enrichment sink, its configuration types,
 * the row mapper utilities, and the registration factory.
 */

export { AzureMonitorEnrichmentSink } from './sink.js';
export type { AzureMonitorSinkConfig, RowUploader } from './sink.js';

export { registerAzureMonitorSink } from './registration.js';

export { mapEventToRow, mapEventsToRows, VALID_CATEGORIES } from './row-mapper.js';
