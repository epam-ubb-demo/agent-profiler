import { describe, expect, it } from 'vitest';

import { isSessionSourcePlugin, isVisualiserPlugin } from '../types';
import type { SessionSourcePlugin, VisualiserPlugin } from '../types';

describe('isSessionSourcePlugin', () => {
  it('returns true for a SessionSourcePlugin', () => {
    const plugin = {
      metadata: { id: 'test', name: 'Test', version: '1.0.0' },
      adapterType: 'csv',
      createDataSource: () => ({
        listSessions: async () => [],
        getSession: async () => null,
        isAvailable: async () => true,
      }),
    } satisfies SessionSourcePlugin;

    expect(isSessionSourcePlugin(plugin)).toBe(true);
  });

  it('returns false for a VisualiserPlugin', () => {
    const plugin = {
      metadata: { id: 'test', name: 'Test', version: '1.0.0' },
      componentName: 'TestComponent',
      load: async () => () => null,
    } as unknown as VisualiserPlugin;

    expect(isSessionSourcePlugin(plugin)).toBe(false);
  });
});

describe('isVisualiserPlugin', () => {
  it('returns true for a VisualiserPlugin', () => {
    const plugin = {
      metadata: { id: 'test', name: 'Test', version: '1.0.0' },
      componentName: 'TestComponent',
      load: async () => () => null,
    } as unknown as VisualiserPlugin;

    expect(isVisualiserPlugin(plugin)).toBe(true);
  });

  it('returns false for a SessionSourcePlugin', () => {
    const plugin = {
      metadata: { id: 'test', name: 'Test', version: '1.0.0' },
      adapterType: 'csv',
      createDataSource: () => ({
        listSessions: async () => [],
        getSession: async () => null,
        isAvailable: async () => true,
      }),
    } satisfies SessionSourcePlugin;

    expect(isVisualiserPlugin(plugin)).toBe(false);
  });
});
