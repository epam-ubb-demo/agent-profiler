import os from 'node:os';

import type { EnrichmentRow, Session } from '@agent-profiler/core';

/**
 * Toggles controlling which enrichment categories are emitted.
 * Only categories set to `true` will produce rows.
 */
export interface EnrichmentBuilderOptions {
  categories: {
    metadata: boolean;
    utilisation: boolean;
    compactions: boolean;
    toolResults: boolean;
  };
}

/**
 * Transforms a parsed {@link Session} into an array of {@link EnrichmentRow}s
 * ready to be pushed to the `AgentProfilerEnrichment_CL` custom Logs table.
 *
 * - Only emits rows for the categories that are enabled in `options`.
 * - Produces deterministic `EventId`s of the form `<sessionId>:<category>:<index>`.
 * - Handles sessions with empty arrays gracefully (no rows are emitted for them).
 * - `PushedAt` is set to the current UTC instant so the push timestamp is accurate.
 */
export function buildEnrichmentRows(
  session: Session,
  options: EnrichmentBuilderOptions,
): EnrichmentRow[] {
  const now = new Date().toISOString();
  const sourceUser = os.userInfo().username;
  const sourceMachine = os.hostname();

  /** Convenience factory – fills in every fixed field; callers supply variable ones. */
  function makeRow(
    category: EnrichmentRow['Category'],
    index: number,
    timeGenerated: string,
    payload: Record<string, unknown>,
  ): EnrichmentRow {
    return {
      TimeGenerated: timeGenerated,
      EventId: `${session.sessionId}:${category}:${index}`,
      SessionId: session.sessionId,
      Category: category,
      Payload: payload,
      SchemaVersion: 1,
      SourceUser: sourceUser,
      SourceMachine: sourceMachine,
      PushedAt: now,
    };
  }

  const rows: EnrichmentRow[] = [];

  // ── metadata ────────────────────────────────────────────────────────────────
  if (options.categories.metadata) {
    const timeGenerated = session.startTs ?? now;
    rows.push(
      makeRow('metadata', 0, timeGenerated, {
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
      }),
    );
  }

  // ── utilisation ─────────────────────────────────────────────────────────────
  if (options.categories.utilisation) {
    for (const [index, sample] of session.utilisation.entries()) {
      rows.push(
        makeRow('utilisation', index, sample.timestamp, {
          timestamp: sample.timestamp,
          percentage: sample.percentage,
          used: sample.used,
          total: sample.total,
          buckets: sample.buckets,
        }),
      );
    }
  }

  // ── compactions ─────────────────────────────────────────────────────────────
  if (options.categories.compactions) {
    for (const [index, compaction] of session.compactions.entries()) {
      const timeGenerated = compaction.timestamp ?? session.startTs ?? now;
      rows.push(
        makeRow('compaction', index, timeGenerated, {
          timestamp: compaction.timestamp,
          inputTokens: compaction.inputTokens,
          outputTokens: compaction.outputTokens,
          cacheRead: compaction.cacheRead,
          cacheWrite: compaction.cacheWrite,
          model: compaction.model,
          turnId: compaction.turnId,
        }),
      );
    }
  }

  // ── toolResults ─────────────────────────────────────────────────────────────
  if (options.categories.toolResults) {
    for (const [index, toolCall] of session.toolCalls.entries()) {
      const timeGenerated = toolCall.startTs ?? session.startTs ?? now;
      // Skill telemetry fields (added in PR #359)
      rows.push(
        makeRow('tool_result', index, timeGenerated, {
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
          ...(toolCall.skillContentLength != null ? { skillContentLength: toolCall.skillContentLength } : {}),
          ...(toolCall.skillOutcome != null ? { skillOutcome: toolCall.skillOutcome } : {}),
          ...(toolCall.skillErrorMessage != null ? { skillErrorMessage: toolCall.skillErrorMessage } : {}),
        }),
      );
    }
  }

  return rows;
}
