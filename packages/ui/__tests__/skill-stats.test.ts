/**
 * Tests for computeSkillStats() — aggregation of skill invocation telemetry.
 *
 * Covers filtering, name resolution, aggregation by skill, source/outcome breakdown,
 * failed invocation counts, and edge cases.
 */

import type { Session, ToolCall } from '@agent-profiler/core';
import { describe, expect, it } from 'vitest';

import { computeSkillStats } from '../src/session-detail/skill-stats';

// ---------------------------------------------------------------------------
// Helpers to build minimal fixtures
// ---------------------------------------------------------------------------

/** Build a minimal Session with given tool calls. */
function makeSession(toolCalls: Partial<ToolCall>[]): Session {
  return {
    sessionId: 'test-session',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp/test',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:15:00Z',
    modelChanges: [],
    toolCalls: toolCalls.map(tc => ({
      toolCallId: tc.toolCallId ?? 'tc-1',
      toolName: tc.toolName ?? 'skill',
      model: 'claude-sonnet-4-20250514',
      startTs: '2025-01-15T10:01:00Z',
      endTs: '2025-01-15T10:01:05Z',
      durationMs: tc.durationMs ?? 1000,
      success: true,
      parentId: null,
      turnId: 'turn-1',
      eventId: null,
      argumentsPreview: tc.argumentsPreview ?? '{}',
      skillName: tc.skillName ?? null,
      skillSource: tc.skillSource ?? null,
      skillContentLength: tc.skillContentLength ?? null,
      skillOutcome: tc.skillOutcome ?? 'loaded',
      skillErrorMessage: tc.skillErrorMessage ?? null,
      ...tc,
    })),
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: {
      totalPremiumRequests: 0,
      totalApiDurationMs: 0,
      modelMetrics: [],
      currentTokens: 0,
      systemTokens: 0,
      conversationTokens: 0,
      toolDefinitionsTokens: 0,
      codeChanges: { filesCreated: 0, filesChanged: 0, filesDeleted: 0, insertions: 0, deletions: 0 },
      timestamp: '2025-01-15T10:30:00Z',
    },
    success: true,
    fanoutTurns: [],
    turns: [],
    parseStatus: { status: 'ok' as const, error: null },
    utilisation: [],
  } as unknown as Session;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('computeSkillStats', () => {
  // =========================================================================
  // Empty and edge cases
  // =========================================================================

  it('returns empty result for session with no tool calls', () => {
    const session = makeSession([]);
    const result = computeSkillStats(session);

    expect(result.rows).toEqual([]);
    expect(result.totalInvocations).toBe(0);
    expect(result.uniqueSkills).toBe(0);
    expect(result.totalContentLength).toBe(0);
    expect(result.sourceBreakdown).toEqual([]);
    expect(result.outcomeBreakdown).toEqual([]);
    expect(result.failedInvocations).toBe(0);
  });

  it('returns empty result when tool calls exist but none are skill calls', () => {
    const session = makeSession([
      { toolName: 'read_file', skillName: null },
      { toolName: 'write_file', skillName: null },
    ]);
    const result = computeSkillStats(session);

    expect(result.rows).toEqual([]);
    expect(result.totalInvocations).toBe(0);
    expect(result.uniqueSkills).toBe(0);
    expect(result.failedInvocations).toBe(0);
  });

  // =========================================================================
  // Single skill call
  // =========================================================================

  it('aggregates a single skill call with all fields set', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'FetchNews',
        skillSource: 'reddit',
        skillOutcome: 'loaded',
        skillContentLength: 2500,
        durationMs: 1500,
      },
    ]);
    const result = computeSkillStats(session);

    expect(result.totalInvocations).toBe(1);
    expect(result.uniqueSkills).toBe(1);
    expect(result.totalContentLength).toBe(2500);
    expect(result.failedInvocations).toBe(0);

    const row = result.rows[0]!;
    expect(row).toBeDefined();
    expect(row.skillName).toBe('FetchNews');
    expect(row.callCount).toBe(1);
    expect(row.source).toBe('reddit');
    expect(row.avgContentLength).toBe(2500);
    expect(row.totalDurationMs).toBe(1500);
    expect(row.avgDurationMs).toBe(1500);
    expect(row.proportion).toBe(1);
    expect(row.outcome).toBe('loaded');
  });

  it('handles a single skill call with missing optional fields', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'UnknownSkill',
        skillSource: null,
        skillContentLength: null,
        durationMs: null,
      },
    ]);
    const result = computeSkillStats(session);

    expect(result.totalInvocations).toBe(1);
    expect(result.uniqueSkills).toBe(1);
    expect(result.totalContentLength).toBe(0);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('UnknownSkill');
    expect(row.source).toBeNull();
    expect(row.avgContentLength).toBeNull();
    expect(row.totalDurationMs).toBe(0);
    expect(row.avgDurationMs).toBeNull();
  });

  // =========================================================================
  // Multiple calls to same skill
  // =========================================================================

  it('aggregates multiple calls to the same skill', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'WebSearch',
        skillSource: 'google',
        skillContentLength: 1000,
        durationMs: 500,
      },
      {
        toolName: 'skill',
        skillName: 'WebSearch',
        skillSource: 'google',
        skillContentLength: 2000,
        durationMs: 1000,
      },
      {
        toolName: 'skill',
        skillName: 'WebSearch',
        skillSource: 'bing',
        skillContentLength: 1500,
        durationMs: 750,
      },
    ]);
    const result = computeSkillStats(session);

    expect(result.totalInvocations).toBe(3);
    expect(result.uniqueSkills).toBe(1);
    expect(result.totalContentLength).toBe(4500);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('WebSearch');
    expect(row.callCount).toBe(3);
    // Most common source is 'google' (2 calls vs 1 for 'bing')
    expect(row.source).toBe('google');
    // Average content length: (1000 + 2000 + 1500) / 3 = 1500
    expect(row.avgContentLength).toBe(1500);
    // Total duration: 500 + 1000 + 750 = 2250
    expect(row.totalDurationMs).toBe(2250);
    // Average duration: 2250 / 3 = 750
    expect(row.avgDurationMs).toBe(750);
    expect(row.proportion).toBe(1);
  });

  // =========================================================================
  // Multiple different skills
  // =========================================================================

  it('aggregates multiple different skills and sorts rows by call count descending', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'SkillA', durationMs: 100 },
      { toolName: 'skill', skillName: 'SkillA', durationMs: 100 },
      { toolName: 'skill', skillName: 'SkillA', durationMs: 100 },
      { toolName: 'skill', skillName: 'SkillB', durationMs: 200 },
      { toolName: 'skill', skillName: 'SkillB', durationMs: 200 },
      { toolName: 'skill', skillName: 'SkillC', durationMs: 300 },
    ]);
    const result = computeSkillStats(session);

    expect(result.totalInvocations).toBe(6);
    expect(result.uniqueSkills).toBe(3);

    // Rows should be sorted by callCount descending
    expect(result.rows[0]!.skillName).toBe('SkillA');
    expect(result.rows[0]!.callCount).toBe(3);
    expect(result.rows[0]!.proportion).toBeCloseTo(3 / 6);

    expect(result.rows[1]!.skillName).toBe('SkillB');
    expect(result.rows[1]!.callCount).toBe(2);
    expect(result.rows[1]!.proportion).toBeCloseTo(2 / 6);

    expect(result.rows[2]!.skillName).toBe('SkillC');
    expect(result.rows[2]!.callCount).toBe(1);
    expect(result.rows[2]!.proportion).toBeCloseTo(1 / 6);
  });

  // =========================================================================
  // Source breakdown
  // =========================================================================

  it('aggregates source breakdown and sorts by count descending', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', skillSource: 'github' },
      { toolName: 'skill', skillName: 'S1', skillSource: 'github' },
      { toolName: 'skill', skillName: 'S2', skillSource: 'gitlab' },
      { toolName: 'skill', skillName: 'S2', skillSource: 'github' },
      { toolName: 'skill', skillName: 'S3', skillSource: null },
    ]);
    const result = computeSkillStats(session);

    expect(result.sourceBreakdown).toHaveLength(2);
    expect(result.sourceBreakdown[0]).toEqual({ source: 'github', count: 3 });
    expect(result.sourceBreakdown[1]).toEqual({ source: 'gitlab', count: 1 });
    // Null sources are excluded from breakdown
  });

  it('omits null sources from the source breakdown', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', skillSource: null },
      { toolName: 'skill', skillName: 'S1', skillSource: null },
      { toolName: 'skill', skillName: 'S1', skillSource: 'web' },
    ]);
    const result = computeSkillStats(session);

    expect(result.sourceBreakdown).toHaveLength(1);
    expect(result.sourceBreakdown[0]).toEqual({ source: 'web', count: 1 });
  });

  // =========================================================================
  // Outcome breakdown
  // =========================================================================

  it('aggregates outcome breakdown for different outcomes', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'S1', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'S2', skillOutcome: 'not_found' },
      { toolName: 'skill', skillName: 'S2', skillOutcome: 'disabled' },
      { toolName: 'skill', skillName: 'S3', skillOutcome: 'read_error' },
    ]);
    const result = computeSkillStats(session);

    expect(result.outcomeBreakdown).toHaveLength(4);
    // Should be sorted by count descending
    expect(result.outcomeBreakdown[0]).toEqual({ outcome: 'loaded', count: 2 });
    expect(result.outcomeBreakdown[1]).toEqual({ outcome: 'not_found', count: 1 });
    expect(result.outcomeBreakdown[2]).toEqual({ outcome: 'disabled', count: 1 });
    expect(result.outcomeBreakdown[3]).toEqual({ outcome: 'read_error', count: 1 });
  });

  // =========================================================================
  // Failed invocations
  // =========================================================================

  it('counts failed invocations (non-loaded outcomes)', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'S1', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'S2', skillOutcome: 'not_found' },
      { toolName: 'skill', skillName: 'S2', skillOutcome: 'disabled' },
      { toolName: 'skill', skillName: 'S3', skillOutcome: 'read_error' },
    ]);
    const result = computeSkillStats(session);

    expect(result.failedInvocations).toBe(3);
  });

  it('marks row outcome as most common outcome for the skill', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'Mixed', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'Mixed', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'Mixed', skillOutcome: 'loaded' },
      { toolName: 'skill', skillName: 'Mixed', skillOutcome: 'not_found' },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('Mixed');
    // Most common outcome is 'loaded' (3 out of 4)
    expect(row.outcome).toBe('loaded');
  });

  // =========================================================================
  // Content length aggregation
  // =========================================================================

  it('calculates average and total content length correctly', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', skillContentLength: 100 },
      { toolName: 'skill', skillName: 'S1', skillContentLength: 200 },
      { toolName: 'skill', skillName: 'S1', skillContentLength: 300 },
      { toolName: 'skill', skillName: 'S2', skillContentLength: 1000 },
    ]);
    const result = computeSkillStats(session);

    expect(result.totalContentLength).toBe(1600);

    // First row: SkillA (3 calls, content: 100+200+300)
    const s1Row = result.rows.find(r => r.skillName === 'S1');
    expect(s1Row).toBeDefined();
    // Average: (100 + 200 + 300) / 3 = 200
    expect(s1Row!.avgContentLength).toBe(200);

    // Second row: SkillB (1 call, content: 1000)
    const s2Row = result.rows.find(r => r.skillName === 'S2');
    expect(s2Row).toBeDefined();
    expect(s2Row!.avgContentLength).toBe(1000);
  });

  // =========================================================================
  // Duration aggregation
  // =========================================================================

  it('calculates average and total duration correctly', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', durationMs: 100 },
      { toolName: 'skill', skillName: 'S1', durationMs: 200 },
      { toolName: 'skill', skillName: 'S1', durationMs: 300 },
      { toolName: 'skill', skillName: 'S2', durationMs: 5000 },
    ]);
    const result = computeSkillStats(session);

    // First row: S1 (3 calls, durations: 100+200+300)
    const s1Row = result.rows.find(r => r.skillName === 'S1');
    expect(s1Row).toBeDefined();
    expect(s1Row!.totalDurationMs).toBe(600);
    // Average: 600 / 3 = 200
    expect(s1Row!.avgDurationMs).toBe(200);

    // Second row: S2 (1 call, duration: 5000)
    const s2Row = result.rows.find(r => r.skillName === 'S2');
    expect(s2Row).toBeDefined();
    expect(s2Row!.totalDurationMs).toBe(5000);
    expect(s2Row!.avgDurationMs).toBe(5000);
  });

  it('handles null durations gracefully', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'S1', durationMs: null },
      { toolName: 'skill', skillName: 'S1', durationMs: 100 },
      { toolName: 'skill', skillName: 'S1', durationMs: 200 },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    // Total: only non-null durations (100 + 200)
    expect(row.totalDurationMs).toBe(300);
    // Average: 300 / 2 (only 2 non-null values)
    expect(row.avgDurationMs).toBe(150);
  });

  // =========================================================================
  // Error message tracking
  // =========================================================================

  it('stores skill error message for read_error outcome', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'BrokenSkill',
        skillOutcome: 'read_error',
        skillErrorMessage: 'File not found: /path/to/skill',
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillErrorMessage).toBe('File not found: /path/to/skill');
    expect(row.outcome).toBe('read_error');
  });

  it('uses the most recent error message when multiple read_error calls occur', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'BrokenSkill',
        skillOutcome: 'read_error',
        skillErrorMessage: 'First error',
      },
      {
        toolName: 'skill',
        skillName: 'BrokenSkill',
        skillOutcome: 'read_error',
        skillErrorMessage: 'Second error',
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    // The most recent error message should be stored
    expect(row.skillErrorMessage).toBe('Second error');
  });

  it('does not set error message for non-read_error outcomes', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'NotFound',
        skillOutcome: 'not_found',
        skillErrorMessage: 'This should not appear',
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillErrorMessage).toBeUndefined();
  });

  // =========================================================================
  // Name resolution and fallback
  // =========================================================================

  it('uses skillName field when present', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: 'ExplicitSkill',
        argumentsPreview: '{"skill": "WrongSkill"}',
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('ExplicitSkill');
  });

  it('falls back to parsing argumentsPreview JSON for skill name when skillName is null', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: null,
        argumentsPreview: JSON.stringify({ skill: 'ParsedSkill', other: 'data' }),
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('ParsedSkill');
  });

  it('uses (unknown) when skillName is null and argumentsPreview cannot be parsed', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: null,
        argumentsPreview: 'not valid json',
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('(unknown)');
  });

  it('uses (unknown) when skillName is null and argumentsPreview does not contain skill key', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: null,
        argumentsPreview: JSON.stringify({ name: 'something' }),
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('(unknown)');
  });

  it('uses (unknown) when skillName is null and argumentsPreview skill value is not a string', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: null,
        argumentsPreview: JSON.stringify({ skill: 123 }),
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('(unknown)');
  });

  it('uses (unknown) when skillName is null and argumentsPreview skill is an empty string', () => {
    const session = makeSession([
      {
        toolName: 'skill',
        skillName: null,
        argumentsPreview: JSON.stringify({ skill: '' }),
      },
    ]);
    const result = computeSkillStats(session);

    const row = result.rows[0]!;
    expect(row.skillName).toBe('(unknown)');
  });

  // =========================================================================
  // Complex scenarios
  // =========================================================================

  it('handles mixed tool calls with only skill calls aggregated', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'SkillA', durationMs: 100 },
      { toolName: 'read_file', skillName: null, durationMs: 50 },
      { toolName: 'skill', skillName: 'SkillA', durationMs: 200 },
      { toolName: 'write_file', skillName: null, durationMs: 75 },
      { toolName: 'skill', skillName: 'SkillB', durationMs: 300 },
    ]);
    const result = computeSkillStats(session);

    // Only skill calls should be counted
    expect(result.totalInvocations).toBe(3);
    expect(result.uniqueSkills).toBe(2);
    expect(result.rows[0]!.skillName).toBe('SkillA');
    expect(result.rows[0]!.callCount).toBe(2);
  });

  it('handles a realistic complex scenario with multiple skills, outcomes, and sources', () => {
    const session = makeSession([
      // SkillA: 3 calls, 2 loaded, 1 not_found, sources: github (2), gitlab (1)
      {
        toolName: 'skill',
        skillName: 'SkillA',
        skillSource: 'github',
        skillOutcome: 'loaded',
        skillContentLength: 1000,
        durationMs: 500,
      },
      {
        toolName: 'skill',
        skillName: 'SkillA',
        skillSource: 'github',
        skillOutcome: 'loaded',
        skillContentLength: 1500,
        durationMs: 600,
      },
      {
        toolName: 'skill',
        skillName: 'SkillA',
        skillSource: 'gitlab',
        skillOutcome: 'not_found',
        skillContentLength: null,
        durationMs: 300,
      },
      // SkillB: 2 calls, both loaded, source: web
      {
        toolName: 'skill',
        skillName: 'SkillB',
        skillSource: 'web',
        skillOutcome: 'loaded',
        skillContentLength: 500,
        durationMs: 200,
      },
      {
        toolName: 'skill',
        skillName: 'SkillB',
        skillSource: 'web',
        skillOutcome: 'loaded',
        skillContentLength: 600,
        durationMs: 250,
      },
      // SkillC: 1 call, read_error with message
      {
        toolName: 'skill',
        skillName: 'SkillC',
        skillSource: null,
        skillOutcome: 'read_error',
        skillErrorMessage: 'Permission denied',
        skillContentLength: null,
        durationMs: 100,
      },
    ]);
    const result = computeSkillStats(session);

    expect(result.totalInvocations).toBe(6);
    expect(result.uniqueSkills).toBe(3);
    expect(result.totalContentLength).toBe(1000 + 1500 + 500 + 600);
    expect(result.failedInvocations).toBe(2); // not_found + read_error

    // Check rows are sorted by call count
    expect(result.rows[0]!.skillName).toBe('SkillA');
    expect(result.rows[0]!.callCount).toBe(3);
    expect(result.rows[0]!.source).toBe('github'); // Most common source for SkillA
    expect(result.rows[0]!.outcome).toBe('loaded'); // Most common outcome for SkillA

    expect(result.rows[1]!.skillName).toBe('SkillB');
    expect(result.rows[1]!.callCount).toBe(2);

    expect(result.rows[2]!.skillName).toBe('SkillC');
    expect(result.rows[2]!.callCount).toBe(1);
    expect(result.rows[2]!.skillErrorMessage).toBe('Permission denied');

    // Check breakdowns
    expect(result.sourceBreakdown).toEqual([
      { source: 'github', count: 2 },
      { source: 'web', count: 2 },
      { source: 'gitlab', count: 1 },
    ]);

    expect(result.outcomeBreakdown).toContainEqual({ outcome: 'loaded', count: 4 });
    expect(result.outcomeBreakdown).toContainEqual({ outcome: 'not_found', count: 1 });
    expect(result.outcomeBreakdown).toContainEqual({ outcome: 'read_error', count: 1 });
  });

  it('handles proportions correctly for multiple skills', () => {
    const session = makeSession([
      { toolName: 'skill', skillName: 'A', durationMs: 100 },
      { toolName: 'skill', skillName: 'A', durationMs: 100 },
      { toolName: 'skill', skillName: 'A', durationMs: 100 },
      { toolName: 'skill', skillName: 'B', durationMs: 100 },
      { toolName: 'skill', skillName: 'B', durationMs: 100 },
      { toolName: 'skill', skillName: 'C', durationMs: 100 },
    ]);
    const result = computeSkillStats(session);

    const totalInvocations = 6;
    const rowA = result.rows.find(r => r.skillName === 'A');
    const rowB = result.rows.find(r => r.skillName === 'B');
    const rowC = result.rows.find(r => r.skillName === 'C');

    expect(rowA!.proportion).toBeCloseTo(3 / totalInvocations);
    expect(rowB!.proportion).toBeCloseTo(2 / totalInvocations);
    expect(rowC!.proportion).toBeCloseTo(1 / totalInvocations);
  });
});
