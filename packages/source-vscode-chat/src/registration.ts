/**
 * registerVsCodeChat — factory function that registers both the
 * VsCodeChatEnrichmentSource and VsCodeChatSessionProjector into the
 * provided registries.
 */

import type { DiscoveredSession } from '@agent-profiler/adapters-vscode-chat';
import type { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';

import { VsCodeChatSessionProjector } from './projector.js';
import { VsCodeChatEnrichmentSource } from './source.js';

/**
 * Register the VS Code Chat source and projector into the provided registries.
 *
 * @param sourceRegistry - Registry to add the {@link VsCodeChatEnrichmentSource} to.
 * @param projectorRegistry - Registry to add the {@link VsCodeChatSessionProjector} to.
 * @param overrideSessions - Optional list of discovered sessions to use instead of
 *   filesystem discovery (useful for testing).
 */
export function registerVsCodeChat(
  sourceRegistry: SourceRegistry,
  projectorRegistry: ProjectorRegistry,
  overrideSessions?: readonly DiscoveredSession[],
): void {
  sourceRegistry.register(new VsCodeChatEnrichmentSource(overrideSessions));
  projectorRegistry.register(new VsCodeChatSessionProjector());
}
