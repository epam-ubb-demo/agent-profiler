/**
 * Tests for @agent-profiler/export-html.
 */

import type { BenchRunAggregation, Session } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { exportBenchRunToHtml, exportSessionToHtml } from '../src/index';

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'test-session-001',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'epam-ubb-demo/agent-profiler',
    branch: 'main',
    cwd: '/workspace',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:05:00Z',
    modelChanges: [],
    toolCalls: [
      {
        toolCallId: 'tc-1',
        toolName: 'bash',
        model: 'claude-sonnet-4-20250514',
        startTs: '2025-01-15T10:00:10Z',
        endTs: '2025-01-15T10:00:15Z',
        durationMs: 5000,
        success: true,
        parentId: null,
        turnId: 'turn-1',
        eventId: 'evt-1',
        argumentsPreview: 'ls -la',
      },
      {
        toolCallId: 'tc-2',
        toolName: 'edit',
        model: 'claude-sonnet-4-20250514',
        startTs: '2025-01-15T10:01:00Z',
        endTs: '2025-01-15T10:01:02Z',
        durationMs: 2000,
        success: true,
        parentId: null,
        turnId: 'turn-1',
        eventId: 'evt-2',
        argumentsPreview: 'file.ts',
      },
    ],
    assistantMessages: [
      {
        interactionId: 'int-1',
        requestId: 'req-1',
        outputTokens: 500,
        inputTokens: 1200,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
        model: 'claude-sonnet-4-20250514',
        timestamp: '2025-01-15T10:00:05Z',
        turnId: 'turn-1',
        eventId: 'evt-3',
        parentId: null,
        content: 'I will help you with that.',
        reasoningText: '',
      },
    ],
    userMessages: [
      {
        interactionId: 'int-1',
        timestamp: '2025-01-15T10:00:00Z',
        turnId: 'turn-1',
        content: 'Please fix the build',
      },
    ],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: true,
    fanoutTurns: [],
    turns: [
      {
        turnId: 'turn-1',
        startTs: '2025-01-15T10:00:00Z',
        endTs: '2025-01-15T10:01:30Z',
        userMessage: {
          interactionId: 'int-1',
          timestamp: '2025-01-15T10:00:00Z',
          turnId: 'turn-1',
          content: 'Please fix the build',
        },
        assistantMessages: [
          {
            interactionId: 'int-1',
            requestId: 'req-1',
            outputTokens: 500,
            inputTokens: 1200,
            cacheReadTokens: 200,
            cacheWriteTokens: 100,
            model: 'claude-sonnet-4-20250514',
            timestamp: '2025-01-15T10:00:05Z',
            turnId: 'turn-1',
            eventId: 'evt-3',
            parentId: null,
            content: 'I will help you with that.',
            reasoningText: '',
          },
        ],
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'bash',
            model: 'claude-sonnet-4-20250514',
            startTs: '2025-01-15T10:00:10Z',
            endTs: '2025-01-15T10:00:15Z',
            durationMs: 5000,
            success: true,
            parentId: null,
            turnId: 'turn-1',
            eventId: 'evt-1',
            argumentsPreview: 'ls -la',
          },
        ],
        subagents: [],
      },
    ],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  };
}

function makeEmptySession(): Session {
  return {
    sessionId: '',
    copilotVersion: '',
    selectedModel: '',
    reasoningEffort: '',
    repository: '',
    branch: '',
    cwd: '',
    startTs: null,
    endTs: null,
    modelChanges: [],
    toolCalls: [],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: null,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
  };
}

function makeAggregation(): BenchRunAggregation {
  return {
    sessions: [
      {
        sessionId: 'test-session-001',
        label: 'Baseline',
        variantId: 'v1',
        stepIndex: null,
        wallTimeMs: 300_000,
        totalInputTokens: 12_000,
        totalOutputTokens: 5_000,
        totalCost: 0.0234,
        turnCount: 5,
        toolCallCount: 12,
        models: ['claude-sonnet-4-20250514'],
        parseStatus: 'ok',
      },
      {
        sessionId: 'test-session-002',
        label: 'Optimised',
        variantId: 'v2',
        stepIndex: null,
        wallTimeMs: 200_000,
        totalInputTokens: 8_000,
        totalOutputTokens: 3_000,
        totalCost: 0.0156,
        turnCount: 3,
        toolCallCount: 8,
        models: ['claude-sonnet-4-20250514', 'gpt-4o'],
        parseStatus: 'ok',
      },
    ],
    modelUsage: [
      {
        model: 'claude-sonnet-4-20250514',
        totalInputTokens: 18_000,
        totalOutputTokens: 7_000,
        totalCacheReadTokens: 4_000,
        totalCacheWriteTokens: 1_000,
        totalCost: 0.035,
        sessionCount: 2,
      },
      {
        model: 'gpt-4o',
        totalInputTokens: 2_000,
        totalOutputTokens: 1_000,
        totalCacheReadTokens: 500,
        totalCacheWriteTokens: 200,
        totalCost: 0.004,
        sessionCount: 1,
      },
    ],
    toolUsage: [
      {
        toolName: 'bash',
        callCount: 10,
        totalDurationMs: 45_000,
        successCount: 9,
        failureCount: 1,
        models: ['claude-sonnet-4-20250514'],
      },
      {
        toolName: 'edit',
        callCount: 8,
        totalDurationMs: 12_000,
        successCount: 8,
        failureCount: 0,
        models: ['claude-sonnet-4-20250514', 'gpt-4o'],
      },
    ],
    totalCost: 0.039,
    totalWallTimeMs: 500_000,
    variantCount: 2,
    sessionCount: 2,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('exportSessionToHtml', () => {
  it('produces valid HTML starting with <!DOCTYPE html>', () => {
    const html = exportSessionToHtml(makeSession());
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it('includes session metadata', () => {
    const html = exportSessionToHtml(makeSession());
    expect(html).toContain('test-session-001');
    expect(html).toContain('claude-sonnet-4-20250514');
    expect(html).toContain('epam-ubb-demo/agent-profiler');
  });

  it('includes inline CSS when includeStyles is true', () => {
    const html = exportSessionToHtml(makeSession(), { includeStyles: true });
    expect(html).toContain('<style>');
    expect(html).toContain('font-family');
  });

  it('includes JS when includeInteractivity is true', () => {
    const html = exportSessionToHtml(makeSession(), { includeInteractivity: true });
    expect(html).toContain('<script>');
    expect(html).toContain('data-sortable');
  });

  it('omits JS when includeInteractivity is false', () => {
    const html = exportSessionToHtml(makeSession(), { includeInteractivity: false });
    expect(html).not.toContain('<script>');
  });

  it('title option is reflected in <title> tag', () => {
    const html = exportSessionToHtml(makeSession(), { title: 'Custom Report Title' });
    expect(html).toContain('<title>Custom Report Title</title>');
  });

  it('HTML is self-contained (no external URLs)', () => {
    const html = exportSessionToHtml(makeSession());
    // No http:// or https:// URLs (except within content that might reference repos)
    // Check specifically for CDN patterns
    expect(html).not.toMatch(/href="https?:\/\//);
    expect(html).not.toMatch(/src="https?:\/\//);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href/);
  });

  it('empty session produces graceful output (not crash)', () => {
    const html = exportSessionToHtml(makeEmptySession());
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<title>');
    // Should not contain "undefined" or "null" as visible text
    expect(html).not.toContain('>undefined<');
    expect(html).not.toContain('>null<');
  });

  it('escapes XSS-dangerous content in session data', () => {
    const xssSession = makeSession({
      sessionId: '<script>alert("xss")</script>',
      repository: '"><img src=x onerror=alert(1)>',
    });
    const html = exportSessionToHtml(xssSession);
    // Script tags must be escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
    // Angle brackets in user content must be escaped
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('supports dark theme', () => {
    const html = exportSessionToHtml(makeSession(), { theme: 'dark' });
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('--bg: #1a1a2e');
  });
});

describe('exportBenchRunToHtml', () => {
  it('produces valid HTML starting with <!DOCTYPE html>', () => {
    const html = exportBenchRunToHtml(makeAggregation(), [makeSession()]);
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it('includes all sessions', () => {
    const sessions = [
      makeSession({ sessionId: 'session-a' }),
      makeSession({ sessionId: 'session-b' }),
    ];
    const html = exportBenchRunToHtml(makeAggregation(), sessions);
    expect(html).toContain('session-a');
    expect(html).toContain('session-b');
  });

  it('includes model breakdown', () => {
    const html = exportBenchRunToHtml(makeAggregation(), [makeSession()]);
    expect(html).toContain('Model Breakdown');
    expect(html).toContain('claude-sonnet-4-20250514');
    expect(html).toContain('gpt-4o');
  });

  it('includes session comparison table', () => {
    const html = exportBenchRunToHtml(makeAggregation(), [makeSession()]);
    expect(html).toContain('Session Comparison');
    expect(html).toContain('Baseline');
    expect(html).toContain('Optimised');
  });

  it('includes tool usage section', () => {
    const html = exportBenchRunToHtml(makeAggregation(), [makeSession()]);
    expect(html).toContain('Tool Usage');
    expect(html).toContain('bash');
    expect(html).toContain('edit');
  });

  it('title option is reflected in <title> tag', () => {
    const html = exportBenchRunToHtml(makeAggregation(), [makeSession()], {
      title: 'Bench Results',
    });
    expect(html).toContain('<title>Bench Results</title>');
  });

  it('HTML is self-contained (no external URLs)', () => {
    const html = exportBenchRunToHtml(makeAggregation(), [makeSession()]);
    expect(html).not.toMatch(/href="https?:\/\//);
    expect(html).not.toMatch(/src="https?:\/\//);
  });
});
