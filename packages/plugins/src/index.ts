/**
 * @agent-profiler/plugins — public API barrel.
 *
 * Re-exports all plugin types, schemas, loader utilities, and type guards.
 */

// Types
export type {
  PluginMetadata,
  SessionSourcePlugin,
  VisualiserPlugin,
  PluginManifest,
} from './types';

export { isSessionSourcePlugin, isVisualiserPlugin } from './types';

// Schemas
export {
  pluginMetadataSchema,
  sessionSourcePluginSchema,
  visualiserPluginSchema,
  pluginSchema,
  pluginManifestSchema,
} from './schemas';
export type { ValidatedPluginManifest } from './schemas';

// Loader
export { loadPlugin, discoverPlugins, PluginLoadError } from './loader';
