/**
 * Expected EnrichmentEvent[] snapshot for the golden Copilot CLI session.
 *
 * These are approximate expectations based on the source adapter logic in
 * packages/source-copilot-cli/src/source.ts. They will be refined and
 * validated in F12.1 contract tests.
 *
 * Event ID format: `::copilot-cli:<sessionId>:<category>:<ordinal>`
 */

import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';

export const expectedCopilotCliEvents: readonly EnrichmentEvent[] = [
  // ── metadata (ordinal 0) ─────────────────────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'copilot-cli',
    toolVersion: '1.5.0',
    sourceMachine: 'test-host',
    sessionId: 'golden-copilot-001',
    category: 'metadata',
    ordinal: 0,
    eventId: '::copilot-cli:golden-copilot-001:metadata:0',
    eventTs: '2025-06-01T10:00:00.000Z',
    payloadSchema: 'copilot-cli/metadata/v1',
    payload: {
      copilotVersion: '1.5.0',
      selectedModel: 'claude-sonnet-4-20250514',
      reasoningEffort: 'medium',
      repository: 'test-org/golden-project',
      branch: 'main',
      cwd: '/home/dev/golden-project',
      startTs: '2025-06-01T10:00:00.000Z',
      endTs: '2025-06-01T10:00:15.000Z',
      success: true,
      parseStatus: { status: 'ok', error: null },
      shutdown: {
        totalPremiumRequests: 4,
        totalApiDurationMs: 9000,
        modelMetrics: [
          {
            model: 'claude-sonnet-4-20250514',
            requests: 4,
            cost: 1,
            inputTokens: 7500,
            outputTokens: 495,
            cacheReadTokens: 5550,
            cacheWriteTokens: 40,
            reasoningTokens: 0,
          },
        ],
        currentTokens: 6200,
        systemTokens: 1800,
        conversationTokens: 4000,
        toolDefinitionsTokens: 400,
        codeChanges: { 'src/index.ts': 1 },
      },
      modelChanges: [
        { model: 'claude-sonnet-4-20250514', newModel: 'claude-sonnet-4-20250514', timestamp: '2025-06-01T10:00:07.000Z' },
      ],
    },
  },

  // ── compaction (ordinal 0) ───────────────────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'copilot-cli',
    toolVersion: '1.5.0',
    sourceMachine: 'test-host',
    sessionId: 'golden-copilot-001',
    category: 'compaction',
    ordinal: 0,
    eventId: '::copilot-cli:golden-copilot-001:compaction:0',
    eventTs: '2025-06-01T10:00:06.000Z',
    payloadSchema: 'copilot-cli/compaction/v1',
    payload: {
      timestamp: '2025-06-01T10:00:06.000Z',
      inputTokens: 400,
      outputTokens: 80,
      cacheRead: 150,
      cacheWrite: 40,
      model: 'claude-sonnet-4-20250514',
      turnId: '1',
    },
  },

  // ── tool_result (ordinal 0 — read_file) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'copilot-cli',
    toolVersion: '1.5.0',
    sourceMachine: 'test-host',
    sessionId: 'golden-copilot-001',
    category: 'tool_result',
    ordinal: 0,
    eventId: '::copilot-cli:golden-copilot-001:tool_result:0',
    eventTs: '2025-06-01T10:00:03.000Z',
    payloadSchema: 'copilot-cli/tool_result/v1',
    payload: {
      toolCallId: 'tc-g001',
      toolName: 'read_file',
      model: null,
      startTs: '2025-06-01T10:00:03.000Z',
      endTs: '2025-06-01T10:00:04.000Z',
      durationMs: 1000,
      success: true,
      parentId: 'evt-g003',
      turnId: '0',
      eventId: 'evt-g004',
      argumentsPreview: '{"path":"src/index.ts"}',
    },
  },

  // ── tool_result (ordinal 1 — edit_file) ─────────────────────────────────
  {
    schemaVersion: 1,
    tool: 'copilot-cli',
    toolVersion: '1.5.0',
    sourceMachine: 'test-host',
    sessionId: 'golden-copilot-001',
    category: 'tool_result',
    ordinal: 1,
    eventId: '::copilot-cli:golden-copilot-001:tool_result:1',
    eventTs: '2025-06-01T10:00:10.000Z',
    payloadSchema: 'copilot-cli/tool_result/v1',
    payload: {
      toolCallId: 'tc-g002',
      toolName: 'edit_file',
      model: null,
      startTs: '2025-06-01T10:00:10.000Z',
      endTs: '2025-06-01T10:00:11.000Z',
      durationMs: 1000,
      success: true,
      parentId: 'evt-g010',
      turnId: '2',
      eventId: 'evt-g011',
      argumentsPreview: '{"path":"src/index.ts","old_str":"export function run(","new_str":"/** Boots the application. */\\nexport function run("}',
    },
  },
] as const;
