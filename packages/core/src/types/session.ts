/**
 * Session-level domain types.
 *
 * Session is the top-level aggregate containing all parsed data for a
 * single Copilot CLI interaction. Turn is the logical interaction unit
 * grouping messages and tool calls.
 */

import type {
  AssistantMessage,
  Compaction,
  SubagentInvocation,
  ToolCall,
  UserMessage,
} from './events';
import type { FanoutTurn } from './fanout';
import type { ShutdownMetrics, UtilisationSample } from './metrics';

/**
 * Parse status indicates the outcome of parsing events into a session.
 * A session is always produced — never throw from parsing.
 */
export interface ParseStatus {
  readonly status: 'ok' | 'partial' | 'failed';
  readonly error: string | null;
}

/**
 * A mid-session model switch event.
 */
export interface ModelChange {
  readonly timestamp: string;
  readonly model: string;
}

/**
 * A logical interaction unit grouping messages and tool calls by turnId.
 */
export interface Turn {
  readonly turnId: string;
  readonly startTs: string | null;
  readonly endTs: string | null;
  readonly userMessage: UserMessage | null;
  readonly assistantMessages: readonly AssistantMessage[];
  readonly toolCalls: readonly ToolCall[];
  readonly subagents: readonly SubagentInvocation[];
}

/**
 * The top-level aggregate for a single Copilot CLI session.
 *
 * All parsed session data is contained here. The parseStatus field
 * indicates whether parsing was fully successful, partially recovered,
 * or failed entirely (in which case fields may be empty/default).
 */
export interface Session {
  readonly sessionId: string;
  readonly copilotVersion: string;
  readonly selectedModel: string;
  readonly reasoningEffort: string;
  readonly repository: string;
  readonly branch: string;
  readonly cwd: string;
  readonly startTs: string | null;
  readonly endTs: string | null;
  readonly modelChanges: readonly ModelChange[];
  readonly toolCalls: readonly ToolCall[];
  readonly assistantMessages: readonly AssistantMessage[];
  readonly userMessages: readonly UserMessage[];
  readonly compactions: readonly Compaction[];
  readonly subagents: readonly SubagentInvocation[];
  readonly shutdown: ShutdownMetrics | null;
  readonly success: boolean | null;
  readonly fanoutTurns: readonly FanoutTurn[];
  readonly turns: readonly Turn[];
  readonly parseStatus: ParseStatus;
  readonly utilisation: readonly UtilisationSample[];
}
