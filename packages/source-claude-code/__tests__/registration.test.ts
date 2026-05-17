/**
 * Unit tests for registerClaudeCode.
 */

import { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';
import { describe, expect, it } from 'vitest';

import { ClaudeCodeSessionProjector } from '../src/projector.js';
import { registerClaudeCode } from '../src/registration.js';
import { ClaudeCodeEnrichmentSource } from '../src/source.js';

describe('registerClaudeCode', () => {
  it('registers a ClaudeCodeEnrichmentSource in the source registry', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerClaudeCode(sourceRegistry, projectorRegistry);

    const source = sourceRegistry.forTool('claude-code');
    expect(source).toBeInstanceOf(ClaudeCodeEnrichmentSource);
  });

  it('registers a ClaudeCodeSessionProjector in the projector registry', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerClaudeCode(sourceRegistry, projectorRegistry);

    const projector = projectorRegistry.forTool('claude-code');
    expect(projector).toBeInstanceOf(ClaudeCodeSessionProjector);
  });

  it('registered source has tool = claude-code', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerClaudeCode(sourceRegistry, projectorRegistry);

    const source = sourceRegistry.forTool('claude-code');
    expect(source.tool).toBe('claude-code');
  });

  it('throws if the same tool is registered twice', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerClaudeCode(sourceRegistry, projectorRegistry);
    expect(() => registerClaudeCode(sourceRegistry, projectorRegistry)).toThrow();
  });

  it('uses provided override sessions when supplied', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerClaudeCode(sourceRegistry, projectorRegistry, []);

    const source = sourceRegistry.forTool('claude-code') as ClaudeCodeEnrichmentSource;
    expect(source).toBeDefined();
    expect(source.tool).toBe('claude-code');
  });
});
