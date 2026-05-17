/**
 * Expected EnrichmentEvent[] snapshot for the golden VS Code Chat session.
 *
 * These are approximate expectations based on the source adapter logic in
 * packages/source-vscode-chat/src/source.ts. They will be refined and
 * validated in F12.1 contract tests.
 *
 * Event ID format: `::vscode-chat:<sessionId>:<category>:<ordinal>`
 */

import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';

export const expectedVsCodeChatEvents: readonly EnrichmentEvent[] = [
  // ── metadata (ordinal 0) ─────────────────────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'vscode-chat',
    toolVersion: '0.50.2025060100',
    sourceMachine: 'test-host',
    sessionId: 'golden-vscode-001',
    category: 'metadata',
    ordinal: 0,
    eventId: '::vscode-chat:golden-vscode-001:metadata:0',
    eventTs: '2025-06-01T11:00:00.000Z',
    payloadSchema: 'vscode-chat/metadata/v1',
    payload: {
      copilotVersion: '0.50.2025060100',
      startTs: '2025-06-01T11:00:00.000Z',
      endTs: '2025-06-01T11:02:00.000Z',
      parseStatus: { status: 'ok', error: null },
    },
  },

  // ── tool_result (ordinal 0 — read_file) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'vscode-chat',
    toolVersion: '0.50.2025060100',
    sourceMachine: 'test-host',
    sessionId: 'golden-vscode-001',
    category: 'tool_result',
    ordinal: 0,
    eventId: '::vscode-chat:golden-vscode-001:tool_result:0',
    eventTs: '2025-06-01T11:00:02.050Z',
    payloadSchema: 'vscode-chat/tool_result/v1',
    payload: {
      toolCallId: 'tc-v001',
      toolName: 'read_file',
      startTs: '2025-06-01T11:00:02.050Z',
      endTs: '2025-06-01T11:00:02.800Z',
      durationMs: 750,
      success: true,
      parentId: 'evt-v006',
      turnId: '1',
      eventId: 'evt-v007',
      argumentsPreview: '{"path":"src/config.ts"}',
    },
  },

  // ── tool_result (ordinal 1 — edit_file) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'vscode-chat',
    toolVersion: '0.50.2025060100',
    sourceMachine: 'test-host',
    sessionId: 'golden-vscode-001',
    category: 'tool_result',
    ordinal: 1,
    eventId: '::vscode-chat:golden-vscode-001:tool_result:1',
    eventTs: '2025-06-01T11:01:01.050Z',
    payloadSchema: 'vscode-chat/tool_result/v1',
    payload: {
      toolCallId: 'tc-v002',
      toolName: 'edit_file',
      startTs: '2025-06-01T11:01:01.050Z',
      endTs: '2025-06-01T11:01:01.600Z',
      durationMs: 550,
      success: true,
      parentId: 'evt-v015',
      turnId: '3',
      eventId: 'evt-v016',
      argumentsPreview: '{"path":"src/config.ts","old_str":"PORT: z.string()","new_str":"PORT: z.string(),\\n  DATABASE_URL: z.string().url()"}',
    },
  },

  // ── user_interaction (ordinal 0 — first user turn) ───────────────────────
  {
    schemaVersion: 1,
    tool: 'vscode-chat',
    toolVersion: '0.50.2025060100',
    sourceMachine: 'test-host',
    sessionId: 'golden-vscode-001',
    category: 'user_interaction',
    ordinal: 0,
    eventId: '::vscode-chat:golden-vscode-001:user_interaction:0',
    eventTs: '2025-06-01T11:00:01.000Z',
    payloadSchema: 'vscode-chat/user_interaction/v1',
    payload: {
      turnId: '0',
      startTs: '2025-06-01T11:00:01.000Z',
      endTs: '2025-06-01T11:00:04.001Z',
      userMessage: {
        content: 'Explain what the config module does.',
        timestamp: '2025-06-01T11:00:01.000Z',
      },
      assistantMessages: [
        {
          content: '',
          timestamp: '2025-06-01T11:00:02.000Z',
          requestId: null,
          reasoningText: null,
        },
        {
          content: 'The config module loads environment variables, validates them with Zod, and exports a typed `config` object consumed across the application.',
          timestamp: '2025-06-01T11:00:04.000Z',
          requestId: null,
          reasoningText: '',
        },
      ],
      toolCallCount: 1,
      toolCalls: [
        {
          toolCallId: 'tc-v001',
          toolName: 'read_file',
          startTs: '2025-06-01T11:00:02.050Z',
          endTs: '2025-06-01T11:00:02.800Z',
          durationMs: 750,
          success: true,
          parentId: 'evt-v006',
          turnId: '1',
          eventId: 'evt-v007',
          argumentsPreview: '{"path":"src/config.ts"}',
        },
      ],
    },
  },

  // ── user_interaction (ordinal 1 — second user turn) ─────────────────────
  {
    schemaVersion: 1,
    tool: 'vscode-chat',
    toolVersion: '0.50.2025060100',
    sourceMachine: 'test-host',
    sessionId: 'golden-vscode-001',
    category: 'user_interaction',
    ordinal: 1,
    eventId: '::vscode-chat:golden-vscode-001:user_interaction:1',
    eventTs: '2025-06-01T11:01:00.000Z',
    payloadSchema: 'vscode-chat/user_interaction/v1',
    payload: {
      turnId: '2',
      startTs: '2025-06-01T11:01:00.000Z',
      endTs: '2025-06-01T11:01:03.001Z',
      userMessage: {
        content: 'Add a missing DATABASE_URL field to the schema.',
        timestamp: '2025-06-01T11:01:00.000Z',
      },
      assistantMessages: [
        {
          content: 'I will add the DATABASE_URL field now.',
          timestamp: '2025-06-01T11:01:01.000Z',
          requestId: null,
          reasoningText: null,
        },
        {
          content: 'Done. The DATABASE_URL field has been added to the config schema.',
          timestamp: '2025-06-01T11:01:03.000Z',
          requestId: null,
          reasoningText: null,
        },
      ],
      toolCallCount: 1,
      toolCalls: [
        {
          toolCallId: 'tc-v002',
          toolName: 'edit_file',
          startTs: '2025-06-01T11:01:01.050Z',
          endTs: '2025-06-01T11:01:01.600Z',
          durationMs: 550,
          success: true,
          parentId: 'evt-v015',
          turnId: '3',
          eventId: 'evt-v016',
          argumentsPreview: '{"path":"src/config.ts","old_str":"PORT: z.string()","new_str":"PORT: z.string(),\\n  DATABASE_URL: z.string().url()"}',
        },
      ],
    },
  },
] as const;
