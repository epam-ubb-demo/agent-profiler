/**
 * Turn builder — groups events by turnId into Turn objects.
 *
 * Links tool.start/tool.complete pairs and attaches sub-agent invocations
 * to their parent turn via turnId.
 */

import type { AssistantMessage, SubagentInvocation, ToolCall, Turn, UserMessage } from '@agent-profiler/core';

import type { SessionBuilder } from './event-handlers';

/**
 * Build Turn objects from processed session data.
 *
 * Groups tool calls, assistant messages, user messages, and sub-agent
 * invocations by their turnId. Each unique turnId becomes one Turn.
 */
export function buildTurns(sb: SessionBuilder): Turn[] {
  const buckets = new Map<
    string,
    {
      toolCalls: ToolCall[];
      assistantMessages: AssistantMessage[];
      userMessage: UserMessage | null;
      subagents: SubagentInvocation[];
      startTs: string | null;
      endTs: string | null;
    }
  >();

  function getOrCreate(turnId: string | null) {
    const key = turnId ?? '<no-turn>';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        toolCalls: [],
        assistantMessages: [],
        userMessage: null,
        subagents: [],
        startTs: null,
        endTs: null,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  function expandTs(bucket: ReturnType<typeof getOrCreate>, ts: string | null) {
    if (ts == null) return;
    if (bucket.startTs == null || ts < bucket.startTs) bucket.startTs = ts;
    if (bucket.endTs == null || ts > bucket.endTs) bucket.endTs = ts;
  }

  // Assign tool calls
  for (const tc of sb.toolCalls) {
    const bucket = getOrCreate(tc.turnId);
    bucket.toolCalls.push(tc);
    expandTs(bucket, tc.startTs);
    expandTs(bucket, tc.endTs);
  }

  // Assign assistant messages
  for (const msg of sb.assistantMessages) {
    const bucket = getOrCreate(msg.turnId);
    bucket.assistantMessages.push(msg);
    expandTs(bucket, msg.timestamp);
  }

  // Assign sub-agents
  for (const sa of sb.subagents) {
    const bucket = getOrCreate(sa.turnId);
    bucket.subagents.push(sa);
    expandTs(bucket, sa.timestamp);
  }

  // Attach user messages by interactionId match (mirrors _attach_user_messages)
  const userByInteraction = new Map<string, UserMessage>();
  for (const um of sb.userMessages) {
    if (um.interactionId && !userByInteraction.has(um.interactionId)) {
      userByInteraction.set(um.interactionId, um);
    }
  }

  for (const [, bucket] of buckets) {
    for (const msg of bucket.assistantMessages) {
      if (msg.interactionId && userByInteraction.has(msg.interactionId)) {
        bucket.userMessage = userByInteraction.get(msg.interactionId)!;
        break;
      }
    }
  }

  // Also assign user messages directly by turnId
  for (const um of sb.userMessages) {
    if (um.turnId) {
      const bucket = getOrCreate(um.turnId);
      if (!bucket.userMessage) {
        bucket.userMessage = um;
      }
      expandTs(bucket, um.timestamp);
    }
  }

  // Sort turns: numeric IDs first, then by startTs
  const entries = [...buckets.entries()];
  entries.sort((a, b) => {
    const aNum = /^\d+$/.test(a[0]) ? 0 : 1;
    const bNum = /^\d+$/.test(b[0]) ? 0 : 1;
    if (aNum !== bNum) return aNum - bNum;
    if (aNum === 0) return parseInt(a[0], 10) - parseInt(b[0], 10);
    const aTs = a[1].startTs ?? '';
    const bTs = b[1].startTs ?? '';
    if (aTs < bTs) return -1;
    if (aTs > bTs) return 1;
    return 0;
  });

  return entries.map(([turnId, bucket]): Turn => ({
    turnId,
    startTs: bucket.startTs,
    endTs: bucket.endTs,
    userMessage: bucket.userMessage,
    assistantMessages: bucket.assistantMessages,
    toolCalls: bucket.toolCalls,
    subagents: bucket.subagents,
  }));
}
