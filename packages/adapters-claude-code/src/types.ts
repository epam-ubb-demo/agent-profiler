/**
 * Raw Claude Code event types as they appear in session JSONL files.
 *
 * These represent the raw JSON shape before transformation into the
 * canonical domain model. Claude Code stores session history in
 * `~/.claude/projects/<project>/<uuid>.jsonl` on macOS/Linux and
 * `%USERPROFILE%\.claude\projects\<project>\<uuid>.jsonl` on Windows.
 *
 * The format may change between Claude Code versions — treat as best-effort.
 */

/** Top-level envelope for every JSONL line in a Claude Code session file. */
export interface RawClaudeCodeEvent {
  readonly type: string;
  readonly timestamp: string;
  readonly uuid: string;
  readonly message?: {
    readonly role?: string;
    readonly content?: string;
    readonly model?: string;
  };
  readonly tool?: {
    readonly name: string;
    readonly input?: unknown;
    readonly result?: unknown;
    readonly is_error?: boolean;
    readonly duration_ms?: number;
  };
  readonly session_id?: string;
  readonly cwd?: string;
  readonly parent_uuid?: string | null;
}

/**
 * Subset of known event type literals for Claude Code sessions.
 * The tool produces other event types too; unknowns are skipped.
 */
export type ClaudeCodeEventType =
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result';

/** Shape of a discovered Claude Code session file. */
export interface DiscoveredSession {
  /** Absolute path to the `.jsonl` session file. */
  readonly filePath: string;
  /** Session ID extracted from the first event in the file, or the filename UUID. */
  readonly sessionId: string;
  /** Absolute path to the project directory that contains this session file. */
  readonly projectDir: string;
  /** Current working directory recorded in the session file, if available. */
  readonly cwd: string | null;
}

/** Result of a session discovery scan. */
export interface DiscoveryResult {
  readonly sessions: readonly DiscoveredSession[];
  readonly errors: readonly string[];
}
