/**
 * Expected EnrichmentEvent[] snapshot for the golden Claude Code session.
 *
 * These are approximate expectations based on the source adapter logic in
 * packages/source-claude-code/src/source.ts. They will be refined and
 * validated in F12.1 contract tests.
 *
 * Event ID format: `::claude-code:<sessionId>:<category>:<ordinal>`
 */

import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';

export const expectedClaudeCodeEvents: readonly EnrichmentEvent[] = [
  // ── metadata (ordinal 0) ─────────────────────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'claude-code',
    toolVersion: 'claude-opus-4-5',
    sourceMachine: 'test-host',
    sessionId: 'golden-claude-001',
    category: 'metadata',
    ordinal: 0,
    eventId: '::claude-code:golden-claude-001:metadata:0',
    eventTs: '2025-06-01T12:00:00.000Z',
    payloadSchema: 'claude-code/metadata/v1',
    payload: {
      selectedModel: 'claude-opus-4-5',
      cwd: '/home/dev/golden-project',
      startTs: '2025-06-01T12:00:00.000Z',
      endTs: '2025-06-01T12:01:03.000Z',
      parseStatus: { status: 'ok', error: null },
    },
  },

  // ── tool_result (ordinal 0 — bash/find) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'claude-code',
    toolVersion: 'claude-opus-4-5',
    sourceMachine: 'test-host',
    sessionId: 'golden-claude-001',
    category: 'tool_result',
    ordinal: 0,
    eventId: '::claude-code:golden-claude-001:tool_result:0',
    eventTs: '2025-06-01T12:00:01.100Z',
    payloadSchema: 'claude-code/tool_result/v1',
    payload: {
      toolCallId: 'tc-c001',
      toolName: 'bash',
      startTs: '2025-06-01T12:00:01.100Z',
      endTs: '2025-06-01T12:00:01.400Z',
      durationMs: 285,
      success: true,
      parentId: 'evt-c002',
      turnId: null,
      eventId: 'tc-c001',
      argumentsPreview: '{"command":"find src -name \'*.ts\' | sort"}',
    },
  },

  // ── tool_result (ordinal 1 — read_file) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'claude-code',
    toolVersion: 'claude-opus-4-5',
    sourceMachine: 'test-host',
    sessionId: 'golden-claude-001',
    category: 'tool_result',
    ordinal: 1,
    eventId: '::claude-code:golden-claude-001:tool_result:1',
    eventTs: '2025-06-01T12:01:01.100Z',
    payloadSchema: 'claude-code/tool_result/v1',
    payload: {
      toolCallId: 'tc-c002',
      toolName: 'read_file',
      startTs: '2025-06-01T12:01:01.100Z',
      endTs: '2025-06-01T12:01:01.350Z',
      durationMs: 240,
      success: true,
      parentId: 'evt-c006',
      turnId: null,
      eventId: 'tc-c002',
      argumentsPreview: '{"path":"src/utils.ts"}',
    },
  },

  // ── tool_result (ordinal 2 — edit_file) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'claude-code',
    toolVersion: 'claude-opus-4-5',
    sourceMachine: 'test-host',
    sessionId: 'golden-claude-001',
    category: 'tool_result',
    ordinal: 2,
    eventId: '::claude-code:golden-claude-001:tool_result:2',
    eventTs: '2025-06-01T12:01:02.100Z',
    payloadSchema: 'claude-code/tool_result/v1',
    payload: {
      toolCallId: 'tc-c003',
      toolName: 'edit_file',
      startTs: '2025-06-01T12:01:02.100Z',
      endTs: '2025-06-01T12:01:02.400Z',
      durationMs: 295,
      success: true,
      parentId: 'evt-c008',
      turnId: null,
      eventId: 'tc-c003',
      argumentsPreview: '{"path":"src/utils.ts","old_str":"export function formatDate(d) {","new_str":"export function formatDate(d: Date): string {"}',
    },
  },

  // ── user_interaction (ordinal 0 — first exchange) ────────────────────────
  {
    schemaVersion: 1,
    tool: 'claude-code',
    toolVersion: 'claude-opus-4-5',
    sourceMachine: 'test-host',
    sessionId: 'golden-claude-001',
    category: 'user_interaction',
    ordinal: 0,
    eventId: '::claude-code:golden-claude-001:user_interaction:0',
    eventTs: '2025-06-01T12:00:00.000Z',
    payloadSchema: 'claude-code/user_interaction/v1',
    payload: {
      turnId: null,
      startTs: '2025-06-01T12:00:00.000Z',
      endTs: '2025-06-01T12:00:02.000Z',
      userMessage: {
        content: 'List the TypeScript source files in the src directory.',
        timestamp: '2025-06-01T12:00:00.000Z',
      },
      assistantMessages: [
        {
          content: 'I will list the TypeScript files for you.',
          timestamp: '2025-06-01T12:00:01.000Z',
          requestId: null,
          reasoningText: null,
          model: 'claude-opus-4-5',
        },
        {
          content: 'The src directory contains three TypeScript files: config.ts, index.ts, and utils.ts.',
          timestamp: '2025-06-01T12:00:02.000Z',
          requestId: null,
          reasoningText: null,
          model: 'claude-opus-4-5',
        },
      ],
      toolCallCount: 1,
      toolCalls: [
        {
          toolCallId: 'tc-c001',
          toolName: 'bash',
          startTs: '2025-06-01T12:00:01.100Z',
          endTs: '2025-06-01T12:00:01.400Z',
          durationMs: 285,
          success: true,
          parentId: 'evt-c002',
          turnId: null,
          eventId: 'tc-c001',
          argumentsPreview: '{"command":"find src -name \'*.ts\' | sort"}',
        },
      ],
    },
  },

  // ── user_interaction (ordinal 1 — second exchange) ───────────────────────
  {
    schemaVersion: 1,
    tool: 'claude-code',
    toolVersion: 'claude-opus-4-5',
    sourceMachine: 'test-host',
    sessionId: 'golden-claude-001',
    category: 'user_interaction',
    ordinal: 1,
    eventId: '::claude-code:golden-claude-001:user_interaction:1',
    eventTs: '2025-06-01T12:01:00.000Z',
    payloadSchema: 'claude-code/user_interaction/v1',
    payload: {
      turnId: null,
      startTs: '2025-06-01T12:01:00.000Z',
      endTs: '2025-06-01T12:01:03.000Z',
      userMessage: {
        content: 'Read utils.ts and add a type annotation to the first exported function.',
        timestamp: '2025-06-01T12:01:00.000Z',
      },
      assistantMessages: [
        {
          content: 'Let me read the file first.',
          timestamp: '2025-06-01T12:01:01.000Z',
          requestId: null,
          reasoningText: null,
          model: 'claude-opus-4-5',
        },
        {
          content: 'I will add the type annotation now.',
          timestamp: '2025-06-01T12:01:02.000Z',
          requestId: null,
          reasoningText: null,
          model: 'claude-opus-4-5',
        },
        {
          content: 'Done. formatDate now has a `Date` parameter type and a `string` return type.',
          timestamp: '2025-06-01T12:01:03.000Z',
          requestId: null,
          reasoningText: null,
          model: 'claude-opus-4-5',
        },
      ],
      toolCallCount: 2,
      toolCalls: [
        {
          toolCallId: 'tc-c002',
          toolName: 'read_file',
          startTs: '2025-06-01T12:01:01.100Z',
          endTs: '2025-06-01T12:01:01.350Z',
          durationMs: 240,
          success: true,
          parentId: 'evt-c006',
          turnId: null,
          eventId: 'tc-c002',
          argumentsPreview: '{"path":"src/utils.ts"}',
        },
        {
          toolCallId: 'tc-c003',
          toolName: 'edit_file',
          startTs: '2025-06-01T12:01:02.100Z',
          endTs: '2025-06-01T12:01:02.400Z',
          durationMs: 295,
          success: true,
          parentId: 'evt-c008',
          turnId: null,
          eventId: 'tc-c003',
          argumentsPreview: '{"path":"src/utils.ts","old_str":"export function formatDate(d) {","new_str":"export function formatDate(d: Date): string {"}',
        },
      ],
    },
  },
] as const;
