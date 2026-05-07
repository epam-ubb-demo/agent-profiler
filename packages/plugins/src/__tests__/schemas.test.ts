import { describe, expect, it } from 'vitest';

import {
  pluginManifestSchema,
  pluginMetadataSchema,
  sessionSourcePluginSchema,
  visualiserPluginSchema,
} from '../schemas';

describe('pluginMetadataSchema', () => {
  it('validates a complete metadata object', () => {
    const result = pluginMetadataSchema.safeParse({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      author: 'Test Author',
    });
    expect(result.success).toBe(true);
  });

  it('validates metadata without optional fields', () => {
    const result = pluginMetadataSchema.safeParse({
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('rejects metadata with empty id', () => {
    const result = pluginMetadataSchema.safeParse({
      id: '',
      name: 'Test Plugin',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects metadata with invalid version format', () => {
    const result = pluginMetadataSchema.safeParse({
      id: 'test',
      name: 'Test',
      version: 'not-a-version',
    });
    expect(result.success).toBe(false);
  });

  it('rejects metadata with missing name', () => {
    const result = pluginMetadataSchema.safeParse({
      id: 'test',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});

describe('sessionSourcePluginSchema', () => {
  it('validates a valid session source plugin', () => {
    const result = sessionSourcePluginSchema.safeParse({
      metadata: { id: 'csv', name: 'CSV Source', version: '1.0.0' },
      adapterType: 'csv',
      createDataSource: () => ({}),
    });
    expect(result.success).toBe(true);
  });

  it('rejects plugin with empty adapterType', () => {
    const result = sessionSourcePluginSchema.safeParse({
      metadata: { id: 'csv', name: 'CSV Source', version: '1.0.0' },
      adapterType: '',
      createDataSource: () => ({}),
    });
    expect(result.success).toBe(false);
  });

  it('rejects plugin without createDataSource function', () => {
    const result = sessionSourcePluginSchema.safeParse({
      metadata: { id: 'csv', name: 'CSV Source', version: '1.0.0' },
      adapterType: 'csv',
    });
    expect(result.success).toBe(false);
  });
});

describe('visualiserPluginSchema', () => {
  it('validates a valid visualiser plugin', () => {
    const result = visualiserPluginSchema.safeParse({
      metadata: { id: 'timeline', name: 'Timeline', version: '2.0.0' },
      componentName: 'TimelineView',
      load: async () => () => null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects visualiser without componentName', () => {
    const result = visualiserPluginSchema.safeParse({
      metadata: { id: 'timeline', name: 'Timeline', version: '2.0.0' },
      load: async () => () => null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects visualiser without load function', () => {
    const result = visualiserPluginSchema.safeParse({
      metadata: { id: 'timeline', name: 'Timeline', version: '2.0.0' },
      componentName: 'TimelineView',
    });
    expect(result.success).toBe(false);
  });
});

describe('pluginManifestSchema', () => {
  it('validates a manifest with a session source plugin', () => {
    const result = pluginManifestSchema.safeParse({
      apiVersion: '1.0',
      plugins: [
        {
          metadata: { id: 'csv', name: 'CSV Source', version: '1.0.0' },
          adapterType: 'csv',
          createDataSource: () => ({}),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates a manifest with a visualiser plugin', () => {
    const result = pluginManifestSchema.safeParse({
      apiVersion: '1.0',
      plugins: [
        {
          metadata: { id: 'timeline', name: 'Timeline', version: '1.0.0' },
          componentName: 'TimelineView',
          load: async () => () => null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates a manifest with multiple plugins', () => {
    const result = pluginManifestSchema.safeParse({
      apiVersion: '1.0',
      plugins: [
        {
          metadata: { id: 'csv', name: 'CSV Source', version: '1.0.0' },
          adapterType: 'csv',
          createDataSource: () => ({}),
        },
        {
          metadata: { id: 'timeline', name: 'Timeline', version: '1.0.0' },
          componentName: 'TimelineView',
          load: async () => () => null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a manifest with unsupported apiVersion', () => {
    const result = pluginManifestSchema.safeParse({
      apiVersion: '2.0',
      plugins: [
        {
          metadata: { id: 'csv', name: 'CSV', version: '1.0.0' },
          adapterType: 'csv',
          createDataSource: () => ({}),
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a manifest with empty plugins array', () => {
    const result = pluginManifestSchema.safeParse({
      apiVersion: '1.0',
      plugins: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a manifest without apiVersion', () => {
    const result = pluginManifestSchema.safeParse({
      plugins: [
        {
          metadata: { id: 'csv', name: 'CSV', version: '1.0.0' },
          adapterType: 'csv',
          createDataSource: () => ({}),
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
