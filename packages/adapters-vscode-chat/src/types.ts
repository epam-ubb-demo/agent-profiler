/**
 * Raw VS Code Copilot Chat event types as they appear in transcript JSONL files.
 *
 * These represent the raw JSON shape before transformation into the
 * canonical domain model. The format is undocumented by GitHub and may
 * change between extension versions — treat as best-effort.
 */

// ---------------------------------------------------------------------------
// Top-level envelope
// ---------------------------------------------------------------------------

/** Top-level envelope for every JSONL line in a VS Code Chat transcript. */
export interface RawVsCodeChatEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly id: string;
  readonly timestamp: string;
  readonly parentId: string | null;
}

// ---------------------------------------------------------------------------
// Event-specific data payloads
// ---------------------------------------------------------------------------

export interface SessionStartData {
  readonly sessionId: string;
  readonly version: number;
  readonly producer: string;
  readonly copilotVersion: string;
  readonly vscodeVersion: string;
  readonly startTime: string;
}

export interface UserMessageData {
  readonly content: string;
  readonly attachments: readonly unknown[];
}

export interface AssistantTurnData {
  readonly turnId: string;
}

export interface ToolRequest {
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string;
  readonly type: string;
}

export interface AssistantMessageData {
  readonly messageId: string;
  readonly content: string;
  readonly toolRequests?: readonly ToolRequest[];
  readonly reasoningText?: string;
}

export interface ToolExecutionStartData {
  readonly toolCallId: string;
}

export interface ToolExecutionCompleteData {
  readonly toolCallId: string;
  readonly success: boolean;
}

// ---------------------------------------------------------------------------
// Known event type literals
// ---------------------------------------------------------------------------

export type VsCodeChatEventType =
  | 'session.start'
  | 'user.message'
  | 'assistant.turn_start'
  | 'assistant.message'
  | 'assistant.turn_end'
  | 'tool.execution_start'
  | 'tool.execution_complete';
