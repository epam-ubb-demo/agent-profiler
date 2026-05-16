/**
 * Registration tests and contract tests for AzureMonitorEnrichmentSink.
 */

import { SinkRegistry } from '@agent-profiler/enrichment-core';
import {
  createTestEvent,
  runSinkContractTests,
} from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it } from 'vitest';

import { registerAzureMonitorSink } from '../src/registration.js';
import { AzureMonitorEnrichmentSink } from '../src/sink.js';

function makeNoOpUploader() {
  return async (_rows: readonly unknown[]) => {};
}

describe('registerAzureMonitorSink', () => {
  it('returns an AzureMonitorEnrichmentSink instance', () => {
    const registry = new SinkRegistry();
    const sink = registerAzureMonitorSink(registry, { upload: makeNoOpUploader() });

    expect(sink).toBeInstanceOf(AzureMonitorEnrichmentSink);
  });

  it('registers the sink in the provided registry under its id', () => {
    const registry = new SinkRegistry();
    registerAzureMonitorSink(registry, { upload: makeNoOpUploader() });

    const retrieved = registry.forId('azure-monitor');
    expect(retrieved).toBeInstanceOf(AzureMonitorEnrichmentSink);
  });

  it('registers under a custom id when config.id is provided', () => {
    const registry = new SinkRegistry();
    registerAzureMonitorSink(registry, {
      id: 'custom-monitor',
      upload: makeNoOpUploader(),
    });

    const retrieved = registry.forId('custom-monitor');
    expect(retrieved).toBeInstanceOf(AzureMonitorEnrichmentSink);
  });

  it('throws when the same id is registered twice', () => {
    const registry = new SinkRegistry();
    registerAzureMonitorSink(registry, { upload: makeNoOpUploader() });

    expect(() =>
      registerAzureMonitorSink(registry, { upload: makeNoOpUploader() }),
    ).toThrow();
  });

  it('returns the same sink instance that is in the registry', () => {
    const registry = new SinkRegistry();
    const returnedSink = registerAzureMonitorSink(registry, { upload: makeNoOpUploader() });
    const registrySink = registry.forId('azure-monitor');

    expect(returnedSink).toBe(registrySink);
  });
});

// ---- EnrichmentSink contract tests ----

runSinkContractTests(() => ({
  sink: new AzureMonitorEnrichmentSink({ upload: makeNoOpUploader() }),
  events: [
    createTestEvent('copilot-cli', 'session-contract', 'metadata', 0),
    createTestEvent('copilot-cli', 'session-contract', 'metadata', 1),
    createTestEvent('copilot-cli', 'session-contract', 'utilisation', 2),
  ],
}));
