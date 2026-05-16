/**
 * CopilotCliEnrichmentSource — implements {@link SessionEnrichmentSource} for
 * the Copilot CLI tool by scanning a root directory for session folders and
 * converting parsed sessions into enrichment events.
 */

import fs from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

import { parseCopilotCliSession } from '@agent-profiler/adapters-copilot-cli';
import { buildEventId } from '@agent-profiler/enrichment-core';
import type {
  EnrichmentCursor,
  EnrichmentEvent,
  SessionEnrichmentSource,
  SessionRef,
  SessionWatcher,
} from '@agent-profiler/enrichment-core';

const CATEGORIES = ['metadata', 'utilisation', 'compaction', 'tool_result'] as const;
const EVENT_FILES = ['events.jsonl', 'events.ndjson'] as const;

/**
 * Enrichment source for Copilot CLI sessions stored on the local filesystem.
 *
 * Scans {@link rootDir} for subdirectories that contain `events.jsonl` or
 * `events.ndjson`, parses each as a Copilot CLI session, and yields events
 * in the order: metadata → utilisation → compaction → tool_result.
 */
export class CopilotCliEnrichmentSource implements SessionEnrichmentSource {
  readonly tool = 'copilot-cli' as const;

  constructor(private readonly rootDir: string) {}

  async *discoverSessions(): AsyncGenerator<SessionRef> {
    let entries;
    try {
      entries = await readdir(this.rootDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = join(this.rootDir, entry.name);

      for (const filename of EVENT_FILES) {
        try {
          await access(join(dirPath, filename));
          yield {
            tool: 'copilot-cli',
            sessionId: entry.name,
            locationHint: dirPath,
          };
          break;
        } catch {
          // File not present — try the next candidate
        }
      }
    }
  }

  async *readEvents(
    ref: SessionRef,
    cursors: Readonly<Record<string, EnrichmentCursor | undefined>>,
  ): AsyncGenerator<EnrichmentEvent> {
    const session = await parseCopilotCliSession(ref.locationHint);
    const now = new Date().toISOString();
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
        tool: 'copilot-cli',
        toolVersion,
        sourceMachine,
        sessionId: ref.sessionId,
        category,
        ordinal,
        eventId: buildEventId({ tool: 'copilot-cli', sessionId: ref.sessionId, category, ordinal }),
        eventTs,
        payloadSchema: `copilot-cli/${category}/v1`,
        payload,
      };
    }

    // ── metadata (single event, ordinal 0) ───────────────────────────────────
    const metadataCursor = cursors['metadata'];
    if (metadataCursor === undefined || 0 > metadataCursor.lastOrdinal) {
      const eventTs = session.startTs ?? now;
      yield makeEnvelope('metadata', 0, eventTs, {
        copilotVersion: session.copilotVersion,
        selectedModel: session.selectedModel,
        reasoningEffort: session.reasoningEffort,
        repository: session.repository,
        branch: session.branch,
        cwd: session.cwd,
        startTs: session.startTs,
        endTs: session.endTs,
        success: session.success,
        parseStatus: session.parseStatus,
        shutdown: session.shutdown,
        modelChanges: session.modelChanges,
      });
    }

    // ── utilisation (one event per sample) ───────────────────────────────────
    const utilisationCursor = cursors['utilisation'];
    for (const [index, sample] of session.utilisation.entries()) {
      if (utilisationCursor !== undefined && index <= utilisationCursor.lastOrdinal) continue;
      yield makeEnvelope('utilisation', index, sample.timestamp, {
        timestamp: sample.timestamp,
        percentage: sample.percentage,
        used: sample.used,
        total: sample.total,
        buckets: sample.buckets,
      });
    }

    // ── compaction (one event per compaction) ─────────────────────────────────
    const compactionCursor = cursors['compaction'];
    for (const [index, compaction] of session.compactions.entries()) {
      if (compactionCursor !== undefined && index <= compactionCursor.lastOrdinal) continue;
      const eventTs = compaction.timestamp ?? session.startTs ?? now;
      yield makeEnvelope('compaction', index, eventTs, {
        timestamp: compaction.timestamp,
        inputTokens: compaction.inputTokens,
        outputTokens: compaction.outputTokens,
        cacheRead: compaction.cacheRead,
        cacheWrite: compaction.cacheWrite,
        model: compaction.model,
        turnId: compaction.turnId,
      });
    }

    // ── tool_result (one event per tool call) ─────────────────────────────────
    const toolResultCursor = cursors['tool_result'];
    for (const [index, toolCall] of session.toolCalls.entries()) {
      if (toolResultCursor !== undefined && index <= toolResultCursor.lastOrdinal) continue;
      const eventTs = toolCall.startTs ?? session.startTs ?? now;
      yield makeEnvelope('tool_result', index, eventTs, {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        model: toolCall.model,
        startTs: toolCall.startTs,
        endTs: toolCall.endTs,
        durationMs: toolCall.durationMs,
        success: toolCall.success,
        parentId: toolCall.parentId,
        turnId: toolCall.turnId,
        eventId: toolCall.eventId,
        argumentsPreview: toolCall.argumentsPreview,
        ...(toolCall.skillName != null ? { skillName: toolCall.skillName } : {}),
        ...(toolCall.skillSource != null ? { skillSource: toolCall.skillSource } : {}),
        ...(toolCall.skillContentLength != null
          ? { skillContentLength: toolCall.skillContentLength }
          : {}),
        ...(toolCall.skillOutcome != null ? { skillOutcome: toolCall.skillOutcome } : {}),
        ...(toolCall.skillErrorMessage != null
          ? { skillErrorMessage: toolCall.skillErrorMessage }
          : {}),
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
      // Directory might not exist at watch time — return a no-op watcher
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
