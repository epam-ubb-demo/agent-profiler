/**
 * SessionDataSource abstraction and related types.
 *
 * Defines the contract for any session data provider (local filesystem,
 * remote API, etc.) used by the application.
 */

import type { Session } from '@agent-profiler/core';

/** Supported adapter types for session parsing. */
export type AdapterType = 'copilot-cli' | 'vscode-chat' | 'vscode-agent' | 'ctb';

/**
 * Lightweight session metadata for list views.
 * Does not include full parsed session data.
 */
export interface SessionListItem {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly createdAt: Date;
  readonly adapter: AdapterType;
}

/**
 * Abstraction for loading session data from various sources.
 *
 * Implementations must never throw — return empty arrays or null on failure.
 */
export interface SessionDataSource {
  /** List available sessions (lightweight summaries). */
  listSessions(): Promise<SessionListItem[]>;

  /** Load full session by ID. Returns null if not found or unparseable. */
  getSession(sessionId: string): Promise<Session | null>;

  /** Check if source is available/accessible. */
  isAvailable(): Promise<boolean>;
}
