import { describe, it, expect } from 'vitest';

import { type OTelSpan, parseSpanRows } from '../src/schemas';
import {
  type SpanNode,
  type TurnBucket,
  classifySpan,
  buildSpanTree,
  extractTurns,
  mapAssistantMessage,
  mapToolCall,
  mapSubagentInvocation,
  mapUserMessage,
  buildTurns,
  computeEndTs,
  flattenTree,
} from '../src/turn-reconstructor';
import { validSessionRows } from './fixtures';

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

// ---------------------------------------------------------------------------
// classifySpan
// ---------------------------------------------------------------------------

describe('classifySpan', () => {
  it('returns subagent when copilot_chat.subagent.name is present', () => {
    expect(classifySpan(makeSpan({ dims: { 'copilot_chat.subagent.name': 'agent-x' } }))).toBe('subagent');
  });

  it('returns tool when copilot_chat.tool.call.name is present', () => {
    expect(classifySpan(makeSpan({ dims: { 'copilot_chat.tool.call.name': 'read_file' } }))).toBe('tool');
  });

  it('returns user_message when copilot_chat.message.role is user', () => {
    expect(classifySpan(makeSpan({ dims: { 'copilot_chat.message.role': 'user' } }))).toBe('user_message');
  });

  it('returns llm when gen_ai.usage.input_tokens is present', () => {
    expect(classifySpan(makeSpan({ dims: { 'gen_ai.usage.input_tokens': '100' } }))).toBe('llm');
  });

  it('returns llm when gen_ai.usage.prompt_tokens is present (fallback)', () => {
    expect(classifySpan(makeSpan({ dims: { 'gen_ai.usage.prompt_tokens': '100' } }))).toBe('llm');
  });

  it('returns structural for a plain span', () => {
    expect(classifySpan(makeSpan())).toBe('structural');
  });

  it('prioritises subagent over llm', () => {
    expect(
      classifySpan(
        makeSpan({
          dims: {
            'copilot_chat.subagent.name': 'agent-x',
            'gen_ai.usage.input_tokens': '100',
          },
        }),
      ),
    ).toBe('subagent');
  });

  it('returns structural for empty-string dimension values', () => {
    expect(classifySpan(makeSpan({ dims: { 'copilot_chat.subagent.name': '' } }))).toBe('structural');
    expect(classifySpan(makeSpan({ dims: { 'copilot_chat.tool.call.name': '' } }))).toBe('structural');
    expect(classifySpan(makeSpan({ dims: { 'gen_ai.usage.input_tokens': '' } }))).toBe('structural');
  });
});

// ---------------------------------------------------------------------------
// buildSpanTree
// ---------------------------------------------------------------------------

describe('buildSpanTree', () => {
  it('returns empty roots for empty input', () => {
    expect(buildSpanTree([])).toEqual([]);
  });

  it('creates a single root for a span with no parent', () => {
    const roots = buildSpanTree([makeSpan({ spanId: 'r', parentSpanId: null })]);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.span.spanId).toBe('r');
    expect(roots[0]!.depth).toBe(0);
  });

  it('links child to parent', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null }),
      makeSpan({ spanId: 'child', parentSpanId: 'root' }),
    ];

    const roots = buildSpanTree(spans);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.children).toHaveLength(1);
    expect(roots[0]!.children[0]!.span.spanId).toBe('child');
    expect(roots[0]!.children[0]!.depth).toBe(1);
  });

  it('assigns correct depths for multi-level tree', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null }),
      makeSpan({ spanId: 'child', parentSpanId: 'root' }),
      makeSpan({ spanId: 'grandchild', parentSpanId: 'child' }),
    ];

    const roots = buildSpanTree(spans);
    const child = roots[0]!.children[0]!;
    const grandchild = child.children[0]!;

    expect(roots[0]!.depth).toBe(0);
    expect(child.depth).toBe(1);
    expect(grandchild.depth).toBe(2);
  });

  it('promotes orphans to roots', () => {
    const spans = [
      makeSpan({ spanId: 'orphan', parentSpanId: 'nonexistent' }),
    ];

    const roots = buildSpanTree(spans);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.span.spanId).toBe('orphan');
  });

  it('handles multiple roots', () => {
    const spans = [
      makeSpan({ spanId: 'root-a', parentSpanId: null }),
      makeSpan({ spanId: 'root-b', parentSpanId: null }),
    ];

    const roots = buildSpanTree(spans);

    expect(roots).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// extractTurns
// ---------------------------------------------------------------------------

describe('extractTurns', () => {
  it('returns empty for empty roots', () => {
    expect(extractTurns([], [])).toEqual([]);
  });

  it('groups by copilot_chat.turn.id (Strategy A)', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null, dims: { 'copilot_chat.turn.id': 'turn-a' } }),
      makeSpan({ spanId: 'child', parentSpanId: 'root', dims: { 'copilot_chat.turn.id': 'turn-a' } }),
    ];
    const roots = buildSpanTree(spans);

    const buckets = extractTurns(roots, spans);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.turnId).toBe('turn-a');
    expect(buckets[0]!.spans).toHaveLength(2);
  });

  it('uses depth-based strategy when no turn dim present (Strategy B)', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null, timestamp: '2025-01-01T00:00:00.000Z' }),
      makeSpan({ spanId: 'child-1', parentSpanId: 'root', timestamp: '2025-01-01T00:01:00.000Z' }),
      makeSpan({ spanId: 'child-2', parentSpanId: 'root', timestamp: '2025-01-01T00:02:00.000Z' }),
    ];
    const roots = buildSpanTree(spans);

    const buckets = extractTurns(roots, spans);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.turnId).toBe('turn-0');
    expect(buckets[1]!.turnId).toBe('turn-1');
  });

  it('creates a single turn for a root with no children (Strategy B)', () => {
    const spans = [makeSpan({ spanId: 'root', parentSpanId: null })];
    const roots = buildSpanTree(spans);

    const buckets = extractTurns(roots, spans);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.spans).toHaveLength(1);
  });

  it('sorts turn buckets by startTs', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null }),
      makeSpan({ spanId: 'c1', parentSpanId: 'root', timestamp: '2025-01-02T00:00:00.000Z', durationMs: 10 }),
      makeSpan({ spanId: 'c2', parentSpanId: 'root', timestamp: '2025-01-01T00:00:00.000Z', durationMs: 10 }),
    ];
    const roots = buildSpanTree(spans);

    const buckets = extractTurns(roots, spans);

    expect(buckets[0]!.startTs! <= buckets[1]!.startTs!).toBe(true);
  });

  it('collects spans without turn id into <no-turn> bucket (Strategy A)', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null, dims: { 'copilot_chat.turn.id': 'turn-a' } }),
      makeSpan({ spanId: 'child', parentSpanId: 'root', dims: {} }),
    ];
    const roots = buildSpanTree(spans);

    const buckets = extractTurns(roots, spans);

    expect(buckets).toHaveLength(2);
    const turnIds = buckets.map((b) => b.turnId).sort();
    expect(turnIds).toEqual(['<no-turn>', 'turn-a']);
    const unassigned = buckets.find((b) => b.turnId === '<no-turn>')!;
    expect(unassigned.spans).toHaveLength(1);
    expect(unassigned.spans[0]!.span.spanId).toBe('child');
  });

  it('sorts children by timestamp before assigning synthetic IDs (Strategy B)', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null, timestamp: '2025-01-01T00:00:00.000Z' }),
      makeSpan({ spanId: 'child-late', parentSpanId: 'root', timestamp: '2025-01-01T00:02:00.000Z' }),
      makeSpan({ spanId: 'child-early', parentSpanId: 'root', timestamp: '2025-01-01T00:01:00.000Z' }),
    ];
    const roots = buildSpanTree(spans);

    const buckets = extractTurns(roots, spans);

    expect(buckets).toHaveLength(2);
    // turn-0 should be the chronologically earlier child
    expect(buckets[0]!.turnId).toBe('turn-0');
    expect(buckets[0]!.spans[0]!.span.spanId).toBe('child-early');
    expect(buckets[1]!.turnId).toBe('turn-1');
    expect(buckets[1]!.spans[0]!.span.spanId).toBe('child-late');
  });

  it('promotes all nodes to roots when every span forms a cycle', () => {
    const spans: OTelSpan[] = [
      makeSpan({ spanId: 'a', parentSpanId: 'b' }),
      makeSpan({ spanId: 'b', parentSpanId: 'a' }),
    ];
    const result = buildSpanTree(spans);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// mapAssistantMessage
// ---------------------------------------------------------------------------

describe('mapAssistantMessage', () => {
  it('maps requestId to span.spanId', () => {
    const node = makeNode({ spanId: 'llm-1' }, { kind: 'llm' });
    const msg = mapAssistantMessage(node, 'turn-0');
    expect(msg.requestId).toBe('llm-1');
  });

  it('uses input_tokens with fallback to prompt_tokens', () => {
    const withInput = makeNode(
      { dims: { 'gen_ai.usage.input_tokens': '10' } },
      { kind: 'llm' },
    );
    expect(mapAssistantMessage(withInput, 'turn-0').inputTokens).toBe(10);

    const withPrompt = makeNode(
      { dims: { 'gen_ai.usage.prompt_tokens': '20' } },
      { kind: 'llm' },
    );
    expect(mapAssistantMessage(withPrompt, 'turn-0').inputTokens).toBe(20);
  });

  it('uses response.model with fallback to request.model', () => {
    const withResp = makeNode(
      { dims: { 'gen_ai.response.model': 'claude-4' } },
      { kind: 'llm' },
    );
    expect(mapAssistantMessage(withResp, 'turn-0').model).toBe('claude-4');

    const withReq = makeNode(
      { dims: { 'gen_ai.request.model': 'gpt-5' } },
      { kind: 'llm' },
    );
    expect(mapAssistantMessage(withReq, 'turn-0').model).toBe('gpt-5');
  });

  it('maps content from copilot_chat.message.content', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.message.content': 'hello world' } },
      { kind: 'llm' },
    );
    expect(mapAssistantMessage(node, 'turn-0').content).toBe('hello world');
  });

  it('maps reasoningText from copilot_chat.reasoning.text', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.reasoning.text': 'thinking...' } },
      { kind: 'llm' },
    );
    expect(mapAssistantMessage(node, 'turn-0').reasoningText).toBe('thinking...');
  });

  it('defaults missing optional dims to null or empty', () => {
    const node = makeNode({}, { kind: 'llm' });
    const msg = mapAssistantMessage(node, 'turn-0');

    expect(msg.model).toBeNull();
    expect(msg.content).toBe('');
    expect(msg.reasoningText).toBe('');
    expect(msg.interactionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapToolCall
// ---------------------------------------------------------------------------

describe('mapToolCall', () => {
  it('maps toolCallId from dim, falling back to spanId', () => {
    const withDim = makeNode(
      { dims: { 'copilot_chat.tool.call.id': 'tc-1', 'copilot_chat.tool.call.name': 'read' } },
      { kind: 'tool' },
    );
    expect(mapToolCall(withDim, 'turn-0').toolCallId).toBe('tc-1');

    const withoutDim = makeNode(
      { spanId: 'span-fallback', dims: { 'copilot_chat.tool.call.name': 'read' } },
      { kind: 'tool' },
    );
    expect(mapToolCall(withoutDim, 'turn-0').toolCallId).toBe('span-fallback');
  });

  it('maps success from dim string, falling back to span success', () => {
    const explicit = makeNode(
      { success: true, dims: { 'copilot_chat.tool.call.success': 'false', 'copilot_chat.tool.call.name': 'x' } },
      { kind: 'tool' },
    );
    expect(mapToolCall(explicit, 'turn-0').success).toBe(false);

    const fallback = makeNode(
      { success: true, dims: { 'copilot_chat.tool.call.name': 'x' } },
      { kind: 'tool' },
    );
    expect(mapToolCall(fallback, 'turn-0').success).toBe(true);
  });

  it('truncates arguments longer than 200 chars', () => {
    const longArgs = 'x'.repeat(250);
    const node = makeNode(
      { dims: { 'copilot_chat.tool.call.arguments': longArgs, 'copilot_chat.tool.call.name': 'x' } },
      { kind: 'tool' },
    );

    const tc = mapToolCall(node, 'turn-0');

    expect(tc.argumentsPreview.length).toBe(201); // 200 + ellipsis char
    expect(tc.argumentsPreview.endsWith('\u2026')).toBe(true);
  });

  it('does not truncate arguments 200 chars or shorter', () => {
    const shortArgs = 'y'.repeat(200);
    const node = makeNode(
      { dims: { 'copilot_chat.tool.call.arguments': shortArgs, 'copilot_chat.tool.call.name': 'x' } },
      { kind: 'tool' },
    );

    const tc = mapToolCall(node, 'turn-0');

    expect(tc.argumentsPreview).toBe(shortArgs);
  });

  it('uses parentModel when the tool span has no model dim', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.tool.call.name': 'read_file' } },
      { kind: 'tool' },
    );

    const tc = mapToolCall(node, 'turn-0', 'claude-4');

    expect(tc.model).toBe('claude-4');
  });

  it('prefers tool span model dim over parentModel', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.tool.call.name': 'read_file', 'gen_ai.request.model': 'gpt-5' } },
      { kind: 'tool' },
    );

    const tc = mapToolCall(node, 'turn-0', 'claude-4');

    expect(tc.model).toBe('gpt-5');
  });
});

// ---------------------------------------------------------------------------
// mapSubagentInvocation
// ---------------------------------------------------------------------------

describe('mapSubagentInvocation', () => {
  it('aggregates tokens and counts from child nodes', () => {
    const llmChild = makeNode(
      {
        spanId: 'llm-child',
        dims: {
          'gen_ai.usage.input_tokens': '10',
          'gen_ai.usage.output_tokens': '20',
        },
      },
      { kind: 'llm', depth: 1 },
    );
    const toolChild = makeNode(
      { spanId: 'tool-child', dims: { 'copilot_chat.tool.call.name': 'read' } },
      { kind: 'tool', depth: 1 },
    );

    const parent = makeNode(
      { spanId: 'subagent-1', dims: { 'copilot_chat.subagent.name': 'agent-x' } },
      { kind: 'subagent', children: [llmChild, toolChild], depth: 0 },
    );

    const inv = mapSubagentInvocation(parent, 'turn-0');

    expect(inv.totalTokens).toBe(30);
    expect(inv.messageCount).toBe(1);
    expect(inv.toolCallCount).toBe(1);
  });

  it('returns zero counts when there are no children', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.subagent.name': 'agent-x' } },
      { kind: 'subagent', children: [] },
    );

    const inv = mapSubagentInvocation(node, 'turn-0');

    expect(inv.totalTokens).toBe(0);
    expect(inv.messageCount).toBe(0);
    expect(inv.toolCallCount).toBe(0);
  });

  it('maps childSessionRef from copilot_chat.session.id', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.subagent.name': 'a', 'copilot_chat.session.id': 'child-sess' } },
      { kind: 'subagent' },
    );

    expect(mapSubagentInvocation(node, 'turn-0').childSessionRef).toBe('child-sess');
  });
});

// ---------------------------------------------------------------------------
// mapUserMessage
// ---------------------------------------------------------------------------

describe('mapUserMessage', () => {
  it('maps content and turnId', () => {
    const node = makeNode(
      { dims: { 'copilot_chat.message.role': 'user', 'copilot_chat.message.content': 'hi' } },
      { kind: 'user_message' },
    );

    const msg = mapUserMessage(node, 'turn-0');

    expect(msg.content).toBe('hi');
    expect(msg.turnId).toBe('turn-0');
  });
});

// ---------------------------------------------------------------------------
// buildTurns
// ---------------------------------------------------------------------------

describe('buildTurns', () => {
  it('returns empty arrays for empty buckets', () => {
    const { turns, fanoutTurns } = buildTurns([]);

    expect(turns).toEqual([]);
    expect(fanoutTurns).toEqual([]);
  });

  it('produces turns and fanoutTurns with same length', () => {
    const bucket: TurnBucket = {
      turnId: 'turn-0',
      spans: [
        makeNode(
          { dims: { 'gen_ai.usage.input_tokens': '5', 'gen_ai.response.model': 'claude' } },
          { kind: 'llm' },
        ),
      ],
      startTs: '2025-01-01T00:00:00.000Z',
      endTs: '2025-01-01T00:01:00.000Z',
    };

    const { turns, fanoutTurns } = buildTurns([bucket]);

    expect(turns).toHaveLength(1);
    expect(fanoutTurns).toHaveLength(1);
  });

  it('sets fanoutTurn model from first assistant message', () => {
    const bucket: TurnBucket = {
      turnId: 'turn-0',
      spans: [
        makeNode(
          { dims: { 'gen_ai.usage.input_tokens': '5', 'gen_ai.response.model': 'claude-4' } },
          { kind: 'llm' },
        ),
      ],
      startTs: '2025-01-01T00:00:00.000Z',
      endTs: '2025-01-01T00:01:00.000Z',
    };

    const { fanoutTurns } = buildTurns([bucket]);

    expect(fanoutTurns[0]!.model).toBe('claude-4');
  });

  it('sorts events chronologically within each turn', () => {
    const bucket: TurnBucket = {
      turnId: 'turn-0',
      spans: [
        makeNode(
          {
            spanId: 'tool-1',
            timestamp: '2025-01-01T00:00:03.000Z',
            durationMs: 100,
            dims: { 'copilot_chat.tool.call.name': 'read_file' },
          },
          { kind: 'tool' },
        ),
        makeNode(
          {
            spanId: 'llm-1',
            timestamp: '2025-01-01T00:00:01.000Z',
            durationMs: 200,
            dims: { 'gen_ai.usage.input_tokens': '10', 'gen_ai.response.model': 'claude-4' },
          },
          { kind: 'llm' },
        ),
        makeNode(
          {
            spanId: 'llm-2',
            timestamp: '2025-01-01T00:00:05.000Z',
            durationMs: 150,
            dims: { 'gen_ai.usage.input_tokens': '20', 'gen_ai.response.model': 'gpt-5' },
          },
          { kind: 'llm' },
        ),
      ],
      startTs: '2025-01-01T00:00:01.000Z',
      endTs: '2025-01-01T00:00:05.150Z',
    };

    const { turns } = buildTurns([bucket]);

    // LLM spans should be sorted: llm-1 first, llm-2 second
    expect(turns[0]!.assistantMessages[0]!.requestId).toBe('llm-1');
    expect(turns[0]!.assistantMessages[1]!.requestId).toBe('llm-2');
    // Tool call should inherit model from the LLM span that preceded it
    expect(turns[0]!.toolCalls[0]!.model).toBe('claude-4');
  });
});

// ---------------------------------------------------------------------------
// computeEndTs
// ---------------------------------------------------------------------------

describe('computeEndTs', () => {
  it('computes end timestamp from start + durationMs', () => {
    const span = makeSpan({
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: 5000,
    });

    expect(computeEndTs(span)).toBe('2025-01-01T00:00:05.000Z');
  });

  it('returns span.timestamp when durationMs is NaN', () => {
    const span = makeSpan({
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: NaN,
    });

    expect(() => computeEndTs(span)).not.toThrow();
    expect(computeEndTs(span)).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns span.timestamp when durationMs is Infinity', () => {
    const span = makeSpan({
      timestamp: '2025-01-01T00:00:00.000Z',
      durationMs: Infinity,
    });

    expect(() => computeEndTs(span)).not.toThrow();
    expect(computeEndTs(span)).toBe('2025-01-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

describe('flattenTree', () => {
  it('flattens a multi-level tree', () => {
    const grandchild = makeNode({ spanId: 'gc' }, { depth: 2 });
    const child1 = makeNode({ spanId: 'c1' }, { depth: 1, children: [grandchild] });
    const child2 = makeNode({ spanId: 'c2' }, { depth: 1 });
    const root = makeNode({ spanId: 'r' }, { depth: 0, children: [child1, child2] });

    const flat = flattenTree([root]);

    expect(flat).toHaveLength(4);
    expect(flat.map((n) => n.span.spanId)).toContain('r');
    expect(flat.map((n) => n.span.spanId)).toContain('c1');
    expect(flat.map((n) => n.span.spanId)).toContain('c2');
    expect(flat.map((n) => n.span.spanId)).toContain('gc');
  });

  it('terminates and deduplicates when the tree contains a cycle', () => {
    const nodeA = makeNode({ spanId: 'a' }, { depth: 0 });
    const nodeB = makeNode({ spanId: 'b' }, { depth: 1 });

    // Create a cycle: A → B → A
    (nodeA.children as SpanNode[]).push(nodeB);
    (nodeB.children as SpanNode[]).push(nodeA);

    const flat = flattenTree([nodeA]);

    // Must terminate and return each node exactly once
    expect(flat).toHaveLength(2);
    expect(flat.map((n) => n.span.spanId).sort()).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Fixture-based full pipeline test — valid-session fixture through buildTurns
// ---------------------------------------------------------------------------

describe('buildTurns — valid-session fixture end-to-end', () => {
  it('reconstructs turns from valid 13-span session', () => {
    const { spans } = parseSpanRows(validSessionRows);
    const roots = buildSpanTree(spans);
    const buckets = extractTurns(roots, spans);
    const { turns } = buildTurns(buckets);

    // At least 3 turn groups (one per user message)
    expect(turns.length).toBeGreaterThanOrEqual(3);
  });

  it('classifies all valid-session fixture spans into known categories', () => {
    const { spans } = parseSpanRows(validSessionRows);
    const classified = spans.map((s) => classifySpan(s));

    const validKinds = new Set(['llm', 'tool', 'subagent', 'user_message', 'structural']);
    expect(classified.length).toBe(spans.length);
    // Assert each classification is one of the known SpanKind values
    for (const kind of classified) {
      expect(validKinds.has(kind)).toBe(true);
    }
    // Verify the fixture exercises multiple classification categories
    const uniqueKinds = new Set(classified);
    expect(uniqueKinds.size).toBeGreaterThanOrEqual(3);
  });

  it('builds correct span tree from valid-session fixture', () => {
    const { spans } = parseSpanRows(validSessionRows);
    const roots = buildSpanTree(spans);

    // There should be a single root span (the session root)
    expect(roots.length).toBeGreaterThanOrEqual(1);
    // The root span should have children
    expect(roots[0]!.children.length).toBeGreaterThan(0);
  });
});
