/**
 * Unit tests for registerVsCodeChat.
 */

import { ProjectorRegistry, SourceRegistry } from '@agent-profiler/enrichment-core';
import { describe, expect, it } from 'vitest';

import { VsCodeChatSessionProjector } from '../src/projector.js';
import { registerVsCodeChat } from '../src/registration.js';
import { VsCodeChatEnrichmentSource } from '../src/source.js';

describe('registerVsCodeChat', () => {
  it('registers a VsCodeChatEnrichmentSource in the source registry', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerVsCodeChat(sourceRegistry, projectorRegistry);

    const source = sourceRegistry.forTool('vscode-chat');
    expect(source).toBeInstanceOf(VsCodeChatEnrichmentSource);
  });

  it('registers a VsCodeChatSessionProjector in the projector registry', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerVsCodeChat(sourceRegistry, projectorRegistry);

    const projector = projectorRegistry.forTool('vscode-chat');
    expect(projector).toBeInstanceOf(VsCodeChatSessionProjector);
  });

  it('registered source has tool = vscode-chat', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerVsCodeChat(sourceRegistry, projectorRegistry);

    const source = sourceRegistry.forTool('vscode-chat');
    expect(source.tool).toBe('vscode-chat');
  });

  it('throws if the same tool is registered twice', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerVsCodeChat(sourceRegistry, projectorRegistry);
    expect(() => registerVsCodeChat(sourceRegistry, projectorRegistry)).toThrow();
  });

  it('uses provided override sessions when supplied', () => {
    const sourceRegistry = new SourceRegistry();
    const projectorRegistry = new ProjectorRegistry();

    registerVsCodeChat(sourceRegistry, projectorRegistry, []);

    const source = sourceRegistry.forTool('vscode-chat') as VsCodeChatEnrichmentSource;
    expect(source).toBeDefined();
    expect(source.tool).toBe('vscode-chat');
  });
});
