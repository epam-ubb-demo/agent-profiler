import { describe, expect, it } from 'vitest';

import { buildEventId } from '../src/event-id.js';

describe('buildEventId', () => {
  it('should build a complete event ID with all fields', () => {
    const id = buildEventId({
      tenantId: 'tenant-123',
      userId: 'user-456',
      tool: 'copilot-cli',
      sessionId: 'session-789',
      category: 'metadata',
      ordinal: 42,
    });

    expect(id).toBe(
      'tenant-123:user-456:copilot-cli:session-789:metadata:42',
    );
  });

  it('should build an event ID without tenantId', () => {
    const id = buildEventId({
      userId: 'user-456',
      tool: 'vscode-chat',
      sessionId: 'session-789',
      category: 'turns',
      ordinal: 10,
    });

    expect(id).toBe(':user-456:vscode-chat:session-789:turns:10');
  });

  it('should build an event ID without userId', () => {
    const id = buildEventId({
      tenantId: 'tenant-123',
      tool: 'claude-code',
      sessionId: 'session-789',
      category: 'context',
      ordinal: 5,
    });

    expect(id).toBe('tenant-123::claude-code:session-789:context:5');
  });

  it('should build an event ID without both optional fields', () => {
    const id = buildEventId({
      tool: 'copilot-cli',
      sessionId: 'session-789',
      category: 'metadata',
      ordinal: 0,
    });

    expect(id).toBe('::copilot-cli:session-789:metadata:0');
  });

  it('should handle ordinal as integer (not float)', () => {
    const id = buildEventId({
      tool: 'vscode-chat',
      sessionId: 'session-123',
      category: 'events',
      ordinal: 123,
    });

    expect(id).toMatch(/:\d+$/);
    expect(id).toMatch(/:123$/);
  });

  it('should handle zero ordinal', () => {
    const id = buildEventId({
      tenantId: 'tenant',
      userId: 'user',
      tool: 'copilot-cli',
      sessionId: 'session',
      category: 'cat',
      ordinal: 0,
    });

    expect(id).toMatch(/:0$/);
  });

  it('should handle large ordinal values', () => {
    const id = buildEventId({
      tool: 'claude-code',
      sessionId: 'session',
      category: 'cat',
      ordinal: 999999999,
    });

    expect(id).toMatch(/:999999999$/);
  });

  it('should preserve special characters in strings', () => {
    const id = buildEventId({
      tenantId: 'tenant-with-dash',
      userId: 'user_with_underscore',
      tool: 'copilot-cli',
      sessionId: 'session.with.dots',
      category: 'cat/with/slashes',
      ordinal: 1,
    });

    expect(id).toBe(
      'tenant-with-dash:user_with_underscore:copilot-cli:session.with.dots:cat/with/slashes:1',
    );
  });
});
