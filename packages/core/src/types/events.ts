/**
 * Event-level domain types.
 *
 * These represent the atomic events that occur within a Copilot CLI session:
 * tool executions, assistant responses, user prompts, compactions, and
 * sub-agent invocations.
 *
 * Ported from the Python prototype at `ctb/viz.py`.
 */

/**
 * A single tool execution pair, joined by toolCallId.
 */
export interface ToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly model: string | null;
  readonly startTs: string | null;
  readonly endTs: string | null;
  readonly durationMs: number | null;
  readonly success: boolean | null;
  readonly parentId: string | null;
  readonly turnId: string | null;
  readonly eventId: string | null;
  readonly argumentsPreview: string;
  /** Resolved skill name from telemetry (only present for toolName === 'skill'). */
  readonly skillName?: string | null | undefined;
  /** Skill source category from telemetry (e.g. 'personal-copilot', 'project'). */
  readonly skillSource?: string | null | undefined;
  /** Number of characters of skill content loaded into context. */
  readonly skillContentLength?: number | null | undefined;
  /** Skill resolution outcome: loaded, not_found, disabled, or read_error. */
  readonly skillOutcome?: 'loaded' | 'not_found' | 'disabled' | 'read_error' | null | undefined;
  /** Error message when skillOutcome is 'read_error'. */
  readonly skillErrorMessage?: string | null | undefined;
}

/**
 * An assistant (LLM) response within a turn.
 */
export interface AssistantMessage {
  readonly interactionId: string | null;
  readonly requestId: string | null;
  readonly outputTokens: number;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly model: string | null;
  readonly timestamp: string | null;
  readonly turnId: string | null;
  readonly eventId: string | null;
  readonly parentId: string | null;
  readonly content: string;
  readonly reasoningText: string;
}

/**
 * A user prompt captured from a `user.message` event.
 */
export interface UserMessage {
  readonly interactionId: string | null;
  readonly timestamp: string | null;
  readonly turnId: string | null;
  readonly content: string;
}

/**
 * A context-window compaction event.
 *
 * Token buckets represent the token usage at the point of compaction.
 */
export interface Compaction {
  readonly timestamp: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly model: string | null;
  readonly turnId: string | null;
}

/**
 * A sub-agent invocation — a child session spawned by the parent.
 */
export interface SubagentInvocation {
  readonly timestamp: string | null;
  readonly totalTokens: number;
  readonly messageCount: number;
  readonly toolCallCount: number;
  readonly turnId: string | null;
  readonly eventId: string | null;
  readonly parentId: string | null;
  readonly agentName: string;
  readonly agentType: string;
  readonly childSessionRef: string | null;
}
