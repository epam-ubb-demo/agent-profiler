/**
 * Source picker types for configuring session discovery sources.
 */

/** Supported session source types. */
export type SourceType = 'copilot-cli' | 'vscode-chat' | 'vscode-coding-agent' | 'ctb';

/** Configuration for a single session source. */
export interface SourceConfig {
  readonly type: SourceType;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
}

/** Discovery status discriminated union for a source. */
export type DiscoveryStatus =
  | { state: 'idle' }
  | { state: 'scanning' }
  | { state: 'found'; count: number; path: string }
  | { state: 'not-found'; message: string }
  | { state: 'error'; message: string };

/** Function signature for discovering sessions of a given source type. */
export type DiscoverFn = (type: SourceType) => Promise<{ count: number; path: string }>;
