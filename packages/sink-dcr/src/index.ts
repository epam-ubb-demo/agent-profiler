export { DcrEnrichmentSink } from './sink.js';
export type { DcrSinkConfig } from './sink.js';
export { registerDcrSink } from './registration.js';
export type { DcrRow } from './schema.js';
export { mapEventToDcrRow, mapEventsToDcrRows, mapDcrRowToEvent } from './row-mapper.js';
export { dcrRowSchema } from './schemas/dcr-row.js';
