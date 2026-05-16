/**
 * @agent-profiler/enrichment-core/testing — Contract test factories and fake implementations.
 * 
 * This module provides reusable contract test suites that any implementation
 * of SessionEnrichmentSource, EnrichmentSink, MarkerStore, or SyncPlanner
 * must pass. Use these to verify compliance with the enrichment-core interfaces.
 * 
 * @example
 * ```typescript
 * import { runSourceContractTests } from '@agent-profiler/enrichment-core/testing';
 * import { MySource } from './my-source';
 * 
 * describe('MySource', () => {
 *   runSourceContractTests(() => ({
 *     source: new MySource(),
 *     fixture: { tool: 'copilot-cli', sessionId: 'test', locationHint: '/test' },
 *   }));
 * });
 * ```
 */

export { runSourceContractTests } from './source-contract.js';
export { runSinkContractTests } from './sink-contract.js';
export { runMarkerContractTests } from './marker-contract.js';
export { runPlannerContractTests } from './planner-contract.js';

export {
  createFakeSource,
  createFakeSink,
  createFakeMarkerStore,
  createTestCursor,
  createTestMarker,
  createTestEvent,
  createTestSessionRef,
} from './fakes.js';
