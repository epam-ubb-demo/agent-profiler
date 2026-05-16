/**
 * registerCopilotCli — factory function that registers both the
 * CopilotCliEnrichmentSource and CopilotCliSessionProjector into the
 * provided registries.
 */

import type { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';

import { CopilotCliSessionProjector } from './projector.js';
import { CopilotCliEnrichmentSource } from './source.js';

/**
 * Register the Copilot CLI source and projector into the provided registries.
 *
 * @param sourceRegistry - Registry to add the {@link CopilotCliEnrichmentSource} to.
 * @param projectorRegistry - Registry to add the {@link CopilotCliSessionProjector} to.
 * @param rootDir - Root directory that contains Copilot CLI session folders.
 */
export function registerCopilotCli(
  sourceRegistry: SourceRegistry,
  projectorRegistry: ProjectorRegistry,
  rootDir: string,
): void {
  sourceRegistry.register(new CopilotCliEnrichmentSource(rootDir));
  projectorRegistry.register(new CopilotCliSessionProjector());
}
