import type { Session } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import {
  DuplicateRegistrationError,
  NotFoundError,
  ProjectorRegistry,
  type SessionProjector,
  type ToolId,
} from '../src/index.js';

function createFakeProjector(tool: ToolId): SessionProjector {
  return {
    tool,
    project: (): Session => ({
      id: 'session-id',
      events: [],
    }),
  };
}

describe('ProjectorRegistry', () => {
  it('should register and retrieve a projector', () => {
    const registry = new ProjectorRegistry();
    const projector = createFakeProjector('copilot-cli');

    registry.register(projector);
    const retrieved = registry.forTool('copilot-cli');

    expect(retrieved).toBe(projector);
  });

  it('should throw DuplicateRegistrationError when registering duplicate tool', () => {
    const registry = new ProjectorRegistry();
    const projector1 = createFakeProjector('copilot-cli');
    const projector2 = createFakeProjector('copilot-cli');

    registry.register(projector1);
    expect(() => registry.register(projector2)).toThrow(DuplicateRegistrationError);
    expect(() => registry.register(projector2)).toThrow(
      /ProjectorRegistry with key "copilot-cli" is already registered/,
    );
  });

  it('should throw NotFoundError when retrieving unregistered tool', () => {
    const registry = new ProjectorRegistry();
    expect(() => registry.forTool('vscode-chat')).toThrow(NotFoundError);
    expect(() => registry.forTool('vscode-chat')).toThrow(
      /ProjectorRegistry with key "vscode-chat" is not registered/,
    );
  });

  it('should register multiple different projectors', () => {
    const registry = new ProjectorRegistry();
    const projector1 = createFakeProjector('copilot-cli');
    const projector2 = createFakeProjector('vscode-chat');
    const projector3 = createFakeProjector('claude-code');

    registry.register(projector1);
    registry.register(projector2);
    registry.register(projector3);

    expect(registry.forTool('copilot-cli')).toBe(projector1);
    expect(registry.forTool('vscode-chat')).toBe(projector2);
    expect(registry.forTool('claude-code')).toBe(projector3);
  });

  it('should list all registered projectors', () => {
    const registry = new ProjectorRegistry();
    const projector1 = createFakeProjector('copilot-cli');
    const projector2 = createFakeProjector('vscode-chat');

    registry.register(projector1);
    registry.register(projector2);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(projector1);
    expect(list).toContain(projector2);
  });

  it('should return empty list when no projectors registered', () => {
    const registry = new ProjectorRegistry();
    const list = registry.list();
    expect(list).toHaveLength(0);
    expect(list).toEqual([]);
  });

  it('should return insertion order in list()', () => {
    const registry = new ProjectorRegistry();
    const projector1 = createFakeProjector('copilot-cli');
    const projector2 = createFakeProjector('vscode-chat');
    const projector3 = createFakeProjector('claude-code');

    registry.register(projector1);
    registry.register(projector2);
    registry.register(projector3);

    const list = registry.list();
    expect(list[0]).toBe(projector1);
    expect(list[1]).toBe(projector2);
    expect(list[2]).toBe(projector3);
  });

  it('should return array that cannot affect internal state when mutated', () => {
    const registry = new ProjectorRegistry();
    const projector = createFakeProjector('copilot-cli');
    registry.register(projector);

    const list1 = registry.list();
    const originalLength = list1.length;

    // Try to mutate the returned array
    (list1 as SessionProjector[]).push(createFakeProjector('vscode-chat'));

    // Get a fresh list - it should not have been affected
    const list2 = registry.list();
    expect(list2).toHaveLength(originalLength);
    expect(list2[0]).toBe(projector);
  });
});
