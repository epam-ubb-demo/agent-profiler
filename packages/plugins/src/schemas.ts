/**
 * Zod schemas for validating plugin manifests at runtime.
 *
 * Used by the plugin loader to ensure loaded modules conform
 * to the expected plugin contract before they are used.
 */

import { z } from 'zod';

/** Schema for plugin metadata. */
export const pluginMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must be a valid semver version'),
  description: z.string().optional(),
  author: z.string().optional(),
});

/** Schema for SessionSourcePlugin. */
export const sessionSourcePluginSchema = z.object({
  metadata: pluginMetadataSchema,
  adapterType: z.string().min(1),
  createDataSource: z.function(),
});

/** Schema for VisualiserPlugin. */
export const visualiserPluginSchema = z.object({
  metadata: pluginMetadataSchema,
  componentName: z.string().min(1),
  load: z.function(),
});

/** Schema for a single plugin (either type). */
export const pluginSchema = z.union([sessionSourcePluginSchema, visualiserPluginSchema]);

/** Schema for the full plugin manifest. */
export const pluginManifestSchema = z.object({
  apiVersion: z.literal('1.0'),
  plugins: z.array(pluginSchema).min(1),
});

export type ValidatedPluginManifest = z.infer<typeof pluginManifestSchema>;
