/**
 * Schema validation tests.
 *
 * These tests ensure that:
 * 1. The golden fixture parses correctly against all schemas
 * 2. Invalid data is correctly rejected
 * 3. All schema constraints are exercised
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import { syncSettingsSchema, syncStatusSchema } from '../ipc-schemas';
import {
  sessionSchema,
  toolCallSchema,
  assistantMessageSchema,
  userMessageSchema,
  compactionSchema,
  subagentInvocationSchema,
  shutdownMetricsSchema,
  utilisationSampleSchema,
  modelMetricsSchema,
  tokenBucketSchema,
  fanoutTurnSchema,
  annotationSchema,
  variantSchema,
  benchRunSchema,
  parseStatusSchema,
  modelChangeSchema,
  turnSchema,
  syncMarkerSchema,
  enrichmentRowSchema,
} from '../schemas/index';

import { loadGoldenSession } from './fixtures/loader';

describe('Golden fixture validation', () => {
  it('parses the golden session fixture without errors', () => {
    const session = loadGoldenSession();
    expect(session.sessionId).toBe('sess-abc-123-def-456');
    expect(session.parseStatus.status).toBe('ok');
  });

  it('contains expected number of elements', () => {
    const session = loadGoldenSession();
    expect(session.turns).toHaveLength(5);
    expect(session.toolCalls).toHaveLength(3);
    expect(session.compactions).toHaveLength(1);
    expect(session.subagents).toHaveLength(1);
    expect(session.assistantMessages).toHaveLength(5);
    expect(session.userMessages).toHaveLength(2);
    expect(session.utilisation).toHaveLength(3);
  });

  it('validates shutdown metrics are present', () => {
    const session = loadGoldenSession();
    expect(session.shutdown).not.toBeNull();
    expect(session.shutdown!.modelMetrics).toHaveLength(1);
    expect(session.shutdown!.totalPremiumRequests).toBe(5);
  });
});

describe('toolCallSchema', () => {
  it('accepts a valid tool call', () => {
    const valid = {
      toolCallId: 'tc-001',
      toolName: 'bash',
      model: 'claude-sonnet-4-20250514',
      startTs: '2025-01-15T10:00:30.000Z',
      endTs: '2025-01-15T10:00:32.500Z',
      durationMs: 2500,
      success: true,
      parentId: null,
      turnId: 'turn-1',
      eventId: 'evt-010',
      argumentsPreview: 'ls -la',
    };
    expect(toolCallSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing required fields', () => {
    expect(() => toolCallSchema.parse({})).toThrow(ZodError);
  });

  it('rejects invalid success type', () => {
    expect(() =>
      toolCallSchema.parse({
        toolCallId: 'tc-001',
        toolName: 'bash',
        model: null,
        startTs: null,
        endTs: null,
        durationMs: null,
        success: 'yes',
        parentId: null,
        turnId: null,
        eventId: null,
        argumentsPreview: '',
      }),
    ).toThrow(ZodError);
  });
});

describe('assistantMessageSchema', () => {
  it('accepts a valid assistant message', () => {
    const valid = {
      interactionId: 'int-001',
      requestId: 'req-001',
      outputTokens: 150,
      inputTokens: 2000,
      cacheReadTokens: 500,
      cacheWriteTokens: 1500,
      model: 'claude-sonnet-4-20250514',
      timestamp: '2025-01-15T10:00:25.000Z',
      turnId: 'turn-1',
      eventId: 'evt-005',
      parentId: null,
      content: 'Hello',
      reasoningText: '',
    };
    expect(assistantMessageSchema.parse(valid)).toEqual(valid);
  });

  it('rejects negative token counts', () => {
    expect(() =>
      assistantMessageSchema.parse({
        interactionId: null,
        requestId: null,
        outputTokens: -1,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        model: null,
        timestamp: null,
        turnId: null,
        eventId: null,
        parentId: null,
        content: '',
        reasoningText: '',
      }),
    ).toThrow(ZodError);
  });
});

describe('userMessageSchema', () => {
  it('accepts a valid user message', () => {
    const valid = {
      interactionId: 'int-001',
      timestamp: '2025-01-15T10:00:00.000Z',
      turnId: 'turn-1',
      content: 'Fix the bug',
    };
    expect(userMessageSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing content', () => {
    expect(() =>
      userMessageSchema.parse({
        interactionId: null,
        timestamp: null,
        turnId: null,
      }),
    ).toThrow(ZodError);
  });
});

describe('compactionSchema', () => {
  it('accepts a valid compaction', () => {
    const valid = {
      timestamp: '2025-01-15T10:02:30.000Z',
      inputTokens: 8000,
      outputTokens: 1200,
      cacheRead: 6000,
      cacheWrite: 0,
      model: 'claude-sonnet-4-20250514',
      turnId: 'turn-3',
    };
    expect(compactionSchema.parse(valid)).toEqual(valid);
  });

  it('rejects negative tokens', () => {
    expect(() =>
      compactionSchema.parse({
        timestamp: null,
        inputTokens: -100,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        model: null,
        turnId: null,
      }),
    ).toThrow(ZodError);
  });
});

describe('subagentInvocationSchema', () => {
  it('accepts a valid sub-agent invocation', () => {
    const valid = {
      timestamp: '2025-01-15T10:04:30.000Z',
      totalTokens: 3500,
      messageCount: 4,
      toolCallCount: 2,
      turnId: 'turn-5',
      eventId: 'evt-040',
      parentId: null,
      agentName: 'test-runner',
      agentType: 'task',
      childSessionRef: 'sess-child-789',
    };
    expect(subagentInvocationSchema.parse(valid)).toEqual(valid);
  });
});

describe('shutdownMetricsSchema', () => {
  it('accepts valid shutdown metrics', () => {
    const valid = {
      totalPremiumRequests: 5,
      totalApiDurationMs: 28000,
      modelMetrics: [
        {
          model: 'claude-sonnet-4-20250514',
          inputTokens: 23500,
          outputTokens: 1270,
          cacheReadTokens: 18500,
          cacheWriteTokens: 1500,
          reasoningTokens: 0,
          requestCount: 5,
          premiumRequestCost: 0,
          apiDurationMs: 28000,
        },
      ],
      currentTokens: 12000,
      systemTokens: 3000,
      conversationTokens: 7000,
      toolDefinitionsTokens: 2000,
      codeChanges: {},
      timestamp: '2025-01-15T10:05:30.000Z',
    };
    expect(shutdownMetricsSchema.parse(valid)).toBeDefined();
  });
});

describe('utilisationSampleSchema', () => {
  it('accepts a valid utilisation sample', () => {
    const valid = {
      timestamp: '2025-01-15T10:00:25.000Z',
      percentage: 15.5,
      used: 3100,
      total: 20000,
      buckets: { system: 1500, conversation: 1000, toolDefinitions: 600 },
    };
    expect(utilisationSampleSchema.parse(valid)).toEqual(valid);
  });

  it('rejects percentage > 100', () => {
    expect(() =>
      utilisationSampleSchema.parse({
        timestamp: '2025-01-15T10:00:25.000Z',
        percentage: 101,
        used: 100,
        total: 100,
        buckets: { system: 50, conversation: 30, toolDefinitions: 20 },
      }),
    ).toThrow(ZodError);
  });

  it('rejects zero total', () => {
    expect(() =>
      utilisationSampleSchema.parse({
        timestamp: '2025-01-15T10:00:25.000Z',
        percentage: 50,
        used: 100,
        total: 0,
        buckets: { system: 50, conversation: 30, toolDefinitions: 20 },
      }),
    ).toThrow(ZodError);
  });
});

describe('modelMetricsSchema', () => {
  it('accepts valid model metrics', () => {
    const valid = {
      model: 'claude-sonnet-4-20250514',
      inputTokens: 23500,
      outputTokens: 1270,
      cacheReadTokens: 18500,
      cacheWriteTokens: 1500,
      reasoningTokens: 0,
      requestCount: 5,
      premiumRequestCost: 3,
      apiDurationMs: 28000,
    };
    expect(modelMetricsSchema.parse(valid)).toEqual(valid);
  });

  it('defaults premiumRequestCost to 0 when omitted', () => {
    const withoutCost = {
      model: 'claude-sonnet-4-20250514',
      inputTokens: 23500,
      outputTokens: 1270,
      cacheReadTokens: 18500,
      cacheWriteTokens: 1500,
      requestCount: 5,
      apiDurationMs: 28000,
    };
    const parsed = modelMetricsSchema.parse(withoutCost);
    expect(parsed.premiumRequestCost).toBe(0);
  });
});

describe('tokenBucketSchema', () => {
  it('accepts valid token buckets', () => {
    const valid = { system: 1500, conversation: 1000, toolDefinitions: 600 };
    expect(tokenBucketSchema.parse(valid)).toEqual(valid);
  });
});

describe('fanoutTurnSchema', () => {
  it('accepts valid fanout turn', () => {
    const session = loadGoldenSession();
    const fanout = session.fanoutTurns[0];
    expect(fanoutTurnSchema.parse(fanout)).toBeDefined();
  });
});

describe('annotationSchema', () => {
  it('accepts a valid annotation', () => {
    const valid = {
      id: 'ann-001',
      targetType: 'turn' as const,
      targetId: 'turn-1',
      label: 'interesting',
      comment: 'This turn took longer than expected',
      createdAt: '2025-01-16T09:00:00.000Z',
      author: 'user@example.com',
    };
    expect(annotationSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid target type', () => {
    expect(() =>
      annotationSchema.parse({
        id: 'ann-001',
        targetType: 'session',
        targetId: 'sess-1',
        label: 'x',
        comment: '',
        createdAt: '2025-01-16T09:00:00.000Z',
        author: 'user',
      }),
    ).toThrow(ZodError);
  });
});

describe('variantSchema', () => {
  it('accepts a valid variant', () => {
    const valid = {
      id: 'var-001',
      label: 'baseline',
      description: 'Baseline run with default model',
      sessionId: 'sess-abc-123',
    };
    expect(variantSchema.parse(valid)).toEqual(valid);
  });
});

describe('benchRunSchema', () => {
  it('accepts a valid bench run', () => {
    const valid = {
      id: 'bench-001',
      name: 'Model comparison run',
      description: 'Comparing claude-sonnet vs gpt-4',
      createdAt: '2025-01-15T10:00:00.000Z',
      variants: [
        {
          id: 'var-001',
          label: 'sonnet',
          description: 'Claude Sonnet baseline',
          sessionId: 'sess-001',
        },
      ],
      metadata: { prompt: 'Fix the bug' },
    };
    expect(benchRunSchema.parse(valid)).toBeDefined();
  });
});

describe('parseStatusSchema', () => {
  it('accepts ok status', () => {
    expect(parseStatusSchema.parse({ status: 'ok', error: null })).toEqual({
      status: 'ok',
      error: null,
    });
  });

  it('accepts failed status with error', () => {
    expect(
      parseStatusSchema.parse({ status: 'failed', error: 'JSON parse error at line 42' }),
    ).toEqual({ status: 'failed', error: 'JSON parse error at line 42' });
  });

  it('rejects invalid status', () => {
    expect(() => parseStatusSchema.parse({ status: 'unknown', error: null })).toThrow(ZodError);
  });
});

describe('modelChangeSchema', () => {
  it('accepts a valid model change', () => {
    const valid = { timestamp: '2025-01-15T10:02:00.000Z', model: 'claude-sonnet-4-20250514' };
    expect(modelChangeSchema.parse(valid)).toEqual(valid);
  });
});

describe('turnSchema', () => {
  it('accepts a valid turn', () => {
    const session = loadGoldenSession();
    const turn = session.turns[0];
    expect(turnSchema.parse(turn)).toBeDefined();
  });
});

describe('sessionSchema — rejection', () => {
  it('rejects a completely empty object', () => {
    expect(() => sessionSchema.parse({})).toThrow(ZodError);
  });

  it('rejects session with missing parseStatus', () => {
    const session = loadGoldenSession();
    const { parseStatus: _, ...without } = session;
    expect(() => sessionSchema.parse(without)).toThrow(ZodError);
  });
});

describe('syncMarkerSchema', () => {
  it('accepts a valid sync marker', () => {
    const valid = {
      version: 1,
      lastSyncedAt: '2025-01-15T10:00:00Z',
      lastSyncedRowCount: 1024,
      lastSyncedEventId: 'evt-001',
      lastEventTimestamp: '2025-01-15T10:00:30Z',
      categoriesPushed: ['metadata', 'utilisation'],
      schemaVersion: 1,
    };
    expect(syncMarkerSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing required fields', () => {
    expect(() => syncMarkerSchema.parse({})).toThrow(ZodError);
  });

  it('rejects invalid version (not 1)', () => {
    expect(() =>
      syncMarkerSchema.parse({
        version: 2,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedRowCount: 0,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: [],
        schemaVersion: 1,
      }),
    ).toThrow(ZodError);
  });

  it('rejects negative row count', () => {
    expect(() =>
      syncMarkerSchema.parse({
        version: 1,
        lastSyncedAt: '2025-01-15T10:00:00Z',
        lastSyncedRowCount: -1,
        lastSyncedEventId: 'evt-001',
        lastEventTimestamp: '2025-01-15T10:00:00Z',
        categoriesPushed: [],
        schemaVersion: 1,
      }),
    ).toThrow(ZodError);
  });

  it('accepts zero row count', () => {
    const valid = {
      version: 1,
      lastSyncedAt: '2025-01-15T10:00:00Z',
      lastSyncedRowCount: 0,
      lastSyncedEventId: 'evt-001',
      lastEventTimestamp: '2025-01-15T10:00:00Z',
      categoriesPushed: [],
      schemaVersion: 1,
    };
    expect(syncMarkerSchema.parse(valid)).toEqual(valid);
  });

  it('accepts all valid category enum values', () => {
    const valid = {
      version: 1,
      lastSyncedAt: '2025-01-15T10:00:00Z',
      lastSyncedRowCount: 0,
      lastSyncedEventId: 'evt-001',
      lastEventTimestamp: '2025-01-15T10:00:00Z',
      categoriesPushed: ['metadata', 'utilisation', 'compactions', 'toolResults'],
      schemaVersion: 1,
    };
    expect(syncMarkerSchema.parse(valid)).toEqual(valid);
  });
});

describe('enrichmentRowSchema', () => {
  it('accepts a valid enrichment row', () => {
    const valid = {
      TimeGenerated: '2025-01-15T10:00:00Z',
      EventId: 'sess-001:metadata:0',
      SessionId: 'sess-001',
      Category: 'metadata',
      Payload: { copilotVersion: '1.0.0', repository: 'test-repo' },
      SchemaVersion: 1,
      SourceUser: 'testuser',
      SourceMachine: 'testmachine',
      PushedAt: '2025-01-15T10:00:05Z',
    };
    expect(enrichmentRowSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing required fields', () => {
    expect(() => enrichmentRowSchema.parse({})).toThrow(ZodError);
  });

  it('rejects invalid Category enum value', () => {
    expect(() =>
      enrichmentRowSchema.parse({
        TimeGenerated: '2025-01-15T10:00:00Z',
        EventId: 'sess-001:unknown:0',
        SessionId: 'sess-001',
        Category: 'invalid_category',
        Payload: {},
        SchemaVersion: 1,
        SourceUser: 'testuser',
        SourceMachine: 'testmachine',
        PushedAt: '2025-01-15T10:00:05Z',
      }),
    ).toThrow(ZodError);
  });

  it('accepts all valid Category enum values', () => {
    const categories = ['metadata', 'utilisation', 'compaction', 'tool_result'] as const;
    for (const cat of categories) {
      const valid = {
        TimeGenerated: '2025-01-15T10:00:00Z',
        EventId: `sess-001:${cat}:0`,
        SessionId: 'sess-001',
        Category: cat,
        Payload: { test: 'data' },
        SchemaVersion: 1,
        SourceUser: 'testuser',
        SourceMachine: 'testmachine',
        PushedAt: '2025-01-15T10:00:05Z',
      };
      expect(enrichmentRowSchema.parse(valid)).toBeDefined();
    }
  });

  it('accepts empty Payload object', () => {
    const valid = {
      TimeGenerated: '2025-01-15T10:00:00Z',
      EventId: 'sess-001:metadata:0',
      SessionId: 'sess-001',
      Category: 'metadata',
      Payload: {},
      SchemaVersion: 1,
      SourceUser: 'testuser',
      SourceMachine: 'testmachine',
      PushedAt: '2025-01-15T10:00:05Z',
    };
    expect(enrichmentRowSchema.parse(valid)).toEqual(valid);
  });
});

describe('syncSettingsSchema', () => {
  it('accepts valid sync settings', () => {
    const valid = {
      enabled: true,
      categories: {
        metadata: true,
        utilisation: true,
        compactions: true,
        toolResults: false,
      },
      otlpEndpoint: 'https://ca-otel-gw-demo.azurecontainerapps.io',
    };
    expect(syncSettingsSchema.parse(valid)).toEqual(valid);
  });

  it('provides correct defaults', () => {
    const defaults = syncSettingsSchema.parse({});
    expect(defaults.enabled).toBe(false);
    expect(defaults.categories.metadata).toBe(true);
    expect(defaults.categories.utilisation).toBe(true);
    expect(defaults.categories.compactions).toBe(true);
    expect(defaults.categories.toolResults).toBe(false);
    expect(defaults.otlpEndpoint).toBe('');
  });

  it('round-trip is stable', () => {
    const defaults = syncSettingsSchema.parse({});
    const roundTrip = syncSettingsSchema.parse(defaults);
    expect(roundTrip).toEqual(defaults);
  });

  it('accepts partial overrides of defaults', () => {
    const partial = {
      enabled: true,
      otlpEndpoint: 'https://ca-otel-gw-demo.azurecontainerapps.io',
    };
    const result = syncSettingsSchema.parse(partial);
    expect(result.enabled).toBe(true);
    expect(result.otlpEndpoint).toBe('https://ca-otel-gw-demo.azurecontainerapps.io');
    expect(result.categories.metadata).toBe(true); // Should default
  });
});

describe('syncStatusSchema', () => {
  it('accepts a valid sync status', () => {
    const valid = {
      state: 'idle',
      lastSyncedAt: '2025-01-15T10:00:00Z',
      sessionsPending: 5,
      sessionsTotal: 10,
      lastError: null,
    };
    expect(syncStatusSchema.parse(valid)).toEqual(valid);
  });

  it('accepts all valid state enum values', () => {
    const states = ['idle', 'scanning', 'pushing', 'error'] as const;
    for (const state of states) {
      const valid = {
        state,
        lastSyncedAt: null,
        sessionsPending: 0,
        sessionsTotal: 0,
        lastError: null,
      };
      expect(syncStatusSchema.parse(valid)).toBeDefined();
    }
  });

  it('accepts null lastSyncedAt', () => {
    const valid = {
      state: 'idle',
      lastSyncedAt: null,
      sessionsPending: 0,
      sessionsTotal: 0,
      lastError: null,
    };
    expect(syncStatusSchema.parse(valid)).toEqual(valid);
  });

  it('accepts null lastError', () => {
    const valid = {
      state: 'idle',
      lastSyncedAt: '2025-01-15T10:00:00Z',
      sessionsPending: 0,
      sessionsTotal: 0,
      lastError: null,
    };
    expect(syncStatusSchema.parse(valid)).toEqual(valid);
  });

  it('accepts error message in lastError', () => {
    const valid = {
      state: 'error',
      lastSyncedAt: '2025-01-15T10:00:00Z',
      sessionsPending: 0,
      sessionsTotal: 0,
      lastError: 'Failed to connect to DCE endpoint',
    };
    expect(syncStatusSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing required fields', () => {
    expect(() => syncStatusSchema.parse({})).toThrow(ZodError);
  });
});
