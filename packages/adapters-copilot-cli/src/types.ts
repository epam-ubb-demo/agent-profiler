/**
 * Internal raw event types as they appear in `events.jsonl`.
 *
 * These are NOT the domain types — they represent the raw JSON shape
 * before transformation into the canonical domain model.
 */

/** Top-level envelope for every JSONL line. */
export interface RawEvent {
  readonly type: string;
  readonly timestamp?: string;
  readonly id?: string;
  readonly parentId?: string;
  readonly turnId?: string | number;
  readonly data?: Record<string, unknown>;
}

/** Known event type strings from the Copilot CLI event stream. */
export type EventType =
  | 'session.start'
  | 'session.model_change'
  | 'tool.execution_start'
  | 'tool.execution_complete'
  | 'assistant.message'
  | 'user.message'
  | 'session.compaction_complete'
  | 'subagent.completed'
  | 'session.task_complete'
  | 'session.shutdown'
  | 'abort';

/** Context block inside session.start data. */
export interface RawSessionContext {
  readonly repository?: string;
  readonly branch?: string;
  readonly cwd?: string;
}
