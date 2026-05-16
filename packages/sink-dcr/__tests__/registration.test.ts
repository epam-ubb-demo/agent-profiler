/**
 * Registration tests for DcrEnrichmentSink + sink contract compliance.
 */

import { SinkRegistry } from '@agent-profiler/enrichment-core';
import { createTestEvent, runSinkContractTests } from '@agent-profiler/enrichment-core/testing';
import { describe, expect, it, vi } from 'vitest';

import { registerDcrSink } from '../src/registration.js';
import { DcrEnrichmentSink } from '../src/sink.js';

// Provide a static mock for @azure/monitor-ingestion so the contract tests
// (which call push() under the hood) always succeed without hitting Azure.
vi.mock('@azure/monitor-ingestion', () => ({
  LogsIngestionClient: vi.fn().mockImplementation(() => ({
    upload: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn().mockResolvedValue({ token: 'test-token', expiresOnTimestamp: 9_999_999 }),
  })),
}));

// Test helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG = {
  endpoint: 'https://dce-test.eastus-1.ingest.monitor.azure.com',
  ruleId: 'dcr-abc123',
  streamName: 'Custom-AgentSessionEvents_CL',
} as const;

function makeRegistry() {
  return new SinkRegistry();
}

// ---------------------------------------------------------------------------
// registerDcrSink()
// ---------------------------------------------------------------------------

describe('registerDcrSink()', () => {
  it('returns a DcrEnrichmentSink instance', () => {
    const registry = makeRegistry();
    const sink = registerDcrSink(registry, BASE_CONFIG);
    expect(sink).toBeInstanceOf(DcrEnrichmentSink);
  });

  it('registers the sink by its id', () => {
    const registry = makeRegistry();
    const sink = registerDcrSink(registry, BASE_CONFIG);
    expect(registry.forId(sink.id)).toBe(sink);
  });

  it('respects a custom id when provided', () => {
    const registry = makeRegistry();
    const sink = registerDcrSink(registry, { ...BASE_CONFIG, id: 'my-custom-dcr' });
    expect(sink.id).toBe('my-custom-dcr');
    expect(registry.forId('my-custom-dcr')).toBe(sink);
  });

  it('throws when a sink with the same id is registered twice', () => {
    const registry = makeRegistry();
    registerDcrSink(registry, BASE_CONFIG);
    expect(() => registerDcrSink(registry, BASE_CONFIG)).toThrow();
  });

  it('returns the same sink instance that was registered', () => {
    const registry = makeRegistry();
    const returned = registerDcrSink(registry, BASE_CONFIG);
    const retrieved = registry.forId(returned.id);
    expect(retrieved).toBe(returned);
  });
});

// ---------------------------------------------------------------------------
// Sink contract
// ---------------------------------------------------------------------------

runSinkContractTests(() => {
  const registry = makeRegistry();
  const sink = registerDcrSink(registry, BASE_CONFIG);
  const events = [
    createTestEvent('copilot-cli', 'session-contract', 'metadata', 0),
    createTestEvent('copilot-cli', 'session-contract', 'utilisation', 1),
    createTestEvent('copilot-cli', 'session-contract', 'compaction', 2),
  ];
  return { sink, events };
});
