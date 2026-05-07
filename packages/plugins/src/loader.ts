/**
 * Plugin loader for the Agent Profiler plugin system.
 *
 * Provides functions to dynamically import plugin modules,
 * validate their manifests, and discover plugins from a directory.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { pluginManifestSchema } from './schemas';
import type { PluginManifest } from './types';

/**
 * Error thrown when a plugin fails to load or validate.
 */
export class PluginLoadError extends Error {
  override readonly name = 'PluginLoadError';

  constructor(
    public readonly pluginPath: string,
    public readonly cause?: unknown,
  ) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
    super(`Failed to load plugin at "${pluginPath}": ${causeMessage}`);
  }
}

/**
 * Dynamically imports a plugin module and validates its manifest.
 *
 * The module must export a `PluginManifest` either as a default export
 * or as a named `manifest` export.
 *
 * @param pluginPath - Absolute or relative path to the plugin module.
 * @returns The validated plugin manifest.
 * @throws {PluginLoadError} If the module cannot be imported or fails validation.
 */
export async function loadPlugin(pluginPath: string): Promise<PluginManifest> {
  const resolvedPath = resolve(pluginPath);

  let module: Record<string, unknown>;
  try {
    module = (await import(resolvedPath)) as Record<string, unknown>;
  } catch (err) {
    throw new PluginLoadError(resolvedPath, err);
  }

  // Support both default and named `manifest` export
  const rawManifest = module['default'] ?? module['manifest'];
  if (!rawManifest) {
    throw new PluginLoadError(
      resolvedPath,
      new Error('Module does not export a default or named "manifest" export'),
    );
  }

  const result = pluginManifestSchema.safeParse(rawManifest);
  if (!result.success) {
    throw new PluginLoadError(resolvedPath, result.error);
  }

  return rawManifest as PluginManifest;
}

/**
 * Scans a directory for plugin packages and loads valid ones.
 *
 * Looks for subdirectories containing a `package.json` with the
 * `"agent-profiler-plugin"` keyword, then attempts to load them.
 * Invalid or broken plugins are silently skipped.
 *
 * @param directory - Absolute path to the plugins directory.
 * @returns Array of validated plugin manifests.
 */
export async function discoverPlugins(directory: string): Promise<PluginManifest[]> {
  const resolvedDir = resolve(directory);
  const manifests: PluginManifest[] = [];

  let entries: string[];
  try {
    entries = await readdir(resolvedDir);
  } catch {
    return manifests;
  }

  for (const entry of entries) {
    const entryPath = join(resolvedDir, entry);
    const entryStat = await stat(entryPath).catch(() => null);

    if (!entryStat?.isDirectory()) continue;

    // Check for package.json with plugin keyword
    const pkgPath = join(entryPath, 'package.json');
    try {
      const pkgStat = await stat(pkgPath);
      if (!pkgStat.isFile()) continue;

      const pkgModule = (await import(pkgPath, { with: { type: 'json' } })) as {
        default: { keywords?: string[] };
      };
      const keywords: string[] = pkgModule.default.keywords ?? [];
      if (!keywords.includes('agent-profiler-plugin')) continue;
    } catch {
      continue;
    }

    // Attempt to load the plugin entry point
    try {
      const manifest = await loadPlugin(entryPath);
      manifests.push(manifest);
    } catch {
      // Skip invalid plugins during discovery
      continue;
    }
  }

  return manifests;
}
