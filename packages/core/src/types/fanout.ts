/**
 * Fan-out turn type.
 *
 * A FanoutTurn groups all events sharing the same turnId — one LLM
 * response that dispatches zero or more tools before yielding control.
 */

import type { AssistantMessage, SubagentInvocation, ToolCall, UserMessage } from './events';

/**
 * A group of events sharing the same turnId — one fan-out batch.
 */
export interface FanoutTurn {
  readonly turnId: string;
  readonly startTs: string | null;
  readonly endTs: string | null;
  readonly model: string | null;
  readonly assistantMessages: readonly AssistantMessage[];
  readonly toolCalls: readonly ToolCall[];
  readonly subagents: readonly SubagentInvocation[];
  readonly userMessage: UserMessage | null;
}
