import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverPlugins, loadPlugin, PluginLoadError } from '../loader';

describe('loadPlugin', () => {
  it('throws PluginLoadError for non-existent module', async () => {
    await expect(loadPlugin('/nonexistent/path/plugin.js')).rejects.toThrow(PluginLoadError);
  });

  it('throws PluginLoadError with correct pluginPath', async () => {
    try {
      await loadPlugin('/nonexistent/path/plugin.js');
    } catch (err) {
      expect(err).toBeInstanceOf(PluginLoadError);
      expect((err as PluginLoadError).pluginPath).toContain(join('nonexistent', 'path', 'plugin.js'));
    }
  });

  it('throws PluginLoadError when module has no manifest export', async () => {
    // Create a mock module path that resolves to an empty module
    const emptyModulePath = join(import.meta.dirname, '__fixtures__', 'empty-module.mjs');
    await expect(loadPlugin(emptyModulePath)).rejects.toThrow(PluginLoadError);
    await expect(loadPlugin(emptyModulePath)).rejects.toThrow(
      /does not export a default or named "manifest" export/,
    );
  });

  it('throws PluginLoadError when manifest is invalid', async () => {
    const invalidPath = join(import.meta.dirname, '__fixtures__', 'invalid-manifest.mjs');
    await expect(loadPlugin(invalidPath)).rejects.toThrow(PluginLoadError);
  });

  it('successfully loads a valid plugin with default export', async () => {
    const validPath = join(import.meta.dirname, '__fixtures__', 'valid-plugin.mjs');
    const manifest = await loadPlugin(validPath);
    expect(manifest.apiVersion).toBe('1.0');
    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins[0]!.metadata.id).toBe('fixture-plugin');
  });

  it('successfully loads a valid plugin with named manifest export', async () => {
    const validPath = join(import.meta.dirname, '__fixtures__', 'named-export-plugin.mjs');
    const manifest = await loadPlugin(validPath);
    expect(manifest.apiVersion).toBe('1.0');
    expect(manifest.plugins[0]!.metadata.id).toBe('named-plugin');
  });
});

describe('discoverPlugins', () => {
  it('returns empty array for non-existent directory', async () => {
    const result = await discoverPlugins('/nonexistent/directory');
    expect(result).toEqual([]);
  });

  it('returns empty array for directory with no plugin packages', async () => {
    const fixturesDir = join(import.meta.dirname, '__fixtures__', 'no-plugins');
    const result = await discoverPlugins(fixturesDir);
    expect(result).toEqual([]);
  });

  it('discovers valid plugins in a directory', async () => {
    const fixturesDir = join(import.meta.dirname, '__fixtures__', 'discover');
    const result = await discoverPlugins(fixturesDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.apiVersion).toBe('1.0');
  });

  it('skips directories without package.json', async () => {
    const fixturesDir = join(import.meta.dirname, '__fixtures__', 'discover');
    const result = await discoverPlugins(fixturesDir);
    // Only the valid-pkg directory should be discovered
    expect(result.length).toBeLessThanOrEqual(1);
  });
});

describe('PluginLoadError', () => {
  it('has correct name property', () => {
    const err = new PluginLoadError('/some/path', new Error('test'));
    expect(err.name).toBe('PluginLoadError');
  });

  it('includes plugin path in message', () => {
    const err = new PluginLoadError('/some/path', new Error('test'));
    expect(err.message).toContain('/some/path');
  });

  it('includes cause message in error message', () => {
    const err = new PluginLoadError('/some/path', new Error('root cause'));
    expect(err.message).toContain('root cause');
  });

  it('handles non-Error cause', () => {
    const err = new PluginLoadError('/some/path', 'string cause');
    expect(err.message).toContain('string cause');
  });

  it('handles undefined cause', () => {
    const err = new PluginLoadError('/some/path');
    expect(err.message).toContain('Unknown error');
  });
});
