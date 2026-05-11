import { describe, it, expect } from 'vitest';

import type { OTelSpan } from '../src/schemas';
import {
  assembleSession,
  aggregateModelMetrics,
  deriveParseStatus,
  deriveSuccess,
  detectModelChanges,
  aggregateShutdownMetrics,
} from '../src/session-assembler';
import type { SpanNode } from '../src/turn-reconstructor';
import { validSessionRows, partialOrphanRows, minimalSessionRows } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan(overrides: Partial<OTelSpan> = {}): OTelSpan {
  return {
    spanId: 'span-1',
    parentSpanId: null,
    traceId: 'trace-1',
    name: 'test',
    timestamp: '2025-01-01T00:00:00.000Z',
    durationMs: 100,
    success: true,
    dims: {},
    ...overrides,
  };
}

function makeNode(
  spanOverrides: Partial<OTelSpan> = {},
  nodeOverrides: Partial<Pick<SpanNode, 'kind' | 'children' | 'depth'>> = {},
): SpanNode {
  const span = makeSpan(spanOverrides);
  return {
    span,
    kind: nodeOverrides.kind ?? 'structural',
    children: nodeOverrides.children ?? [],
    depth: nodeOverrides.depth ?? 0,
  };
}

function makeRawRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'span-1',
    operation_Id: 'trace-1',
    operation_ParentId: 'parent-1',
    name: 'test-span',
    timestamp: '2025-01-01T00:00:00.000Z',
    duration: 100,
    success: true,
    customDimensions: '{}',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aggregateModelMetrics
// ---------------------------------------------------------------------------

describe('aggregateModelMetrics', () => {
  it('aggregates metrics for a single model', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        durationMs: 50,
        dims: {
          'gen_ai.response.model': 'claude-4',
          'gen_ai.usage.input_tokens': '10',
          'gen_ai.usage.output_tokens': '20',
        },
      }),
      makeSpan({
        spanId: 'llm-2',
        durationMs: 100,
        dims: {
          'gen_ai.response.model': 'claude-4',
          'gen_ai.usage.input_tokens': '30',
          'gen_ai.usage.output_tokens': '40',
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.model).toBe('claude-4');
    expect(metrics[0]!.inputTokens).toBe(40);
    expect(metrics[0]!.outputTokens).toBe(60);
    expect(metrics[0]!.requestCount).toBe(2);
    expect(metrics[0]!.apiDurationMs).toBe(150);
  });

  it('creates separate entries for different models', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        dims: { 'gen_ai.response.model': 'claude-4', 'gen_ai.usage.input_tokens': '10' },
      }),
      makeSpan({
        spanId: 'llm-2',
        dims: { 'gen_ai.response.model': 'gpt-5', 'gen_ai.usage.input_tokens': '20' },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    expect(metrics).toHaveLength(2);
    const models = metrics.map((m) => m.model).sort();
    expect(models).toEqual(['claude-4', 'gpt-5']);
  });

  it('returns empty array for empty input', () => {
    expect(aggregateModelMetrics([])).toEqual([]);
  });

  it('uses prompt_tokens fallback when input_tokens is absent', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        dims: {
          'gen_ai.response.model': 'claude-4',
          'gen_ai.usage.prompt_tokens': '15',
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    expect(metrics[0]!.inputTokens).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// deriveParseStatus
// ---------------------------------------------------------------------------

describe('deriveParseStatus', () => {
  it('returns failed when there are no spans', () => {
    const status = deriveParseStatus([], 0, []);

    expect(status.status).toBe('failed');
    expect(status.error).toBe('No spans found for session');
  });

  it('returns ok for normal input', () => {
    const spans = [makeSpan()];
    const status = deriveParseStatus(spans, 1, []);

    expect(status.status).toBe('ok');
    expect(status.error).toBeNull();
  });

  it('returns partial when no turns are reconstructed', () => {
    const spans = [makeSpan()];
    const status = deriveParseStatus(spans, 0, []);

    expect(status.status).toBe('partial');
  });

  it('returns partial when there are parse errors', () => {
    const spans = [makeSpan()];
    const status = deriveParseStatus(spans, 1, ['Row 0: bad']);

    expect(status.status).toBe('partial');
  });

  it('returns partial when orphan ratio exceeds 50%', () => {
    // 3 spans, 2 of which have non-existent parents → orphan ratio = 2/3 > 50%
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null }),
      makeSpan({ spanId: 'orphan-1', parentSpanId: 'missing-a' }),
      makeSpan({ spanId: 'orphan-2', parentSpanId: 'missing-b' }),
    ];

    const status = deriveParseStatus(spans, 1, []);

    expect(status.status).toBe('partial');
  });

  it('does not count root spans as orphans', () => {
    const spans = [
      makeSpan({ spanId: 'r1', parentSpanId: null }),
      makeSpan({ spanId: 'r2', parentSpanId: null }),
      makeSpan({ spanId: 'r3', parentSpanId: null }),
    ];

    const status = deriveParseStatus(spans, 1, []);

    expect(status.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// deriveSuccess
// ---------------------------------------------------------------------------

describe('deriveSuccess', () => {
  it('returns null when there are no roots', () => {
    expect(deriveSuccess([])).toBeNull();
  });

  it('returns true when all nodes succeed', () => {
    const root = makeNode({ success: true });
    expect(deriveSuccess([root])).toBe(true);
  });

  it('returns false when a root span failed', () => {
    const root = makeNode({ success: false });
    expect(deriveSuccess([root])).toBe(false);
  });

  it('returns null when root succeeds but descendant fails', () => {
    const child = makeNode({ spanId: 'c', success: false }, { depth: 1 });
    const root = makeNode({ spanId: 'r', success: true }, { children: [child] });

    expect(deriveSuccess([root])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectModelChanges
// ---------------------------------------------------------------------------

describe('detectModelChanges', () => {
  it('returns empty for empty input', () => {
    expect(detectModelChanges([])).toEqual([]);
  });

  it('returns empty when single model throughout', () => {
    const nodes = [
      makeNode({ timestamp: '2025-01-01T00:00:00.000Z', dims: { 'gen_ai.response.model': 'claude-4' } }, { kind: 'llm' }),
      makeNode({ timestamp: '2025-01-01T00:01:00.000Z', dims: { 'gen_ai.response.model': 'claude-4' } }, { kind: 'llm' }),
    ];

    expect(detectModelChanges(nodes)).toEqual([]);
  });

  it('detects a model switch', () => {
    const nodes = [
      makeNode({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z', dims: { 'gen_ai.response.model': 'model-a' } }, { kind: 'llm' }),
      makeNode({ spanId: 'b', timestamp: '2025-01-01T00:01:00.000Z', dims: { 'gen_ai.response.model': 'model-b' } }, { kind: 'llm' }),
    ];

    const changes = detectModelChanges(nodes);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.model).toBe('model-b');
  });

  it('detects multiple switches', () => {
    const nodes = [
      makeNode({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z', dims: { 'gen_ai.response.model': 'a' } }, { kind: 'llm' }),
      makeNode({ spanId: 'b', timestamp: '2025-01-01T00:01:00.000Z', dims: { 'gen_ai.response.model': 'b' } }, { kind: 'llm' }),
      makeNode({ spanId: 'c', timestamp: '2025-01-01T00:02:00.000Z', dims: { 'gen_ai.response.model': 'a' } }, { kind: 'llm' }),
    ];

    const changes = detectModelChanges(nodes);

    expect(changes).toHaveLength(2);
    expect(changes[0]!.model).toBe('b');
    expect(changes[1]!.model).toBe('a');
  });

  it('skips spans with no model info and reports no artificial changes', () => {
    const nodes = [
      makeNode({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z', dims: { 'gen_ai.response.model': 'model-a' } }, { kind: 'llm' }),
      makeNode({ spanId: 'b', timestamp: '2025-01-01T00:01:00.000Z', dims: {} }, { kind: 'llm' }),
      makeNode({ spanId: 'c', timestamp: '2025-01-01T00:02:00.000Z', dims: { 'gen_ai.response.model': 'model-a' } }, { kind: 'llm' }),
    ];

    const changes = detectModelChanges(nodes);

    expect(changes).toEqual([]);
  });

  it('sets currentModel from first span that has model info', () => {
    const nodes = [
      makeNode({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z', dims: {} }, { kind: 'llm' }),
      makeNode({ spanId: 'b', timestamp: '2025-01-01T00:01:00.000Z', dims: { 'gen_ai.response.model': 'model-a' } }, { kind: 'llm' }),
    ];

    const changes = detectModelChanges(nodes);

    expect(changes).toEqual([]);
  });

  it('returns empty changes when all spans have no model info', () => {
    const nodes = [
      makeNode({ spanId: 'a', timestamp: '2025-01-01T00:00:00.000Z', dims: {} }, { kind: 'llm' }),
      makeNode({ spanId: 'b', timestamp: '2025-01-01T00:01:00.000Z', dims: {} }, { kind: 'llm' }),
    ];

    const changes = detectModelChanges(nodes);

    expect(changes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// aggregateShutdownMetrics
// ---------------------------------------------------------------------------

describe('aggregateShutdownMetrics', () => {
  it('returns null when there are no LLM nodes', () => {
    expect(aggregateShutdownMetrics([], [])).toBeNull();
  });

  it('aggregates metrics from LLM nodes', () => {
    const node = makeNode(
      {
        spanId: 'llm-1',
        durationMs: 200,
        dims: {
          'gen_ai.response.model': 'claude-4',
          'gen_ai.usage.input_tokens': '10',
          'gen_ai.usage.output_tokens': '20',
        },
      },
      { kind: 'llm' },
    );

    const allSpans = [node.span];
    const shutdown = aggregateShutdownMetrics([node], allSpans);

    expect(shutdown).not.toBeNull();
    expect(shutdown!.totalPremiumRequests).toBe(1);
    expect(shutdown!.totalApiDurationMs).toBe(200);
    expect(shutdown!.modelMetrics).toHaveLength(1);
  });

  it('uses MAX(timestamp + duration) for shutdown timestamp', () => {
    const earlyLongSpan = makeSpan({
      spanId: 'llm-1',
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: 10000,
      dims: {
        'gen_ai.response.model': 'claude-4',
        'gen_ai.usage.input_tokens': '10',
        'gen_ai.usage.output_tokens': '20',
      },
    });

    const lateLlmSpan = makeSpan({
      spanId: 'llm-2',
      timestamp: '2025-01-01T00:00:05.000Z',
      durationMs: 100,
      dims: {
        'gen_ai.response.model': 'claude-4',
        'gen_ai.usage.input_tokens': '5',
        'gen_ai.usage.output_tokens': '10',
      },
    });

    const llmNodes = [
      makeNode(
        { ...earlyLongSpan },
        { kind: 'llm' },
      ),
      makeNode(
        { ...lateLlmSpan },
        { kind: 'llm' },
      ),
    ];

    const allSpans = [earlyLongSpan, lateLlmSpan];
    const shutdown = aggregateShutdownMetrics(llmNodes, allSpans);

    // earlyLongSpan ends at T+10s, lateLlmSpan ends at T+5.1s
    // MAX should be T+10s = 2025-01-01T00:00:10.000Z
    expect(shutdown!.timestamp).toBe('2025-01-01T00:00:10.000Z');
  });

  it('tolerates NaN end timestamps from unparseable dates', () => {
    const llmNode = makeNode(
      {
        spanId: 'llm-nan',
        durationMs: 100,
        timestamp: '2025-01-01T00:00:00.000Z',
        dims: {
          'gen_ai.response.model': 'claude-4',
          'gen_ai.usage.input_tokens': '10',
          'gen_ai.usage.output_tokens': '5',
        },
      },
      { kind: 'llm' },
    );

    const goodSpan = makeSpan({
      spanId: 'good',
      timestamp: '2025-01-01T00:00:01.000Z',
      durationMs: 50,
    });

    const badSpan = makeSpan({
      spanId: 'bad',
      timestamp: 'not-a-date',
      durationMs: 100,
    });

    const shutdown = aggregateShutdownMetrics([llmNode], [goodSpan, badSpan]);

    expect(shutdown).not.toBeNull();
    // timestamp must be a valid ISO string, not NaN
    expect(Number.isNaN(new Date(shutdown!.timestamp).getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assembleSession — integration
// ---------------------------------------------------------------------------

describe('assembleSession', () => {
  it('assembles a realistic mini session', () => {
    const rootRow = makeRawRow({
      id: 'root',
      operation_Id: 'trace-1',
      operation_ParentId: null,
      name: 'session',
      timestamp: '2025-01-01T00:00:00.000Z',
      duration: 10000,
      customDimensions: JSON.stringify({
        'copilot_chat.session.id': 'sess-1',
      }),
    });

    // Turn-level spans (depth 1)
    const turn1Row = makeRawRow({
      id: 'turn-1-span',
      operation_Id: 'trace-1',
      operation_ParentId: 'root',
      name: 'turn-1',
      timestamp: '2025-01-01T00:00:01.000Z',
      duration: 4000,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-1',
      }),
    });

    const turn2Row = makeRawRow({
      id: 'turn-2-span',
      operation_Id: 'trace-1',
      operation_ParentId: 'root',
      name: 'turn-2',
      timestamp: '2025-01-01T00:00:05.000Z',
      duration: 5000,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-2',
      }),
    });

    // Under turn 1: LLM + tool + user message
    const llm1Row = makeRawRow({
      id: 'llm-1',
      operation_Id: 'trace-1',
      operation_ParentId: 'turn-1-span',
      name: 'llm-call',
      timestamp: '2025-01-01T00:00:01.500Z',
      duration: 1000,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-1',
        'gen_ai.usage.input_tokens': '100',
        'gen_ai.usage.output_tokens': '50',
        'gen_ai.response.model': 'claude-4',
      }),
    });

    const toolRow = makeRawRow({
      id: 'tool-1',
      operation_Id: 'trace-1',
      operation_ParentId: 'turn-1-span',
      name: 'tool-call',
      timestamp: '2025-01-01T00:00:02.500Z',
      duration: 500,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-1',
        'copilot_chat.tool.call.name': 'read_file',
        'copilot_chat.tool.call.id': 'tc-1',
      }),
    });

    const userRow = makeRawRow({
      id: 'user-1',
      operation_Id: 'trace-1',
      operation_ParentId: 'turn-1-span',
      name: 'user-message',
      timestamp: '2025-01-01T00:00:01.000Z',
      duration: 10,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-1',
        'copilot_chat.message.role': 'user',
        'copilot_chat.message.content': 'hello',
      }),
    });

    // Under turn 2: LLM (different model) + subagent with child LLM
    const llm2Row = makeRawRow({
      id: 'llm-2',
      operation_Id: 'trace-1',
      operation_ParentId: 'turn-2-span',
      name: 'llm-call-2',
      timestamp: '2025-01-01T00:00:05.500Z',
      duration: 1500,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-2',
        'gen_ai.usage.input_tokens': '200',
        'gen_ai.usage.output_tokens': '100',
        'gen_ai.response.model': 'gpt-5',
      }),
    });

    const subagentRow = makeRawRow({
      id: 'subagent-1',
      operation_Id: 'trace-1',
      operation_ParentId: 'turn-2-span',
      name: 'subagent',
      timestamp: '2025-01-01T00:00:07.000Z',
      duration: 2000,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-2',
        'copilot_chat.subagent.name': 'code-reviewer',
        'copilot_chat.subagent.type': 'review',
      }),
    });

    const subagentLlmRow = makeRawRow({
      id: 'subagent-llm-1',
      operation_Id: 'trace-1',
      operation_ParentId: 'subagent-1',
      name: 'subagent-llm',
      timestamp: '2025-01-01T00:00:07.500Z',
      duration: 800,
      customDimensions: JSON.stringify({
        'copilot_chat.turn.id': 'turn-2',
        'gen_ai.usage.input_tokens': '50',
        'gen_ai.usage.output_tokens': '25',
        'gen_ai.response.model': 'gpt-5',
      }),
    });

    const rows = [
      rootRow,
      turn1Row,
      turn2Row,
      llm1Row,
      toolRow,
      userRow,
      llm2Row,
      subagentRow,
      subagentLlmRow,
    ];

    const session = assembleSession(rows);

    // Session identity
    expect(session.sessionId).toBe('sess-1');

    // Turns (turn-1, turn-2, plus <no-turn> for spans without turn IDs)
    expect(session.turns).toHaveLength(3);
    expect(session.fanoutTurns).toHaveLength(3);

    // Events
    expect(session.toolCalls).toHaveLength(1);
    expect(session.assistantMessages.length).toBeGreaterThanOrEqual(2);
    expect(session.userMessages).toHaveLength(1);
    expect(session.subagents).toHaveLength(1);

    // Model changes (claude-4 → gpt-5)
    expect(session.modelChanges.length).toBeGreaterThanOrEqual(1);

    // Shutdown
    expect(session.shutdown).not.toBeNull();
    expect(session.shutdown!.modelMetrics.length).toBeGreaterThanOrEqual(1);

    // Parse status
    expect(session.parseStatus.status).toBe('ok');

    // Defaults
    expect(session.compactions).toEqual([]);
    expect(session.utilisation).toEqual([]);
    expect(session.copilotVersion).toBe('');

    // Time bounds
    expect(session.startTs).not.toBeNull();
    expect(session.endTs).not.toBeNull();
  });

  it('handles empty rows', () => {
    const session = assembleSession([]);

    expect(session.parseStatus.status).toBe('failed');
    expect(session.turns).toEqual([]);
    expect(session.fanoutTurns).toEqual([]);
    expect(session.toolCalls).toEqual([]);
    expect(session.assistantMessages).toEqual([]);
    expect(session.userMessages).toEqual([]);
    expect(session.subagents).toEqual([]);
    expect(session.modelChanges).toEqual([]);
    expect(session.compactions).toEqual([]);
    expect(session.utilisation).toEqual([]);
    expect(session.shutdown).toBeNull();
  });

  it('picks selectedModel from the chronologically-first LLM span', () => {
    // LLM span with later timestamp but earlier insertion order uses model-b
    const llmLate = makeRawRow({
      id: 'llm-late',
      operation_Id: 'trace-1',
      operation_ParentId: null,
      name: 'llm',
      timestamp: '2025-01-01T00:00:02.000Z',
      duration: 100,
      customDimensions: JSON.stringify({
        'gen_ai.response.model': 'model-b',
        'gen_ai.usage.input_tokens': '10',
      }),
    });

    // LLM span with earlier timestamp uses model-a
    const llmEarly = makeRawRow({
      id: 'llm-early',
      operation_Id: 'trace-1',
      operation_ParentId: null,
      name: 'llm',
      timestamp: '2025-01-01T00:00:01.000Z',
      duration: 100,
      customDimensions: JSON.stringify({
        'gen_ai.response.model': 'model-a',
        'gen_ai.usage.input_tokens': '5',
      }),
    });

    // Deliberately put the late row first to test that insertion order doesn't matter
    const session = assembleSession([llmLate, llmEarly]);

    expect(session.selectedModel).toBe('model-a');
  });

  it('scans all spans for sessionId, not just spans[0]', () => {
    const structuralRow = makeRawRow({
      id: 'structural',
      operation_Id: 'trace-1',
      operation_ParentId: null,
      name: 'root',
      timestamp: '2025-01-01T00:00:00.000Z',
      duration: 100,
      customDimensions: '{}',
    });

    const llmRow = makeRawRow({
      id: 'llm-1',
      operation_Id: 'trace-1',
      operation_ParentId: 'structural',
      name: 'llm',
      timestamp: '2025-01-01T00:00:01.000Z',
      duration: 100,
      customDimensions: JSON.stringify({
        'copilot_chat.session.id': 'my-session',
        'gen_ai.usage.input_tokens': '10',
      }),
    });

    const session = assembleSession([structuralRow, llmRow]);

    expect(session.sessionId).toBe('my-session');
  });

  // -----------------------------------------------------------------------
  // Fixture-based full pipeline tests
  // -----------------------------------------------------------------------

  it('assembles valid-session fixture with correct session identity', () => {
    const session = assembleSession(validSessionRows);

    expect(session.sessionId).toBe('sess-valid-001');
    expect(session.repository).toBe('epam/agent-profiler');
    expect(session.branch).toBe('main');
    expect(session.cwd).toBe('/home/dev/agent-profiler');
  });

  it('assembles valid-session fixture with correct turn structure', () => {
    const session = assembleSession(validSessionRows);

    // 3 explicit turn IDs + 1 <no-turn> bucket for root span
    expect(session.turns.length).toBeGreaterThanOrEqual(3);
    expect(session.fanoutTurns.length).toBeGreaterThanOrEqual(3);
  });

  it('assembles valid-session fixture with correct event counts', () => {
    const session = assembleSession(validSessionRows);

    // 3 user messages, 4 tool calls (read_file, edit, bash, grep), 1 subagent
    expect(session.userMessages).toHaveLength(3);
    expect(session.toolCalls.length).toBeGreaterThanOrEqual(4);
    expect(session.subagents).toHaveLength(1);
    expect(session.assistantMessages.length).toBeGreaterThanOrEqual(3);
  });

  it('assembles valid-session fixture with model change detection', () => {
    const session = assembleSession(validSessionRows);

    // claude-4 is first, then gpt-5 in turn 3
    expect(session.selectedModel).toBe('claude-4');
    expect(session.modelChanges.length).toBeGreaterThanOrEqual(1);
    expect(session.modelChanges.some((c) => c.model === 'gpt-5')).toBe(true);
  });

  it('assembles valid-session fixture with ok parseStatus', () => {
    const session = assembleSession(validSessionRows);

    expect(session.parseStatus.status).toBe('ok');
    expect(session.parseStatus.error).toBeNull();
  });

  it('assembles partial-orphans fixture with partial parseStatus', () => {
    const session = assembleSession(partialOrphanRows);

    expect(session.parseStatus.status).toBe('partial');
    expect(session.parseStatus.error).toContain('orphan');
  });

  it('assembles minimal-session fixture using traceId as sessionId', () => {
    const session = assembleSession(minimalSessionRows);

    expect(session.sessionId).toBe('minimal-trace-001');
    expect(session.selectedModel).toBe('claude-4');
    expect(session.turns.length).toBeGreaterThanOrEqual(1);
    expect(session.parseStatus.status).toBe('ok');
  });

  it('assembles minimal-session fixture with shutdown metrics', () => {
    const session = assembleSession(minimalSessionRows);

    expect(session.shutdown).not.toBeNull();
    expect(session.shutdown!.totalPremiumRequests).toBe(1);
    expect(session.shutdown!.modelMetrics).toHaveLength(1);
    expect(session.shutdown!.modelMetrics[0]!.inputTokens).toBe(500);
  });

  it('falls back to traceId when copilot_chat.session.id is empty string', () => {
    const rows = [
      makeRawRow({
        id: 'span-a',
        operation_Id: 'trace-abc',
        operation_ParentId: '',
        name: 'root',
        customDimensions: JSON.stringify({ 'copilot_chat.session.id': '' }),
      }),
      makeRawRow({
        id: 'span-b',
        operation_Id: 'trace-abc',
        operation_ParentId: 'span-a',
        name: 'child',
        customDimensions: JSON.stringify({ 'copilot_chat.session.id': '' }),
      }),
    ];

    const session = assembleSession(rows);

    // sessionId should be traceId, not empty string
    expect(session.sessionId).toBe('trace-abc');
  });
});

// ---------------------------------------------------------------------------
// Edge case: Model aggregation with missing model dimensions
// ---------------------------------------------------------------------------

describe('aggregateModelMetrics — missing model dimensions', () => {
  it('produces empty-string key when both gen_ai.response.model and gen_ai.request.model are missing', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        durationMs: 50,
        dims: {
          'gen_ai.usage.input_tokens': '10',
          'gen_ai.usage.output_tokens': '20',
          // No gen_ai.response.model
          // No gen_ai.request.model
        },
      }),
      makeSpan({
        spanId: 'llm-2',
        durationMs: 100,
        dims: {
          'gen_ai.usage.input_tokens': '30',
          'gen_ai.usage.output_tokens': '40',
          // No gen_ai.response.model
          // No gen_ai.request.model
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    // Should produce exactly one entry with empty-string model key
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.model).toBe('');
    expect(metrics[0]!.inputTokens).toBe(40);
    expect(metrics[0]!.outputTokens).toBe(60);
    expect(metrics[0]!.requestCount).toBe(2);
    expect(metrics[0]!.apiDurationMs).toBe(150);
  });

  it('uses fallback from gen_ai.request.model when gen_ai.response.model is missing', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        dims: {
          'gen_ai.usage.input_tokens': '5',
          'gen_ai.usage.output_tokens': '10',
          // No gen_ai.response.model
          'gen_ai.request.model': 'gpt-4',
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.model).toBe('gpt-4');
  });

  it('prefers gen_ai.response.model over gen_ai.request.model', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        dims: {
          'gen_ai.usage.input_tokens': '5',
          'gen_ai.response.model': 'gpt-5-final',
          'gen_ai.request.model': 'gpt-5-base',
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.model).toBe('gpt-5-final');
  });
});

// ---------------------------------------------------------------------------
// Edge case: Empty-string model treated same as missing (via ?? operator)
// ---------------------------------------------------------------------------

describe('aggregateModelMetrics — empty-string model dimension', () => {
  it('creates empty-string key when gen_ai.response.model is empty string', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-1',
        durationMs: 75,
        dims: {
          'gen_ai.usage.input_tokens': '15',
          'gen_ai.usage.output_tokens': '25',
          'gen_ai.response.model': '', // Empty string is "present" (not null/undefined)
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    // Empty string dimension is treated as "present" by ??, so model = ''
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.model).toBe('');
    expect(metrics[0]!.inputTokens).toBe(15);
    expect(metrics[0]!.outputTokens).toBe(25);
  });

  it('aggregates missing and empty-string model into the same empty-key bucket', () => {
    const spans = [
      makeSpan({
        spanId: 'llm-missing',
        dims: {
          'gen_ai.usage.input_tokens': '5',
          // No response.model, no request.model → key is ''
        },
      }),
      makeSpan({
        spanId: 'llm-empty',
        dims: {
          'gen_ai.usage.input_tokens': '10',
          'gen_ai.response.model': '', // Empty string is present
        },
      }),
      makeSpan({
        spanId: 'llm-valid',
        dims: {
          'gen_ai.usage.input_tokens': '20',
          'gen_ai.response.model': 'claude-opus',
        },
      }),
    ];

    const metrics = aggregateModelMetrics(spans);

    // Both empty-string cases aggregate into the same empty-string bucket
    expect(metrics).toHaveLength(2);
    const models = metrics.map((m) => m.model).sort();
    expect(models).toEqual(['', 'claude-opus']);

    // The empty-string bucket should have llm-missing and llm-empty
    const emptyBucket = metrics.find((m) => m.model === '');
    expect(emptyBucket!.inputTokens).toBe(15); // 5 + 10
    expect(emptyBucket!.requestCount).toBe(2);

    // The claude-opus bucket should have only llm-valid
    const claudeBucket = metrics.find((m) => m.model === 'claude-opus');
    expect(claudeBucket!.inputTokens).toBe(20);
    expect(claudeBucket!.requestCount).toBe(1);
  });
});
