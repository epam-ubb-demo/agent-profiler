/**
 * VsCodeChatEnrichmentSource — implements {@link SessionEnrichmentSource} for
 * the VS Code Copilot Chat tool by discovering transcript JSONL files and
 * converting parsed sessions into enrichment events.
 */

import fs from 'node:fs';
import os from 'node:os';

import {
  discoverSessions as adapterDiscoverSessions,
  parseVsCodeChatSession,
} from '@agent-profiler/adapters-vscode-chat';
import type { DiscoveredSession } from '@agent-profiler/adapters-vscode-chat';
import { buildEventId } from '@agent-profiler/enrichment-core';
import type {
  EnrichmentCursor,
  EnrichmentEvent,
  SessionEnrichmentSource,
  SessionRef,
  SessionWatcher,
} from '@agent-profiler/enrichment-core';

const CATEGORIES = ['metadata', 'tool_result', 'user_interaction'] as const;

/**
 * Enrichment source for VS Code Copilot Chat sessions stored in the workspace
 * storage transcript directories.
 *
 * Discovers sessions via the adapters-vscode-chat path resolver and yields
 * events in the order: metadata → tool_result → user_interaction.
 *
 * The constructor accepts an optional override list of {@link DiscoveredSession}
 * objects, which is used in tests to bypass the filesystem discovery.
 */
export class VsCodeChatEnrichmentSource implements SessionEnrichmentSource {
  readonly tool = 'vscode-chat' as const;

  constructor(private readonly overrideSessions?: readonly DiscoveredSession[]) {}

  async *discoverSessions(): AsyncGenerator<SessionRef> {
    const sessions =
      this.overrideSessions !== undefined
        ? this.overrideSessions
        : adapterDiscoverSessions().sessions;

    for (const session of sessions) {
      yield {
        tool: 'vscode-chat',
        sessionId: session.sessionId,
        locationHint: session.filePath,
      };
    }
  }

  async *readEvents(
    ref: SessionRef,
    cursors: Readonly<Record<string, EnrichmentCursor | undefined>>,
  ): AsyncGenerator<EnrichmentEvent> {
    const session = await parseVsCodeChatSession(ref.locationHint);
    const EPOCH = '1970-01-01T00:00:00.000Z';
    const sessionId = session.sessionId || ref.sessionId;
    const toolVersion = session.copilotVersion || '0.0.0';
    const sourceMachine = os.hostname();

    function makeEnvelope(
      category: string,
      ordinal: number,
      eventTs: string,
      payload: Record<string, unknown>,
    ): EnrichmentEvent {
      return {
        schemaVersion: 1,
        tool: 'vscode-chat',
        toolVersion,
        sourceMachine,
        sessionId,
        category,
        ordinal,
        eventId: buildEventId({ tool: 'vscode-chat', sessionId, category, ordinal }),
        eventTs,
        payloadSchema: `vscode-chat/${category}/v1`,
        payload,
      };
    }

    // ── metadata (single event, ordinal 0) ───────────────────────────────────
    const metadataCursor = cursors['metadata'];
    if (metadataCursor === undefined || 0 > metadataCursor.lastOrdinal) {
      yield makeEnvelope('metadata', 0, session.startTs ?? EPOCH, {
        copilotVersion: session.copilotVersion,
        startTs: session.startTs,
        endTs: session.endTs,
        parseStatus: session.parseStatus,
      });
    }

    // ── tool_result (one event per tool call) ─────────────────────────────────
    const toolResultCursor = cursors['tool_result'];
    for (const [index, toolCall] of session.toolCalls.entries()) {
      if (toolResultCursor !== undefined && index <= toolResultCursor.lastOrdinal) continue;
      const eventTs = toolCall.startTs ?? session.startTs ?? EPOCH;
      yield makeEnvelope('tool_result', index, eventTs, {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        startTs: toolCall.startTs,
        endTs: toolCall.endTs,
        durationMs: toolCall.durationMs,
        success: toolCall.success,
        parentId: toolCall.parentId,
        turnId: toolCall.turnId,
        eventId: toolCall.eventId,
        argumentsPreview: toolCall.argumentsPreview,
      });
    }

    // ── user_interaction (one event per turn) ─────────────────────────────────
    const userInteractionCursor = cursors['user_interaction'];
    for (const [index, turn] of session.turns.entries()) {
      if (userInteractionCursor !== undefined && index <= userInteractionCursor.lastOrdinal) continue;
      const eventTs = turn.startTs ?? session.startTs ?? EPOCH;
      yield makeEnvelope('user_interaction', index, eventTs, {
        turnId: turn.turnId,
        startTs: turn.startTs,
        endTs: turn.endTs,
        userMessage: turn.userMessage
          ? {
              content: turn.userMessage.content,
              timestamp: turn.userMessage.timestamp,
            }
          : null,
        assistantMessages: turn.assistantMessages.map((m) => ({
          content: m.content,
          timestamp: m.timestamp,
          requestId: m.requestId,
          reasoningText: m.reasoningText,
        })),
        toolCallCount: turn.toolCalls.length,
        toolCalls: turn.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          startTs: tc.startTs,
          endTs: tc.endTs,
          durationMs: tc.durationMs,
          success: tc.success,
          parentId: tc.parentId,
          turnId: tc.turnId,
          eventId: tc.eventId,
          argumentsPreview: tc.argumentsPreview,
        })),
      });
    }
  }

  watch(ref: SessionRef): SessionWatcher {
    const handlers: Array<(ref: SessionRef) => void> = [];
    let watcher: fs.FSWatcher | null = null;

    try {
      watcher = fs.watch(ref.locationHint, { persistent: false }, () => {
        for (const handler of handlers) {
          handler(ref);
        }
      });
    } catch {
      // File might not exist at watch time — return a no-op watcher
    }

    return {
      on(_event: 'change', handler: (ref: SessionRef) => void): void {
        handlers.push(handler);
      },
      close(): void {
        watcher?.close();
      },
    };
  }

  async categoriesFor(_ref: SessionRef): Promise<readonly string[]> {
    return CATEGORIES;
  }
}
