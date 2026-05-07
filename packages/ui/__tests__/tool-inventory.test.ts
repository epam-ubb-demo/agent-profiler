/**
 * Tests for tool-inventory computation utilities.
 */

import type { Session, ToolCall } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { categoriseToolName, computeToolInventory } from '../src/session-detail/tool-inventory';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    toolCallId: 'tc-1',
    toolName: 'bash',
    model: 'claude-sonnet-4',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:00:01Z',
    durationMs: 1000,
    success: true,
    parentId: null,
    turnId: '1',
    eventId: null,
    argumentsPreview: '',
    ...overrides,
  };
}

function makeSession(toolCalls: ToolCall[]): Session {
  return {
    sessionId: 'test-session',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4',
    reasoningEffort: 'medium',
    repository: 'org/repo',
    branch: 'main',
    cwd: '/tmp',
    startTs: '2024-01-01T00:00:00Z',
    endTs: '2024-01-01T00:10:00Z',
    modelChanges: [],
    toolCalls,
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: true,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
  } as Session;
}

/* ------------------------------------------------------------------ */
/*  categoriseToolName                                                 */
/* ------------------------------------------------------------------ */

describe('categoriseToolName', () => {
  it('classifies built-in CLI tools', () => {
    expect(categoriseToolName('bash')).toBe('Built-in CLI');
    expect(categoriseToolName('view')).toBe('Built-in CLI');
    expect(categoriseToolName('edit')).toBe('Built-in CLI');
    expect(categoriseToolName('grep')).toBe('Built-in CLI');
    expect(categoriseToolName('glob')).toBe('Built-in CLI');
    expect(categoriseToolName('create')).toBe('Built-in CLI');
    expect(categoriseToolName('task_complete')).toBe('Built-in CLI');
    expect(categoriseToolName('web_search')).toBe('Built-in CLI');
  });

  it('classifies GitHub tools by prefix', () => {
    expect(categoriseToolName('github-list_issues')).toBe('GitHub');
    expect(categoriseToolName('github-create_pull_request')).toBe('GitHub');
    expect(categoriseToolName('github-search_code')).toBe('GitHub');
  });

  it('classifies GitHub MCP server tools', () => {
    expect(categoriseToolName('github-mcp-server-actions_get')).toBe('GitHub (MCP)');
    expect(categoriseToolName('github-mcp-server-list_issues')).toBe('GitHub (MCP)');
  });

  it('classifies GitHub Actions tools', () => {
    expect(categoriseToolName('github-actions_get')).toBe('GitHub Actions');
    expect(categoriseToolName('github-actions_list')).toBe('GitHub Actions');
  });

  it('classifies Playwright tools', () => {
    expect(categoriseToolName('playwright-mcp-browser_click')).toBe('Playwright Browser');
    expect(categoriseToolName('playwright-mcp-browser_snapshot')).toBe('Playwright Browser');
  });

  it('classifies Presales tools', () => {
    expect(categoriseToolName('presales-casestudies')).toBe('EPAM Presales');
    expect(categoriseToolName('presales-whoami')).toBe('EPAM Presales');
  });

  it('classifies Microsoft Learn tools', () => {
    expect(categoriseToolName('microsoft-learn-microsoft_docs_search')).toBe('Microsoft Learn');
  });

  it('classifies WorkIQ tools', () => {
    expect(categoriseToolName('workiq-ask_work_iq')).toBe('WorkIQ');
  });

  it('classifies unknown tools as Other', () => {
    expect(categoriseToolName('custom-tool-xyz')).toBe('Other');
    expect(categoriseToolName('my_special_tool')).toBe('Other');
  });
});

/* ------------------------------------------------------------------ */
/*  computeToolInventory                                               */
/* ------------------------------------------------------------------ */

describe('computeToolInventory', () => {
  it('returns empty categories for sessions with no tool calls', () => {
    const result = computeToolInventory(makeSession([]));
    expect(result.categories).toEqual([]);
    expect(result.totalTools).toBe(0);
    expect(result.totalCalls).toBe(0);
  });

  it('groups tool calls by category', () => {
    const calls = [
      makeToolCall({ toolCallId: '1', toolName: 'bash' }),
      makeToolCall({ toolCallId: '2', toolName: 'view' }),
      makeToolCall({ toolCallId: '3', toolName: 'github-list_issues' }),
    ];
    const result = computeToolInventory(makeSession(calls));

    expect(result.totalTools).toBe(3);
    expect(result.totalCalls).toBe(3);
    expect(result.categories).toHaveLength(2);

    const cliCat = result.categories.find((c) => c.category === 'Built-in CLI');
    const ghCat = result.categories.find((c) => c.category === 'GitHub');

    expect(cliCat).toBeDefined();
    expect(cliCat!.toolCount).toBe(2);
    expect(cliCat!.totalCalls).toBe(2);

    expect(ghCat).toBeDefined();
    expect(ghCat!.toolCount).toBe(1);
    expect(ghCat!.totalCalls).toBe(1);
  });

  it('sorts categories by total calls descending', () => {
    const calls = [
      makeToolCall({ toolCallId: '1', toolName: 'bash' }),
      makeToolCall({ toolCallId: '2', toolName: 'github-list_issues' }),
      makeToolCall({ toolCallId: '3', toolName: 'github-search_code' }),
      makeToolCall({ toolCallId: '4', toolName: 'github-get_commit' }),
    ];
    const result = computeToolInventory(makeSession(calls));

    expect(result.categories[0]!.category).toBe('GitHub');
    expect(result.categories[1]!.category).toBe('Built-in CLI');
  });

  it('sorts tools within category by call count descending', () => {
    const calls = [
      makeToolCall({ toolCallId: '1', toolName: 'bash' }),
      makeToolCall({ toolCallId: '2', toolName: 'view' }),
      makeToolCall({ toolCallId: '3', toolName: 'view' }),
      makeToolCall({ toolCallId: '4', toolName: 'view' }),
    ];
    const result = computeToolInventory(makeSession(calls));
    const cli = result.categories.find((c) => c.category === 'Built-in CLI')!;

    expect(cli.tools[0]!.toolName).toBe('view');
    expect(cli.tools[0]!.callCount).toBe(3);
    expect(cli.tools[1]!.toolName).toBe('bash');
    expect(cli.tools[1]!.callCount).toBe(1);
  });

  it('computes success rate correctly', () => {
    const calls = [
      makeToolCall({ toolCallId: '1', toolName: 'bash', success: true }),
      makeToolCall({ toolCallId: '2', toolName: 'bash', success: true }),
      makeToolCall({ toolCallId: '3', toolName: 'bash', success: false }),
      makeToolCall({ toolCallId: '4', toolName: 'bash', success: null }),
    ];
    const result = computeToolInventory(makeSession(calls));
    const cli = result.categories.find((c) => c.category === 'Built-in CLI')!;
    const bashTool = cli.tools.find((t) => t.toolName === 'bash')!;

    expect(bashTool.successCount).toBe(2);
    expect(bashTool.failureCount).toBe(1);
    expect(bashTool.unknownCount).toBe(1);
    // Success rate: 2/(2+1) = 0.667
    expect(cli.successRate).toBeCloseTo(0.667, 2);
  });

  it('computes average duration', () => {
    const calls = [
      makeToolCall({ toolCallId: '1', toolName: 'bash', durationMs: 1000 }),
      makeToolCall({ toolCallId: '2', toolName: 'bash', durationMs: 3000 }),
      makeToolCall({ toolCallId: '3', toolName: 'bash', durationMs: null }),
    ];
    const result = computeToolInventory(makeSession(calls));
    const cli = result.categories.find((c) => c.category === 'Built-in CLI')!;
    const bashTool = cli.tools.find((t) => t.toolName === 'bash')!;

    // Average of 1000 and 3000 (null excluded)
    expect(bashTool.avgDurationMs).toBe(2000);
  });

  it('returns toolDefinitionsTokens from shutdown metrics', () => {
    const session = makeSession([]);
    const withShutdown = {
      ...session,
      shutdown: {
        totalPremiumRequests: 10,
        totalApiDurationMs: 5000,
        modelMetrics: [],
        currentTokens: 100000,
        systemTokens: 50000,
        conversationTokens: 30000,
        toolDefinitionsTokens: 25000,
        codeChanges: {},
        timestamp: '2024-01-01T00:10:00Z',
      },
    } as Session;

    const result = computeToolInventory(withShutdown);
    expect(result.toolDefinitionsTokens).toBe(25000);
  });

  it('returns null toolDefinitionsTokens when no shutdown metrics', () => {
    const result = computeToolInventory(makeSession([]));
    expect(result.toolDefinitionsTokens).toBeNull();
  });
});
