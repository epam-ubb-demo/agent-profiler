/**
 * Fan-out builder — reconstructs the fan-out tree from session events.
 *
 * Mirrors `build_fanout_turns()` from the Python prototype.
 * Groups events by turnId into FanoutTurn objects showing the parallel
 * dispatch pattern of each LLM response.
 */

import type {
  AssistantMessage,
  FanoutTurn,
  SubagentInvocation,
  ToolCall,
  UserMessage,
} from '@agent-profiler/core';

import type { SessionBuilder } from './event-handlers';

interface MutableFanoutTurn {
  turnId: string;
  startTs: string | null;
  endTs: string | null;
  model: string | null;
  assistantMessages: AssistantMessage[];
  toolCalls: ToolCall[];
  subagents: SubagentInvocation[];
  userMessage: UserMessage | null;
}

/**
 * Build the fan-out turn tree from a processed session.
 *
 * Each turn corresponds to a single LLM response — typically one assistant
 * message plus the tools dispatched in parallel during that response.
 * Events without a turnId are bucketed under `"<no-turn>"`.
 */
export function buildFanoutTurns(sb: SessionBuilder): FanoutTurn[] {
  const bucket = new Map<string, MutableFanoutTurn>();

  function getOrCreate(turnId: string | null): MutableFanoutTurn {
    const key = turnId ?? '<no-turn>';
    let turn = bucket.get(key);
    if (!turn) {
      turn = {
        turnId: key,
        startTs: null,
        endTs: null,
        model: null,
        assistantMessages: [],
        toolCalls: [],
        subagents: [],
        userMessage: null,
      };
      bucket.set(key, turn);
    }
    return turn;
  }

  function expand(turn: MutableFanoutTurn, ts: string | null, model: string | null) {
    if (ts != null) {
      if (turn.startTs == null || ts < turn.startTs) turn.startTs = ts;
      if (turn.endTs == null || ts > turn.endTs) turn.endTs = ts;
    }
    if (turn.model == null && model) turn.model = model;
  }

  for (const tc of sb.toolCalls) {
    const turn = getOrCreate(tc.turnId);
    turn.toolCalls.push(tc);
    expand(turn, tc.startTs, tc.model);
    expand(turn, tc.endTs, tc.model);
  }

  for (const msg of sb.assistantMessages) {
    const turn = getOrCreate(msg.turnId);
    turn.assistantMessages.push(msg);
    expand(turn, msg.timestamp, msg.model);
  }

  for (const sa of sb.subagents) {
    const turn = getOrCreate(sa.turnId);
    turn.subagents.push(sa);
    expand(turn, sa.timestamp, null);
  }

  // Sort turns: numeric IDs first, then by startTs
  const turns = [...bucket.values()];
  turns.sort((a, b) => {
    const aIsNum = /^\d+$/.test(a.turnId);
    const bIsNum = /^\d+$/.test(b.turnId);
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (aIsNum && bIsNum) return parseInt(a.turnId, 10) - parseInt(b.turnId, 10);
    const aTs = a.startTs ?? '';
    const bTs = b.startTs ?? '';
    if (aTs < bTs) return -1;
    if (aTs > bTs) return 1;
    return a.turnId.localeCompare(b.turnId);
  });

  // Sort internal arrays and attach user messages
  for (const turn of turns) {
    turn.toolCalls.sort((a, b) => (a.startTs ?? '').localeCompare(b.startTs ?? ''));
    turn.assistantMessages.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
    turn.subagents.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  }

  // Attach user messages by interactionId (mirrors _attach_user_messages)
  const userByInteraction = new Map<string, UserMessage>();
  for (const um of sb.userMessages) {
    if (um.interactionId && !userByInteraction.has(um.interactionId)) {
      userByInteraction.set(um.interactionId, um);
    }
  }

  for (const turn of turns) {
    for (const msg of turn.assistantMessages) {
      if (msg.interactionId && userByInteraction.has(msg.interactionId)) {
        turn.userMessage = userByInteraction.get(msg.interactionId)!;
        break;
      }
    }
  }

  // Freeze into readonly FanoutTurn objects
  return turns.map(
    (t): FanoutTurn => ({
      turnId: t.turnId,
      startTs: t.startTs,
      endTs: t.endTs,
      model: t.model,
      assistantMessages: t.assistantMessages,
      toolCalls: t.toolCalls,
      subagents: t.subagents,
      userMessage: t.userMessage,
    }),
  );
}
