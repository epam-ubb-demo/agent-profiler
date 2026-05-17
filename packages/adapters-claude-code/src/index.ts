/**
 * @agent-profiler/adapters-claude-code — public API barrel.
 *
 * Exports the primary parsing function, path discovery utilities,
 * and all types.
 */

export { parseClaudeCodeSession } from './session.js';
export { parseSessionFile } from './parser.js';
export { processEvents, buildTurns, finaliseSession } from './event-mapper.js';
export { discoverSessions, discoverSessionsFromDir, getClaudeProjectsDir } from './path-resolver.js';

export type {
  RawClaudeCodeEvent,
  DiscoveredSession,
  DiscoveryResult,
  ClaudeCodeEventType,
} from './types.js';
