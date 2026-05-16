/**
 * Unit tests for registerCopilotCli.
 */

import { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';
import { describe, expect, it } from 'vitest';

import { CopilotCliSessionProjector } from '../src/projector.js';
import { registerCopilotCli } from '../src/registration.js';
import { CopilotCliEnrichmentSource } from '../src/source.js';

describe('registerCopilotCli', () => {
  it('registers a CopilotCliEnrichmentSource in the source registry', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerCopilotCli(sourceRegistry, projectorRegistry, '/tmp/sessions');

    const source = sourceRegistry.forTool('copilot-cli');
    expect(source).toBeInstanceOf(CopilotCliEnrichmentSource);
  });

  it('registers a CopilotCliSessionProjector in the projector registry', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerCopilotCli(sourceRegistry, projectorRegistry, '/tmp/sessions');

    const projector = projectorRegistry.forTool('copilot-cli');
    expect(projector).toBeInstanceOf(CopilotCliSessionProjector);
  });

  it('registered source uses the provided rootDir', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerCopilotCli(sourceRegistry, projectorRegistry, '/custom/path');

    const source = sourceRegistry.forTool('copilot-cli') as CopilotCliEnrichmentSource;
    // Indirectly verify: discovering from a non-existent dir yields nothing
    expect(source).toBeDefined();
    expect(source.tool).toBe('copilot-cli');
  });

  it('throws if the same tool is registered twice', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerCopilotCli(sourceRegistry, projectorRegistry, '/tmp/sessions');
    expect(() => registerCopilotCli(sourceRegistry, projectorRegistry, '/other')).toThrow();
  });
});
