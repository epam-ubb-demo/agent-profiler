/**
 * Integration tests for the VS Code Copilot Chat adapter.
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { parseVsCodeChatSession } from '../src/index';
import { parseTranscriptFile } from '../src/parser';
import { getWorkspaceStoragePaths, discoverSessions } from '../src/path-resolver';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const GOLDEN_FIXTURE = join(FIXTURES, 'vscode-chat-session.jsonl');
const MALFORMED_FIXTURE = join(FIXTURES, 'malformed-session.jsonl');
const SESSION_START_ONLY = join(FIXTURES, 'session-start-only.jsonl');

// ---------------------------------------------------------------------------
// Integration: parseVsCodeChatSession
// ---------------------------------------------------------------------------

describe('parseVsCodeChatSession', () => {
  it('parses golden fixture without errors', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.parseStatus.status).toBe('ok');
    expect(session.parseStatus.error).toBeNull();
  });

  it('extracts correct sessionId from session.start', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.sessionId).toBe('test-session-001');
  });

  it('extracts copilotVersion from session.start', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.copilotVersion).toBe('0.46.2026042704');
  });

  it('maps user.message events to UserMessage array', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.userMessages).toHaveLength(2);
    expect(session.userMessages[0]!.content).toBe('What is the weather like today?');
    expect(session.userMessages[1]!.content).toBe('Thanks!');
  });

  it('maps assistant.message events to AssistantMessage array', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.assistantMessages).toHaveLength(3);
    expect(session.assistantMessages[1]!.content).toBe('The weather today is sunny with a high of 22°C.');
    expect(session.assistantMessages[2]!.content).toBe(
      'You are welcome! Let me know if there is anything else I can help with.',
    );
  });

  it('joins tool.execution_start + complete into ToolCall', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.toolCalls).toHaveLength(1);
    expect(session.toolCalls[0]!.toolCallId).toBe('tc-001');
    expect(session.toolCalls[0]!.toolName).toBe('run_in_terminal');
    expect(session.toolCalls[0]!.success).toBe(true);
  });

  it('computes tool duration from timestamps', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    const tool = session.toolCalls[0]!;
    expect(tool.startTs).toBe('2026-04-30T18:42:17.402Z');
    expect(tool.endTs).toBe('2026-04-30T18:42:59.110Z');
    // Duration: 59110 - 17402 = 41708ms
    expect(tool.durationMs).toBe(41708);
  });

  it('groups events into correct turns', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.turns).toHaveLength(3);
    expect(session.turns[0]!.turnId).toBe('0');
    expect(session.turns[1]!.turnId).toBe('1');
    expect(session.turns[2]!.turnId).toBe('2');
  });

  it('sets token counts to 0 (not available in Chat transcripts)', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    for (const msg of session.assistantMessages) {
      expect(msg.outputTokens).toBe(0);
      expect(msg.inputTokens).toBe(0);
      expect(msg.cacheReadTokens).toBe(0);
      expect(msg.cacheWriteTokens).toBe(0);
    }
  });

  it('sets parse status to ok for valid file', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.parseStatus).toEqual({ status: 'ok', error: null });
  });

  it('sets parse status to partial for file with bad lines', async () => {
    const session = await parseVsCodeChatSession(MALFORMED_FIXTURE);
    expect(session.parseStatus.status).toBe('partial');
    expect(session.parseStatus.error).toContain('1 line(s) skipped');
  });

  it('handles empty file gracefully', async () => {
    const emptyFile = join(FIXTURES, 'empty.jsonl');
    writeFileSync(emptyFile, '');
    try {
      const session = await parseVsCodeChatSession(emptyFile);
      expect(session.parseStatus.status).toBe('failed');
      expect(session.parseStatus.error).toContain('empty');
    } finally {
      rmSync(emptyFile);
    }
  });

  it('handles file with only session.start', async () => {
    const session = await parseVsCodeChatSession(SESSION_START_ONLY);
    expect(session.parseStatus.status).toBe('ok');
    expect(session.sessionId).toBe('test-session-003');
    expect(session.copilotVersion).toBe('0.44.0');
    expect(session.userMessages).toHaveLength(0);
    expect(session.assistantMessages).toHaveLength(0);
    expect(session.toolCalls).toHaveLength(0);
    expect(session.turns).toHaveLength(0);
  });

  it('extracts reasoning text from assistant messages', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    // msg-002 has reasoningText
    const msgWithReasoning = session.assistantMessages.find(
      (m) => m.requestId === 'msg-002',
    );
    expect(msgWithReasoning).toBeDefined();
    expect(msgWithReasoning!.reasoningText).toBe('Looking at the terminal output...');
  });

  it('sets unavailable fields to empty/null as documented', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.selectedModel).toBe('');
    expect(session.reasoningEffort).toBe('');
    expect(session.repository).toBe('');
    expect(session.branch).toBe('');
    expect(session.cwd).toBe('');
    expect(session.compactions).toHaveLength(0);
    expect(session.subagents).toHaveLength(0);
    expect(session.shutdown).toBeNull();
    expect(session.success).toBeNull();
    expect(session.fanoutTurns).toHaveLength(0);
    expect(session.modelChanges).toHaveLength(0);
  });

  it('sets startTs and endTs from first and last events', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    expect(session.startTs).toBe('2026-04-30T18:42:14.034Z');
    expect(session.endTs).toBe('2026-04-30T18:44:44.001Z');
  });

  it('extracts tool arguments preview', async () => {
    const session = await parseVsCodeChatSession(GOLDEN_FIXTURE);
    const tool = session.toolCalls[0]!;
    expect(tool.argumentsPreview).toContain('curl wttr.in');
  });

  it('returns failed status for non-existent file', async () => {
    const session = await parseVsCodeChatSession('/non/existent/path.jsonl');
    expect(session.parseStatus.status).toBe('failed');
    expect(session.parseStatus.error).toContain('Failed to read transcript file');
  });
});

// ---------------------------------------------------------------------------
// Parser unit tests
// ---------------------------------------------------------------------------

describe('parseTranscriptFile', () => {
  it('skips blank lines without counting them as errors', async () => {
    const blankFile = join(FIXTURES, 'blank-lines.jsonl');
    writeFileSync(blankFile, '\n\n{"type":"session.start","data":{},"id":"x","timestamp":"2026-01-01T00:00:00Z","parentId":null}\n\n');
    try {
      const result = await parseTranscriptFile(blankFile);
      expect(result.events).toHaveLength(1);
      expect(result.diagnostics.skippedLines).toBe(0);
    } finally {
      rmSync(blankFile);
    }
  });
});

// ---------------------------------------------------------------------------
// Path resolver unit tests
// ---------------------------------------------------------------------------

describe('getWorkspaceStoragePaths', () => {
  it('returns macOS paths for darwin platform', () => {
    const paths = getWorkspaceStoragePaths('darwin', '/Users/testuser');
    expect(paths).toHaveLength(2);
    expect(paths[0]!.variant).toBe('stable');
    expect(paths[0]!.basePath).toContain(join('Application Support', 'Code', 'User', 'workspaceStorage'));
    expect(paths[1]!.variant).toBe('insiders');
    expect(paths[1]!.basePath).toContain('Code - Insiders');
  });

  it('returns Windows paths for win32 platform', () => {
    const paths = getWorkspaceStoragePaths('win32', 'C:\\Users\\testuser');
    expect(paths).toHaveLength(2);
    expect(paths[0]!.basePath).toContain('AppData');
    expect(paths[0]!.basePath).toContain('Roaming');
  });

  it('returns Linux paths for linux platform', () => {
    const paths = getWorkspaceStoragePaths('linux', '/home/testuser');
    expect(paths).toHaveLength(2);
    expect(paths[0]!.basePath).toContain(join('.config', 'Code', 'User', 'workspaceStorage'));
  });

  it('returns empty array for unknown platform', () => {
    const paths = getWorkspaceStoragePaths('freebsd', '/home/testuser');
    expect(paths).toHaveLength(0);
  });
});

describe('discoverSessions', () => {
  const testRoot = join(tmpdir(), `agent-profiler-test-${Date.now()}`);

  beforeAll(() => {
    // Create mock workspace storage structure
    const wsStorage = join(testRoot, '.config', 'Code', 'User', 'workspaceStorage');
    const transcriptsDir = join(wsStorage, 'workspace-abc', 'GitHub.copilot-chat', 'transcripts');
    mkdirSync(transcriptsDir, { recursive: true });
    writeFileSync(join(transcriptsDir, 'session-xyz.jsonl'), '{}');
    writeFileSync(join(transcriptsDir, 'session-456.jsonl'), '{}');
    writeFileSync(join(transcriptsDir, 'not-a-session.txt'), 'ignore');
  });

  afterAll(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('discovers JSONL transcript files in workspace storage', () => {
    const result = discoverSessions('linux', testRoot);
    expect(result.sessions).toHaveLength(2);
    const sessionIds = result.sessions.map((s) => s.sessionId).sort();
    expect(sessionIds).toEqual(['session-456', 'session-xyz']);
  });

  it('ignores non-jsonl files', () => {
    const result = discoverSessions('linux', testRoot);
    const fileNames = result.sessions.map((s) => s.filePath);
    expect(fileNames.every((f) => f.endsWith('.jsonl'))).toBe(true);
  });

  it('sets correct variant and workspaceDir', () => {
    const result = discoverSessions('linux', testRoot);
    expect(result.sessions[0]!.variant).toBe('stable');
    expect(result.sessions[0]!.workspaceDir).toBe('workspace-abc');
  });
});
