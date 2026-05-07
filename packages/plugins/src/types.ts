/**
 * Plugin type definitions for the Agent Profiler plugin system.
 *
 * These interfaces define the stable v1.0 plugin contract.
 * Plugin authors implement these interfaces to extend Agent Profiler
 * with custom session sources and visualisers.
 *
 * @packageDocumentation
 */

import type { Session } from '@agent-profiler/core';
import type { SessionDataSource } from '@agent-profiler/data-source';
import type { ComponentType } from 'react';

/**
 * Metadata that every plugin must provide for identification and display.
 */
export interface PluginMetadata {
  /** Unique plugin identifier (e.g., "csv-source", "my-visualiser"). */
  readonly id: string;
  /** Human-readable plugin name. */
  readonly name: string;
  /** Semantic version string (e.g., "1.0.0"). */
  readonly version: string;
  /** Optional description of the plugin. */
  readonly description?: string;
  /** Optional author name or email. */
  readonly author?: string;
}

/**
 * Plugin that provides a custom session data source.
 *
 * Wraps a `SessionDataSource` implementation with metadata and
 * a factory method for configuration-based instantiation.
 */
export interface SessionSourcePlugin {
  readonly metadata: PluginMetadata;
  /** Adapter type identifier. Allows custom types beyond built-in adapters. */
  readonly adapterType: string;
  /** Create a configured data source instance. */
  createDataSource(config: Record<string, unknown>): SessionDataSource;
}

/**
 * Plugin that provides a custom session visualiser component.
 *
 * The component is loaded lazily and receives a session as its prop.
 */
export interface VisualiserPlugin {
  readonly metadata: PluginMetadata;
  /** Name of the React component export. */
  readonly componentName: string;
  /** Lazily load the visualiser React component. */
  load(): Promise<ComponentType<{ session: Session }>>;
}

/**
 * Manifest exported by a plugin package.
 *
 * Each plugin module must default-export or named-export a `PluginManifest`.
 */
export interface PluginManifest {
  /** API version this plugin targets. Currently only '1.0' is supported. */
  readonly apiVersion: '1.0';
  /** Array of plugins provided by this package. */
  readonly plugins: Array<SessionSourcePlugin | VisualiserPlugin>;
}

/**
 * Type guard: checks if a plugin is a SessionSourcePlugin.
 */
export function isSessionSourcePlugin(
  plugin: SessionSourcePlugin | VisualiserPlugin,
): plugin is SessionSourcePlugin {
  return 'adapterType' in plugin && 'createDataSource' in plugin;
}

/**
 * Type guard: checks if a plugin is a VisualiserPlugin.
 */
export function isVisualiserPlugin(
  plugin: SessionSourcePlugin | VisualiserPlugin,
): plugin is VisualiserPlugin {
  return 'componentName' in plugin && 'load' in plugin;
}
