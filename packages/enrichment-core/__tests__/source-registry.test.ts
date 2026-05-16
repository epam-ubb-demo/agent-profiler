import { describe, expect, it } from 'vitest';

import {
  DuplicateRegistrationError,
  NotFoundError,
  SourceRegistry,
  type SessionEnrichmentSource,
  type ToolId,
} from '../src/index.js';

function createFakeSource(tool: ToolId): SessionEnrichmentSource {
  return {
    tool,
    async *discoverSessions() {
      // Empty iterable
    },
    async *readEvents() {
      // Empty iterable
    },
    watch: () => ({
      on: () => {},
      close: () => {},
    }),
    categoriesFor: async () => [],
  };
}

describe('SourceRegistry', () => {
  it('should register and retrieve a source', () => {
    const registry = new SourceRegistry();
    const source = createFakeSource('copilot-cli');

    registry.register(source);
    const retrieved = registry.forTool('copilot-cli');

    expect(retrieved).toBe(source);
  });

  it('should throw DuplicateRegistrationError when registering duplicate tool', () => {
    const registry = new SourceRegistry();
    const source1 = createFakeSource('copilot-cli');
    const source2 = createFakeSource('copilot-cli');

    registry.register(source1);
    expect(() => registry.register(source2)).toThrow(DuplicateRegistrationError);
    expect(() => registry.register(source2)).toThrow(
      /SourceRegistry with key "copilot-cli" is already registered/,
    );
  });

  it('should throw NotFoundError when retrieving unregistered tool', () => {
    const registry = new SourceRegistry();
    expect(() => registry.forTool('vscode-chat')).toThrow(NotFoundError);
    expect(() => registry.forTool('vscode-chat')).toThrow(
      /SourceRegistry with key "vscode-chat" is not registered/,
    );
  });

  it('should register multiple different sources', () => {
    const registry = new SourceRegistry();
    const source1 = createFakeSource('copilot-cli');
    const source2 = createFakeSource('vscode-chat');
    const source3 = createFakeSource('claude-code');

    registry.register(source1);
    registry.register(source2);
    registry.register(source3);

    expect(registry.forTool('copilot-cli')).toBe(source1);
    expect(registry.forTool('vscode-chat')).toBe(source2);
    expect(registry.forTool('claude-code')).toBe(source3);
  });

  it('should list all registered sources', () => {
    const registry = new SourceRegistry();
    const source1 = createFakeSource('copilot-cli');
    const source2 = createFakeSource('vscode-chat');

    registry.register(source1);
    registry.register(source2);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(source1);
    expect(list).toContain(source2);
  });

  it('should return empty list when no sources registered', () => {
    const registry = new SourceRegistry();
    const list = registry.list();
    expect(list).toHaveLength(0);
    expect(list).toEqual([]);
  });

  it('should return insertion order in list()', () => {
    const registry = new SourceRegistry();
    const source1 = createFakeSource('copilot-cli');
    const source2 = createFakeSource('vscode-chat');
    const source3 = createFakeSource('claude-code');

    registry.register(source1);
    registry.register(source2);
    registry.register(source3);

    const list = registry.list();
    expect(list[0]).toBe(source1);
    expect(list[1]).toBe(source2);
    expect(list[2]).toBe(source3);
  });

  it('should return array that cannot affect internal state when mutated', () => {
    const registry = new SourceRegistry();
    const source = createFakeSource('copilot-cli');
    registry.register(source);

    const list1 = registry.list();
    const originalLength = list1.length;

    // Try to mutate the returned array
    (list1 as SessionEnrichmentSource[]).push(createFakeSource('vscode-chat'));

    // Get a fresh list - it should not have been affected
    const list2 = registry.list();
    expect(list2).toHaveLength(originalLength);
    expect(list2[0]).toBe(source);
  });
});
