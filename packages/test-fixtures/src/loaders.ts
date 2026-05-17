/**
 * Typed fixture loaders — each returns the raw JSONL lines, expected
 * EnrichmentEvent snapshot, session ID, and fixture directory path for
 * the corresponding golden session.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnrichmentEvent } from '@agent-profiler/enrichment-core';

import { expectedClaudeCodeEvents } from './expected/claude-code-events.js';
import { expectedCopilotCliEvents } from './expected/copilot-cli-events.js';
import { expectedVsCodeChatEvents } from './expected/vscode-chat-events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');

/**
 * Data returned by every fixture loader function.
 *
 * - `rawLines` — non-empty JSONL lines from the fixture file (each is valid JSON).
 * - `expectedEvents` — approximate EnrichmentEvent snapshot for round-trip tests.
 * - `sessionId` — the deterministic session ID embedded in the fixture.
 * - `fixtureDir` — path to the fixture directory; useful when a source adapter
 *   scans a directory rather than a single file (e.g. Copilot CLI).
 */
export interface FixtureData {
  rawLines: string[];
  expectedEvents: readonly EnrichmentEvent[];
  sessionId: string;
  fixtureDir: string;
}

/** Load the golden Copilot CLI fixture. */
export function loadCopilotCliFixture(): FixtureData {
  const fixtureDir = join(fixturesDir, 'copilot-cli');
  const raw = readFileSync(join(fixtureDir, 'events.jsonl'), 'utf-8');
  const rawLines = raw.split('\n').filter((l) => l.trim().length > 0);
  return {
    rawLines,
    expectedEvents: expectedCopilotCliEvents,
    sessionId: 'golden-copilot-001',
    fixtureDir,
  };
}

/** Load the golden VS Code Chat fixture. */
export function loadVsCodeChatFixture(): FixtureData {
  const fixtureDir = join(fixturesDir, 'vscode-chat');
  const raw = readFileSync(join(fixtureDir, 'transcript.jsonl'), 'utf-8');
  const rawLines = raw.split('\n').filter((l) => l.trim().length > 0);
  return {
    rawLines,
    expectedEvents: expectedVsCodeChatEvents,
    sessionId: 'golden-vscode-001',
    fixtureDir,
  };
}

/** Load the golden Claude Code fixture. */
export function loadClaudeCodeFixture(): FixtureData {
  const fixtureDir = join(fixturesDir, 'claude-code');
  const raw = readFileSync(join(fixtureDir, 'events.jsonl'), 'utf-8');
  const rawLines = raw.split('\n').filter((l) => l.trim().length > 0);
  return {
    rawLines,
    expectedEvents: expectedClaudeCodeEvents,
    sessionId: 'golden-claude-001',
    fixtureDir,
  };
}
