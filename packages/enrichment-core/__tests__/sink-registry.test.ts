import { describe, expect, it } from 'vitest';

import {
  DuplicateRegistrationError,
  NotFoundError,
  SinkRegistry,
  type EnrichmentSink,
  type PushResult,
} from '../src/index.js';

function createFakeSink(id: string): EnrichmentSink {
  return {
    id,
    availability: async () => true,
    supportsCategory: () => true,
    push: async (): Promise<PushResult> => ({
      acceptedOrdinals: [],
      rejected: [],
    }),
  };
}

describe('SinkRegistry', () => {
  it('should register and retrieve a sink', () => {
    const registry = new SinkRegistry();
    const sink = createFakeSink('sink-1');

    registry.register(sink);
    const retrieved = registry.forId('sink-1');

    expect(retrieved).toBe(sink);
  });

  it('should throw DuplicateRegistrationError when registering duplicate sink id', () => {
    const registry = new SinkRegistry();
    const sink1 = createFakeSink('sink-1');
    const sink2 = createFakeSink('sink-1');

    registry.register(sink1);
    expect(() => registry.register(sink2)).toThrow(DuplicateRegistrationError);
    expect(() => registry.register(sink2)).toThrow(
      /SinkRegistry with key "sink-1" is already registered/,
    );
  });

  it('should throw NotFoundError when retrieving unregistered sink id', () => {
    const registry = new SinkRegistry();
    expect(() => registry.forId('nonexistent')).toThrow(NotFoundError);
    expect(() => registry.forId('nonexistent')).toThrow(
      /SinkRegistry with key "nonexistent" is not registered/,
    );
  });

  it('should register multiple different sinks', () => {
    const registry = new SinkRegistry();
    const sink1 = createFakeSink('sink-1');
    const sink2 = createFakeSink('sink-2');
    const sink3 = createFakeSink('sink-3');

    registry.register(sink1);
    registry.register(sink2);
    registry.register(sink3);

    expect(registry.forId('sink-1')).toBe(sink1);
    expect(registry.forId('sink-2')).toBe(sink2);
    expect(registry.forId('sink-3')).toBe(sink3);
  });

  it('should list all registered sinks', () => {
    const registry = new SinkRegistry();
    const sink1 = createFakeSink('sink-1');
    const sink2 = createFakeSink('sink-2');

    registry.register(sink1);
    registry.register(sink2);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(sink1);
    expect(list).toContain(sink2);
  });

  it('should return empty list when no sinks registered', () => {
    const registry = new SinkRegistry();
    const list = registry.list();
    expect(list).toHaveLength(0);
    expect(list).toEqual([]);
  });

  it('should return insertion order in list()', () => {
    const registry = new SinkRegistry();
    const sink1 = createFakeSink('sink-1');
    const sink2 = createFakeSink('sink-2');
    const sink3 = createFakeSink('sink-3');

    registry.register(sink1);
    registry.register(sink2);
    registry.register(sink3);

    const list = registry.list();
    expect(list[0]).toBe(sink1);
    expect(list[1]).toBe(sink2);
    expect(list[2]).toBe(sink3);
  });

  it('should return array that cannot affect internal state when mutated', () => {
    const registry = new SinkRegistry();
    const sink = createFakeSink('sink-1');
    registry.register(sink);

    const list1 = registry.list();
    const originalLength = list1.length;

    // Try to mutate the returned array
    (list1 as EnrichmentSink[]).push(createFakeSink('sink-2'));

    // Get a fresh list - it should not have been affected
    const list2 = registry.list();
    expect(list2).toHaveLength(originalLength);
    expect(list2[0]).toBe(sink);
  });

  it('should handle sink ids with special characters', () => {
    const registry = new SinkRegistry();
    const sink1 = createFakeSink('sink-with-dash');
    const sink2 = createFakeSink('sink_with_underscore');
    const sink3 = createFakeSink('sink.with.dots');

    registry.register(sink1);
    registry.register(sink2);
    registry.register(sink3);

    expect(registry.forId('sink-with-dash')).toBe(sink1);
    expect(registry.forId('sink_with_underscore')).toBe(sink2);
    expect(registry.forId('sink.with.dots')).toBe(sink3);
  });
});
