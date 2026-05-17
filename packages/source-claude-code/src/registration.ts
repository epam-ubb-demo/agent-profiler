/**
 * registerClaudeCode — factory function that registers both the
 * ClaudeCodeEnrichmentSource and ClaudeCodeSessionProjector into the
 * provided registries.
 */

import type { DiscoveredSession } from '@agent-profiler/adapters-claude-code';
import type { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';

import { ClaudeCodeSessionProjector } from './projector.js';
import { ClaudeCodeEnrichmentSource } from './source.js';

/**
 * Register the Claude Code source and projector into the provided registries.
 *
 * @param sourceRegistry - Registry to add the {@link ClaudeCodeEnrichmentSource} to.
 * @param projectorRegistry - Registry to add the {@link ClaudeCodeSessionProjector} to.
 * @param overrideSessions - Optional list of discovered sessions to use instead of
 *   filesystem discovery (useful for testing).
 */
export function registerClaudeCode(
  sourceRegistry: SourceRegistry,
  projectorRegistry: ProjectorRegistry,
  overrideSessions?: readonly DiscoveredSession[],
): void {
  sourceRegistry.register(new ClaudeCodeEnrichmentSource(overrideSessions));
  projectorRegistry.register(new ClaudeCodeSessionProjector());
}
