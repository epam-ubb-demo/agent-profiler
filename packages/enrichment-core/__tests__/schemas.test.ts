import { describe, expect, it } from 'vitest';

import {
  enrichmentCursorSchema,
  enrichmentEventSchema,
  markerSchema,
  sessionRefSchema,
  toolIdSchema,
} from '../src/index.js';

describe('Zod schemas', () => {
  describe('toolIdSchema', () => {
    it('should accept valid ToolIds', () => {
      expect(toolIdSchema.parse('copilot-cli')).toBe('copilot-cli');
      expect(toolIdSchema.parse('vscode-chat')).toBe('vscode-chat');
      expect(toolIdSchema.parse('claude-code')).toBe('claude-code');
    });

    it('should reject unknown tool IDs', () => {
      expect(() => toolIdSchema.parse('unknown-tool')).toThrow();
      expect(() => toolIdSchema.parse('copilot')).toThrow();
      expect(() => toolIdSchema.parse('')).toThrow();
    });
  });

  describe('enrichmentEventSchema', () => {
    const validEvent = {
      schemaVersion: 1,
      tool: 'copilot-cli' as const,
      toolVersion: '1.0.0',
      sourceMachine: 'MacBook-Pro',
      sessionId: 'session-123',
      category: 'metadata',
      ordinal: 0,
      eventId: '::copilot-cli:session-123:metadata:0',
      eventTs: new Date().toISOString(),
      payloadSchema: 'copilot-cli/metadata/v2',
      payload: { version: '2.0', language: 'en' },
    };

    it('should accept valid enrichment events', () => {
      const result = enrichmentEventSchema.parse(validEvent);
      expect(result).toEqual(validEvent);
    });

    it('should accept events with optional tenantId and userId', () => {
      const eventWithIds = {
        ...validEvent,
        tenantId: 'tenant-123',
        userId: 'user-456',
      };
      const result = enrichmentEventSchema.parse(eventWithIds);
      expect(result.tenantId).toBe('tenant-123');
      expect(result.userId).toBe('user-456');
    });

    it('should reject events with missing required fields', () => {
      const incomplete = { ...validEvent };
      delete (incomplete as Partial<typeof validEvent>).tool;
      expect(() => enrichmentEventSchema.parse(incomplete)).toThrow();
    });

    it('should reject events with invalid ordinal (negative)', () => {
      expect(() =>
        enrichmentEventSchema.parse({ ...validEvent, ordinal: -1 }),
      ).toThrow();
    });

    it('should reject events with non-integer ordinal', () => {
      expect(() =>
        enrichmentEventSchema.parse({ ...validEvent, ordinal: 3.14 }),
      ).toThrow();
    });

    it('should accept ordinal 0', () => {
      const result = enrichmentEventSchema.parse({ ...validEvent, ordinal: 0 });
      expect(result.ordinal).toBe(0);
    });

    it('should reject events with wrong tool type', () => {
      expect(() =>
        enrichmentEventSchema.parse({ ...validEvent, tool: 'invalid-tool' }),
      ).toThrow();
    });

    it('should reject events with schemaVersion other than 1', () => {
      expect(() =>
        enrichmentEventSchema.parse({ ...validEvent, schemaVersion: 2 }),
      ).toThrow();
    });
  });

  describe('enrichmentCursorSchema', () => {
    const validCursor = {
      tool: 'vscode-chat' as const,
      sessionId: 'session-456',
      category: 'turns',
      lastOrdinal: 42,
      lastEventId: '::vscode-chat:session-456:turns:42',
      lastEventTs: new Date().toISOString(),
      lastIngestedAt: new Date().toISOString(),
    };

    it('should accept valid cursors', () => {
      const result = enrichmentCursorSchema.parse(validCursor);
      expect(result).toEqual(validCursor);
    });

    it('should reject cursors with negative lastOrdinal', () => {
      expect(() =>
        enrichmentCursorSchema.parse({ ...validCursor, lastOrdinal: -1 }),
      ).toThrow();
    });

    it('should reject cursors with non-integer lastOrdinal', () => {
      expect(() =>
        enrichmentCursorSchema.parse({ ...validCursor, lastOrdinal: 1.5 }),
      ).toThrow();
    });

    it('should accept cursor with lastOrdinal 0', () => {
      const result = enrichmentCursorSchema.parse({
        ...validCursor,
        lastOrdinal: 0,
      });
      expect(result.lastOrdinal).toBe(0);
    });
  });

  describe('sessionRefSchema', () => {
    const validRef = {
      tool: 'claude-code' as const,
      sessionId: 'session-789',
      locationHint: '/path/to/session',
    };

    it('should accept valid session refs', () => {
      const result = sessionRefSchema.parse(validRef);
      expect(result).toEqual(validRef);
    });

    it('should reject refs with missing tool', () => {
      const { tool: _tool, ...incomplete } = validRef;
      expect(() => sessionRefSchema.parse(incomplete)).toThrow();
    });

    it('should reject refs with invalid tool', () => {
      expect(() =>
        sessionRefSchema.parse({ ...validRef, tool: 'bad-tool' }),
      ).toThrow();
    });

    it('should reject refs with missing sessionId', () => {
      const { sessionId: _sessionId, ...incomplete } = validRef;
      expect(() => sessionRefSchema.parse(incomplete)).toThrow();
    });
  });

  describe('markerSchema', () => {
    const validMarker = {
      schemaVersion: 2,
      tool: 'copilot-cli' as const,
      sessionId: 'session-111',
      cursors: {
        metadata: {
          tool: 'copilot-cli' as const,
          sessionId: 'session-111',
          category: 'metadata',
          lastOrdinal: 0,
          lastEventId: '::copilot-cli:session-111:metadata:0',
          lastEventTs: new Date().toISOString(),
          lastIngestedAt: new Date().toISOString(),
        },
      },
      payloadSchemaVersions: {
        metadata: 'v2',
      },
    };

    it('should accept valid markers with schemaVersion 2', () => {
      const result = markerSchema.parse(validMarker);
      expect(result.schemaVersion).toBe(2);
    });

    it('should accept markers with optional tenantId and userId', () => {
      const markerWithIds = {
        ...validMarker,
        tenantId: 'tenant-222',
        userId: 'user-333',
      };
      const result = markerSchema.parse(markerWithIds);
      expect(result.tenantId).toBe('tenant-222');
      expect(result.userId).toBe('user-333');
    });

    it('should accept markers with lastFullReuploadAt', () => {
      const markerWithReupload = {
        ...validMarker,
        lastFullReuploadAt: new Date().toISOString(),
      };
      const result = markerSchema.parse(markerWithReupload);
      expect(result.lastFullReuploadAt).toBeDefined();
    });

    it('should reject markers with schemaVersion 1', () => {
      expect(() =>
        markerSchema.parse({ ...validMarker, schemaVersion: 1 }),
      ).toThrow();
    });

    it('should reject markers with schemaVersion 3', () => {
      expect(() =>
        markerSchema.parse({ ...validMarker, schemaVersion: 3 }),
      ).toThrow();
    });

    it('should reject markers with non-2 schemaVersion', () => {
      expect(() =>
        markerSchema.parse({ ...validMarker, schemaVersion: '2' }),
      ).toThrow();
    });

    it('should accept empty cursors record', () => {
      const result = markerSchema.parse({ ...validMarker, cursors: {} });
      expect(result.cursors).toEqual({});
    });

    it('should accept empty payloadSchemaVersions record', () => {
      const result = markerSchema.parse({
        ...validMarker,
        payloadSchemaVersions: {},
      });
      expect(result.payloadSchemaVersions).toEqual({});
    });
  });
});
