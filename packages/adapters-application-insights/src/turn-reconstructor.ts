/**
 * Turn reconstruction from OTel span trees.
 *
 * Builds a parent–child span tree, classifies each span by kind, extracts
 * turn boundaries, and maps spans to the domain event types defined in
 * `@agent-profiler/core`.
 */

import type {
  AssistantMessage,
  FanoutTurn,
  SubagentInvocation,
  ToolCall,
  Turn,
  UserMessage,
} from '@agent-profiler/core';

import type { OTelSpan } from './schemas';
import { safeInt } from './schemas';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Semantic classification of a span. */
export type SpanKind =
  | 'llm'
  | 'tool'
  | 'subagent'
  | 'user_message'
  | 'structural';

/** A tree node wrapping a span with classification and hierarchy data. */
export interface SpanNode {
  readonly span: OTelSpan;
  readonly kind: SpanKind;
  /** Mutable — children are attached during tree construction. */
  readonly children: SpanNode[];
  readonly depth: number;
}

/** Internal mutable node used during tree construction. */
interface MutableSpanNode {
  readonly span: OTelSpan;
  readonly kind: SpanKind;
  readonly children: MutableSpanNode[];
  depth: number;
}

/** A bucket accumulating spans that belong to the same turn. */
export interface TurnBucket {
  readonly turnId: string;
  readonly spans: SpanNode[];
  /** Mutable — updated during accumulation. */
  startTs: string | null;
  /** Mutable — updated during accumulation. */
  endTs: string | null;
}

// ---------------------------------------------------------------------------
// Span classification (spike §5.2)
// ---------------------------------------------------------------------------

/**
 * Classify a span based on its custom dimensions.
 *
 * The classification follows the spike §5.2 heuristic:
 * 1. `copilot_chat.subagent.name` → `'subagent'`
 * 2. `copilot_chat.tool.call.name` → `'tool'`
 * 3. `copilot_chat.message.role === 'user'` → `'user_message'`
 * 4. `gen_ai.usage.input_tokens` or `gen_ai.usage.prompt_tokens` → `'llm'`
 * 5. Otherwise → `'structural'`
 */
export function classifySpan(span: OTelSpan): SpanKind {
  const d = span.dims;
  if (d['copilot_chat.subagent.name'] != null) return 'subagent';
  if (d['copilot_chat.tool.call.name'] != null) return 'tool';
  if (d['copilot_chat.message.role'] === 'user') return 'user_message';
  if (
    d['gen_ai.usage.input_tokens'] != null ||
    d['gen_ai.usage.prompt_tokens'] != null
  ) {
    return 'llm';
  }
  return 'structural';
}

// ---------------------------------------------------------------------------
// Span tree construction
// ---------------------------------------------------------------------------

/**
 * Build a parent–child span tree from a flat list of spans.
 *
 * Spans whose `parentSpanId` does not match any other span in the list
 * are promoted to root nodes.
 *
 * @returns The root {@link SpanNode} entries.
 */
export function buildSpanTree(spans: readonly OTelSpan[]): SpanNode[] {
  if (spans.length === 0) return [];

  // Phase 1 — create mutable nodes (depth 0 initially; adjusted later)
  const nodeMap = new Map<string, MutableSpanNode>();
  for (const span of spans) {
    nodeMap.set(span.spanId, {
      span,
      kind: classifySpan(span),
      children: [],
      depth: 0,
    });
  }

  // Phase 2 — link children to parents
  const roots: MutableSpanNode[] = [];

  for (const node of nodeMap.values()) {
    if (node.span.parentSpanId && nodeMap.has(node.span.parentSpanId)) {
      nodeMap.get(node.span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Fallback — if all spans form a cycle, promote every node to a root
  if (roots.length === 0) {
    for (const node of nodeMap.values()) {
      roots.push(node);
    }
  }

  // Phase 3 — assign depth via BFS
  const visited = new Set<string>();
  const queue: { node: MutableSpanNode; depth: number }[] = roots.map((r) => ({
    node: r,
    depth: 0,
  }));

  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (visited.has(node.span.spanId)) continue;
    visited.add(node.span.spanId);
    node.depth = depth;
    for (const child of node.children) {
      queue.push({ node: child, depth: depth + 1 });
    }
  }

  // MutableSpanNode is structurally compatible with SpanNode
  return roots as unknown as SpanNode[];
}

// ---------------------------------------------------------------------------
// Turn extraction
// ---------------------------------------------------------------------------

/**
 * Compute the end timestamp of a span from its start timestamp and
 * duration.
 */
export function computeEndTs(span: OTelSpan): string {
  try {
    const start = new Date(span.timestamp).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(span.durationMs)) {
      return span.timestamp;
    }
    return new Date(start + span.durationMs).toISOString();
  } catch {
    return span.timestamp;
  }
}

/** Recursively flatten a tree of span nodes into a flat array. */
export function flattenTree(roots: readonly SpanNode[]): SpanNode[] {
  const result: SpanNode[] = [];
  const visited = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node.span.spanId)) continue;
    visited.add(node.span.spanId);
    result.push(node);
    // Push children in reverse so left-most is popped first
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }
  return result;
}

/**
 * Update the time bounds of a turn bucket with the given span.
 */
function updateBucketBounds(bucket: TurnBucket, span: OTelSpan): void {
  if (bucket.startTs === null || span.timestamp < bucket.startTs) {
    bucket.startTs = span.timestamp;
  }
  const end = computeEndTs(span);
  if (bucket.endTs === null || end > bucket.endTs) {
    bucket.endTs = end;
  }
}

/**
 * Extract turn boundaries from a span tree.
 *
 * **Strategy A** — if any span carries a `copilot_chat.turn.id` dimension,
 * spans are grouped by that attribute (full tree traversal).
 *
 * **Strategy B** — otherwise, depth-1 children of each root are treated
 * as individual turns, with synthesised `turn-{N}` identifiers.
 *
 * @returns Sorted {@link TurnBucket} entries (by `startTs` ascending).
 */
export function extractTurns(
  roots: readonly SpanNode[],
  allSpans: readonly OTelSpan[],
): TurnBucket[] {
  if (roots.length === 0) return [];

  const TURN_DIM = 'copilot_chat.turn.id';
  const hasTurnDim = allSpans.some((s) => s.dims[TURN_DIM] != null);

  const buckets = new Map<string, TurnBucket>();

  if (hasTurnDim) {
    // Strategy A — group by explicit turn id
    const allNodes = flattenTree(roots);
    for (const node of allNodes) {
      const turnId = node.span.dims[TURN_DIM] ?? '__unassigned__';

      let bucket = buckets.get(turnId);
      if (!bucket) {
        bucket = { turnId, spans: [], startTs: null, endTs: null };
        buckets.set(turnId, bucket);
      }
      bucket.spans.push(node);
      updateBucketBounds(bucket, node.span);
    }
  } else {
    // Strategy B — depth-1 children = turns
    let turnIndex = 0;
    for (const root of roots) {
      if (root.children.length === 0) {
        // Single-span root is its own turn
        const turnId = `turn-${turnIndex++}`;
        const bucket: TurnBucket = {
          turnId,
          spans: [root],
          startTs: root.span.timestamp,
          endTs: computeEndTs(root.span),
        };
        buckets.set(turnId, bucket);
      } else {
        const sortedChildren = [...root.children].sort((a, b) =>
          a.span.timestamp.localeCompare(b.span.timestamp),
        );
        for (const child of sortedChildren) {
          const turnId = `turn-${turnIndex++}`;
          const descendants = flattenTree([child]);
          const bucket: TurnBucket = {
            turnId,
            spans: descendants,
            startTs: null,
            endTs: null,
          };
          for (const desc of descendants) {
            updateBucketBounds(bucket, desc.span);
          }
          buckets.set(turnId, bucket);
        }
      }
    }
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.startTs === null && b.startTs === null) return 0;
    if (a.startTs === null) return 1;
    if (b.startTs === null) return -1;
    return a.startTs.localeCompare(b.startTs);
  });
}

// ---------------------------------------------------------------------------
// Domain mapping (spike §5.2)
// ---------------------------------------------------------------------------

/**
 * Map an LLM span node to an {@link AssistantMessage}.
 */
export function mapAssistantMessage(
  node: SpanNode,
  turnId: string,
): AssistantMessage {
  const d = node.span.dims;
  return {
    interactionId: d['copilot_chat.interaction.id'] ?? null,
    requestId: node.span.spanId,
    outputTokens: safeInt(d['gen_ai.usage.output_tokens'] ?? d['gen_ai.usage.completion_tokens']),
    inputTokens: safeInt(d['gen_ai.usage.input_tokens'] ?? d['gen_ai.usage.prompt_tokens']),
    cacheReadTokens: safeInt(d['gen_ai.usage.cache_read_tokens']),
    cacheWriteTokens: safeInt(d['gen_ai.usage.cache_write_tokens']),
    model: d['gen_ai.response.model'] ?? d['gen_ai.request.model'] ?? null,
    timestamp: node.span.timestamp,
    turnId,
    eventId: node.span.spanId,
    parentId: node.span.parentSpanId,
    content: d['copilot_chat.message.content'] ?? '',
    reasoningText: d['copilot_chat.reasoning.text'] ?? '',
  };
}

/**
 * Map a tool span node to a {@link ToolCall}.
 */
export function mapToolCall(
  node: SpanNode,
  turnId: string,
  parentModel?: string | null,
): ToolCall {
  const d = node.span.dims;
  const args = d['copilot_chat.tool.call.arguments'] ?? '';
  return {
    toolCallId: d['copilot_chat.tool.call.id'] ?? node.span.spanId,
    toolName: d['copilot_chat.tool.call.name'] ?? node.span.name,
    model: d['gen_ai.request.model'] ?? parentModel ?? null,
    startTs: node.span.timestamp,
    endTs: computeEndTs(node.span),
    durationMs: node.span.durationMs,
    success: d['copilot_chat.tool.call.success'] != null
      ? d['copilot_chat.tool.call.success'] === 'true'
      : node.span.success,
    parentId: node.span.parentSpanId,
    turnId,
    eventId: node.span.spanId,
    argumentsPreview: args.length > 200 ? args.slice(0, 200) + '\u2026' : args,
  };
}

/**
 * Map a sub-agent span node to a {@link SubagentInvocation}.
 */
export function mapSubagentInvocation(
  node: SpanNode,
  turnId: string,
): SubagentInvocation {
  const d = node.span.dims;
  const childLlmNodes = node.children.filter((c) => c.kind === 'llm');
  const childToolNodes = node.children.filter((c) => c.kind === 'tool');

  const totalTokens = childLlmNodes.reduce((sum, c) => {
    return sum
      + safeInt(c.span.dims['gen_ai.usage.input_tokens'])
      + safeInt(c.span.dims['gen_ai.usage.output_tokens']);
  }, 0);

  return {
    timestamp: node.span.timestamp,
    totalTokens,
    messageCount: childLlmNodes.length,
    toolCallCount: childToolNodes.length,
    turnId,
    eventId: node.span.spanId,
    parentId: node.span.parentSpanId,
    agentName: d['copilot_chat.subagent.name'] ?? '',
    agentType: d['copilot_chat.subagent.type'] ?? '',
    childSessionRef: d['copilot_chat.session.id'] ?? null,
  };
}

/**
 * Map a user-message span node to a {@link UserMessage}.
 */
export function mapUserMessage(
  node: SpanNode,
  turnId: string,
): UserMessage {
  const d = node.span.dims;
  return {
    interactionId: d['copilot_chat.interaction.id'] ?? null,
    timestamp: node.span.timestamp,
    turnId,
    content: d['copilot_chat.message.content'] ?? '',
  };
}

// ---------------------------------------------------------------------------
// Turn assembly
// ---------------------------------------------------------------------------

/**
 * Build domain {@link Turn} and {@link FanoutTurn} arrays from turn
 * buckets.
 *
 * For each bucket the constituent span nodes are classified and mapped
 * to the appropriate event types.
 */
export function buildTurns(
  buckets: readonly TurnBucket[],
): { turns: Turn[]; fanoutTurns: FanoutTurn[] } {
  const turns: Turn[] = [];
  const fanoutTurns: FanoutTurn[] = [];

  for (const bucket of buckets) {
    const assistantMessages: AssistantMessage[] = [];
    const toolCalls: ToolCall[] = [];
    const subagents: SubagentInvocation[] = [];
    let userMessage: UserMessage | null = null;

    // Sort spans chronologically for proper model tracking
    const sortedSpans = [...bucket.spans].sort((a, b) =>
      a.span.timestamp.localeCompare(b.span.timestamp),
    );

    let currentModel: string | null = null;

    for (const node of sortedSpans) {
      switch (node.kind) {
        case 'llm': {
          const msg = mapAssistantMessage(node, bucket.turnId);
          assistantMessages.push(msg);
          currentModel = msg.model;
          break;
        }
        case 'tool':
          toolCalls.push(mapToolCall(node, bucket.turnId, currentModel));
          break;
        case 'subagent':
          subagents.push(mapSubagentInvocation(node, bucket.turnId));
          break;
        case 'user_message':
          userMessage = mapUserMessage(node, bucket.turnId);
          break;
        case 'structural':
          // Structural spans are not mapped to domain events
          break;
      }
    }

    const turn: Turn = {
      turnId: bucket.turnId,
      startTs: bucket.startTs,
      endTs: bucket.endTs,
      userMessage,
      assistantMessages,
      toolCalls,
      subagents,
    };
    turns.push(turn);

    const fanoutTurn: FanoutTurn = {
      turnId: bucket.turnId,
      startTs: bucket.startTs,
      endTs: bucket.endTs,
      model: assistantMessages[0]?.model ?? null,
      assistantMessages,
      toolCalls,
      subagents,
      userMessage,
    };
    fanoutTurns.push(fanoutTurn);
  }

  return { turns, fanoutTurns };
}
