/**
 * @agent-profiler/test-fixtures — public API barrel.
 *
 * Exports typed fixture loaders, the FixtureData interface, and the
 * golden expected-event snapshots for all three AI coding tools.
 */

export {
  loadCopilotCliFixture,
  loadVsCodeChatFixture,
  loadClaudeCodeFixture,
} from './loaders.js';
export type { FixtureData } from './loaders.js';

export { expectedCopilotCliEvents } from './expected/copilot-cli-events.js';
export { expectedVsCodeChatEvents } from './expected/vscode-chat-events.js';
export { expectedClaudeCodeEvents } from './expected/claude-code-events.js';
