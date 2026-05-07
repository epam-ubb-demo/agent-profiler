/**
 * FanoutTimeline — collapsible table grouped by interaction.
 *
 * Renders session turns grouped by interactionId, with expandable
 * interaction rows and turn detail rows showing tool calls,
 * sub-agents, and assistant messages.  Includes per-turn cost
 * estimates and interleaved compaction rows.
 */

import type { Compaction, Session, Turn } from '@agent-profiler/core';
import { DEFAULT_PRICING_TABLE } from '@agent-profiler/pricing';
import { memo, useCallback, useMemo, useState } from 'react';

import { formatDuration, formatTokenCount } from '../comparative/format';

import styles from './session-detail.module.css';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface FanoutTimelineProps {
  readonly session: Session;
  readonly modelColours: Record<string, string>;
  /** Called when the user wants to drill into a sub-agent's child session. */
  readonly onSessionNavigate?: (sessionId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format a timestamp to HH:MM:SS (en-GB). */
function formatTime(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

/** Aggregate token totals for a single turn's assistant messages. */
function turnTokens(turn: Turn) {
  let output = 0;
  let input = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const msg of turn.assistantMessages) {
    output += msg.outputTokens;
    input += msg.inputTokens;
    cacheRead += msg.cacheReadTokens;
    cacheWrite += msg.cacheWriteTokens;
  }
  return { output, input, cacheRead, cacheWrite };
}

/** Estimate USD cost from token counts and model name. */
function estimateCostUsd(
  model: string | null,
  output: number,
  input: number,
  cacheRead: number,
  cacheWrite: number,
): number | null {
  if (!model) return null;
  const rates = DEFAULT_PRICING_TABLE[model];
  if (!rates) return null;
  return (
    (output * rates.output +
      input * rates.input +
      cacheRead * rates.cacheRead +
      cacheWrite * rates.cacheWrite) /
    1_000_000
  );
}

/** Format a cost value as $X.XX or <$0.01. */
function formatCost(usd: number | null): string {
  if (usd === null) return '—';
  if (usd < 0.005) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

/** Tokens for a compaction event (mapped to the same shape as turnTokens). */
function compactionTokens(c: Compaction) {
  return {
    output: c.outputTokens,
    input: c.inputTokens,
    cacheRead: c.cacheRead,
    cacheWrite: c.cacheWrite,
  };
}

/* ------------------------------------------------------------------ */
/*  Interaction group type                                             */
/* ------------------------------------------------------------------ */

interface InteractionGroup {
  interactionId: string;
  /** Turns and compactions interleaved by timestamp. */
  events: ReadonlyArray<{ type: 'turn'; turn: Turn } | { type: 'compaction'; compaction: Compaction }>;
  turns: Turn[];
  compactions: Compaction[];
  totalTools: number;
  totalOutput: number;
  totalInput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCostUsd: number | null;
  userMessagePreview: string;
  startTs: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function FanoutTimelineInner({ session, modelColours, onSessionNavigate }: FanoutTimelineProps) {
  /* --- state -------------------------------------------------------- */
  const [expandedInteractions, setExpandedInteractions] = useState<Set<string>>(new Set());
  const [expandedTurns, setExpandedTurns] = useState<Set<string>>(new Set());

  /* --- toggles ------------------------------------------------------ */
  const toggleInteraction = useCallback((id: string) => {
    setExpandedInteractions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleTurn = useCallback((turnId: string) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
  }, []);

  /* --- grouping ----------------------------------------------------- */
  const groups: InteractionGroup[] = useMemo(() => {
    const turnMap = new Map<string, Turn[]>();

    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i]!;
      const key = turn.userMessage?.interactionId ?? `__idx_${String(i)}`;
      const arr = turnMap.get(key);
      if (arr) arr.push(turn);
      else turnMap.set(key, [turn]);
    }

    // Build a lookup of compactions by turnId for interleaving
    const compactionsByInteraction = new Map<string, Compaction[]>();
    for (const c of session.compactions) {
      // Match compaction to interaction via its turnId → turn's interactionId
      const matchedTurn = c.turnId
        ? session.turns.find((t) => t.turnId === c.turnId)
        : undefined;
      const intId = matchedTurn?.userMessage?.interactionId ?? '__unmatched';
      const arr = compactionsByInteraction.get(intId);
      if (arr) arr.push(c);
      else compactionsByInteraction.set(intId, [c]);
    }

    const result: InteractionGroup[] = [];
    for (const [interactionId, turns] of turnMap) {
      let totalTools = 0;
      let totalOutput = 0;
      let totalInput = 0;
      let totalCacheRead = 0;
      let totalCacheWrite = 0;
      let totalCostUsd: number | null = 0;

      for (const t of turns) {
        totalTools += t.toolCalls.length;
        const tok = turnTokens(t);
        totalOutput += tok.output;
        totalInput += tok.input;
        totalCacheRead += tok.cacheRead;
        totalCacheWrite += tok.cacheWrite;
        const model = t.assistantMessages[0]?.model ?? null;
        const turnCost = estimateCostUsd(model, tok.output, tok.input, tok.cacheRead, tok.cacheWrite);
        if (turnCost !== null && totalCostUsd !== null) totalCostUsd += turnCost;
        else if (turnCost === null && tok.output > 0) totalCostUsd = null;
      }

      const compactions = compactionsByInteraction.get(interactionId) ?? [];
      for (const c of compactions) {
        const ct = compactionTokens(c);
        totalOutput += ct.output;
        totalInput += ct.input;
        totalCacheRead += ct.cacheRead;
        totalCacheWrite += ct.cacheWrite;
        const cCost = estimateCostUsd(c.model, ct.output, ct.input, ct.cacheRead, ct.cacheWrite);
        if (cCost !== null && totalCostUsd !== null) totalCostUsd += cCost;
        else if (cCost === null && ct.output > 0) totalCostUsd = null;
      }

      // Interleave turns and compactions by timestamp
      type EventItem = { type: 'turn'; turn: Turn } | { type: 'compaction'; compaction: Compaction };
      const turnEvents = turns.map((t) => ({ type: 'turn' as const, turn: t, ts: t.startTs }));
      const compEvents = compactions.map((c) => ({ type: 'compaction' as const, compaction: c, ts: c.timestamp }));
      const allSorted = [...turnEvents, ...compEvents];
      allSorted.sort((a, b) => {
        if (!a.ts || !b.ts) return 0;
        return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
      });
      const events: EventItem[] = allSorted.map((ev) =>
        ev.type === 'turn'
          ? { type: 'turn', turn: ev.turn }
          : { type: 'compaction', compaction: ev.compaction },
      );

      const firstTurn = turns[0];
      const firstUserMsg = firstTurn?.userMessage?.content ?? '';
      const userMessagePreview =
        firstUserMsg.length > 80 ? firstUserMsg.slice(0, 80) + '…' : firstUserMsg;

      result.push({
        interactionId,
        events,
        turns,
        compactions,
        totalTools,
        totalOutput,
        totalInput,
        totalCacheRead,
        totalCacheWrite,
        totalCostUsd,
        userMessagePreview,
        startTs: firstTurn?.startTs ?? null,
      });
    }

    return result;
  }, [session.turns, session.compactions]);

  /* --- grand totals ------------------------------------------------- */
  const grandTotals = useMemo(() => {
    let tools = 0;
    let output = 0;
    let input = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let costUsd: number | null = 0;
    for (const g of groups) {
      tools += g.totalTools;
      output += g.totalOutput;
      input += g.totalInput;
      cacheRead += g.totalCacheRead;
      cacheWrite += g.totalCacheWrite;
      if (g.totalCostUsd !== null && costUsd !== null) costUsd += g.totalCostUsd;
      else costUsd = null;
    }
    return { tools, output, input, cacheRead, cacheWrite, costUsd };
  }, [groups]);

  /* --- render ------------------------------------------------------- */
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.fanoutTable} role="grid" data-testid="fanout-timeline">
        <thead>
          <tr>
            <th scope="col" style={{ width: 32 }} />
            <th scope="col">Event</th>
            <th scope="col">Time</th>
            <th scope="col">Model</th>
            <th scope="col" className={styles.numericCell}>Tools</th>
            <th scope="col" className={styles.numericCell}>Out</th>
            <th scope="col" className={styles.numericCell}>In</th>
            <th scope="col" className={styles.numericCell}>Cache R</th>
            <th scope="col" className={styles.numericCell}>Cache W</th>
            <th scope="col" className={styles.numericCell}>Est. USD</th>
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => {
            const interactionOpen = expandedInteractions.has(group.interactionId);

            return (
              <InteractionRows
                key={group.interactionId}
                group={group}
                interactionOpen={interactionOpen}
                expandedTurns={expandedTurns}
                modelColours={modelColours}
                onToggleInteraction={toggleInteraction}
                onToggleTurn={toggleTurn}
                onSessionNavigate={onSessionNavigate}
              />
            );
          })}
        </tbody>

        <tfoot>
          <tr className={styles.totalsRow}>
            <td />
            <td>Total</td>
            <td />
            <td />
            <td className={styles.numericCell}>{grandTotals.tools}</td>
            <td className={styles.numericCell}>{formatTokenCount(grandTotals.output)}</td>
            <td className={styles.numericCell}>{formatTokenCount(grandTotals.input)}</td>
            <td className={styles.numericCell}>{formatTokenCount(grandTotals.cacheRead)}</td>
            <td className={styles.numericCell}>{formatTokenCount(grandTotals.cacheWrite)}</td>
            <td className={styles.numericCell}>{formatCost(grandTotals.costUsd)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  InteractionRows — rows for a single interaction group              */
/* ------------------------------------------------------------------ */

interface InteractionRowsProps {
  readonly group: InteractionGroup;
  readonly interactionOpen: boolean;
  readonly expandedTurns: Set<string>;
  readonly modelColours: Record<string, string>;
  readonly onToggleInteraction: (id: string) => void;
  readonly onToggleTurn: (turnId: string) => void;
  readonly onSessionNavigate?: (sessionId: string) => void;
}

const InteractionRows = memo(function InteractionRows({
  group,
  interactionOpen,
  expandedTurns,
  modelColours,
  onToggleInteraction,
  onToggleTurn,
  onSessionNavigate,
}: InteractionRowsProps) {
  return (
    <>
      {/* Interaction summary */}
      <tr
        className={styles.fanoutInteractionRow}
        onClick={() => onToggleInteraction(group.interactionId)}
        aria-expanded={interactionOpen}
        style={{ cursor: 'pointer' }}
      >
        <td>
          <span
            className={
              styles.fanoutCaret + (interactionOpen ? ' ' + styles.fanoutCaretOpen : '')
            }
          >
            ▸
          </span>
        </td>
        <td>Interaction{group.userMessagePreview ? ` · ${group.userMessagePreview}` : ''}</td>
        <td>{formatTime(group.startTs)}</td>
        <td className={styles.fanoutModelSummary}>
          <span className={styles.typeBadgeTurn}>turns×{group.turns.length}</span>
          {group.compactions.length > 0 && (
            <span className={styles.typeBadgeCompaction}>compactions×{group.compactions.length}</span>
          )}
        </td>
        <td className={styles.numericCell}><strong>{group.totalTools}</strong></td>
        <td className={styles.numericCell}><strong>{formatTokenCount(group.totalOutput)}</strong></td>
        <td className={styles.numericCell}>{formatTokenCount(group.totalInput)}</td>
        <td className={styles.numericCell}>{formatTokenCount(group.totalCacheRead)}</td>
        <td className={styles.numericCell}>{formatTokenCount(group.totalCacheWrite)}</td>
        <td className={styles.numericCell}><strong>{formatCost(group.totalCostUsd)}</strong></td>
      </tr>

      {/* Child rows (visible when interaction is expanded) */}
      {interactionOpen &&
        group.events.map((ev) => {
          if (ev.type === 'turn') {
            const turn = ev.turn;
            const turnOpen = expandedTurns.has(turn.turnId);
            const tok = turnTokens(turn);
            const firstModel = turn.assistantMessages[0]?.model ?? null;

            return (
              <TurnRows
                key={turn.turnId}
                turn={turn}
                turnOpen={turnOpen}
                tokens={tok}
                firstModel={firstModel}
                modelColours={modelColours}
                onToggle={onToggleTurn}
                onSessionNavigate={onSessionNavigate}
              />
            );
          }
          // compaction row
          const c = ev.compaction;
          const ct = compactionTokens(c);
          const cCost = estimateCostUsd(c.model, ct.output, ct.input, ct.cacheRead, ct.cacheWrite);
          return (
            <tr key={`comp-${c.timestamp ?? ''}`} className={styles.fanoutCompactionRow}>
              <td />
              <td><span className={styles.typeBadgeCompaction}>compaction</span></td>
              <td>{formatTime(c.timestamp)}</td>
              <td>
                {c.model && (
                  <span className={styles.modelName ?? ''}>
                    <span
                      className={styles.modelDot}
                      style={{ backgroundColor: modelColours[c.model] ?? '#888' }}
                    />
                    {c.model}
                  </span>
                )}
              </td>
              <td className={styles.numericCell}>—</td>
              <td className={styles.numericCell}>{formatTokenCount(ct.output)}</td>
              <td className={styles.numericCell}>{formatTokenCount(ct.input)}</td>
              <td className={styles.numericCell}>{formatTokenCount(ct.cacheRead)}</td>
              <td className={styles.numericCell}>{formatTokenCount(ct.cacheWrite)}</td>
              <td className={styles.numericCell}>{formatCost(cCost)}</td>
            </tr>
          );
        })}
    </>
  );
});
InteractionRows.displayName = 'InteractionRows';

/* ------------------------------------------------------------------ */
/*  TurnRows — summary + expandable detail for a single turn           */
/* ------------------------------------------------------------------ */

interface TurnRowsProps {
  readonly turn: Turn;
  readonly turnOpen: boolean;
  readonly tokens: { output: number; input: number; cacheRead: number; cacheWrite: number };
  readonly firstModel: string | null;
  readonly modelColours: Record<string, string>;
  readonly onToggle: (turnId: string) => void;
  readonly onSessionNavigate?: (sessionId: string) => void;
}

const TurnRows = memo(function TurnRows({
  turn,
  turnOpen,
  tokens,
  firstModel,
  modelColours,
  onToggle,
  onSessionNavigate,
}: TurnRowsProps) {
  return (
    <>
      {/* Turn summary */}
      <tr
        className={styles.fanoutTurnRow}
        onClick={() => onToggle(turn.turnId)}
        aria-expanded={turnOpen}
      >
        <td>
          <span
            className={styles.fanoutCaret + (turnOpen ? ' ' + styles.fanoutCaretOpen : '')}
          >
            ▸
          </span>
        </td>
        <td>Turn #{turn.turnId}</td>
        <td>{formatTime(turn.startTs)}</td>
        <td>
          {firstModel && (
            <span className={styles.modelName ?? ''}>
              <span
                className={styles.modelDot}
                style={{ backgroundColor: modelColours[firstModel] ?? '#888' }}
              />
              {firstModel}
            </span>
          )}
        </td>
        <td className={styles.numericCell}>{turn.toolCalls.length}</td>
        <td className={styles.numericCell}>{formatTokenCount(tokens.output)}</td>
        <td className={styles.numericCell}>{tokens.input > 0 ? formatTokenCount(tokens.input) : '—'}</td>
        <td className={styles.numericCell}>{tokens.cacheRead > 0 ? formatTokenCount(tokens.cacheRead) : '—'}</td>
        <td className={styles.numericCell}>{tokens.cacheWrite > 0 ? formatTokenCount(tokens.cacheWrite) : '—'}</td>
        <td className={styles.numericCell}>{formatCost(estimateCostUsd(firstModel, tokens.output, tokens.input, tokens.cacheRead, tokens.cacheWrite))}</td>
      </tr>

      {/* Turn detail */}
      {turnOpen && (
        <tr>
          <td colSpan={10} style={{ padding: 0 }}>
            <TurnDetail turn={turn} onSessionNavigate={onSessionNavigate} />
          </td>
        </tr>
      )}
    </>
  );
});
TurnRows.displayName = 'TurnRows';

/* ------------------------------------------------------------------ */
/*  TurnDetail — expanded content for a single turn                    */
/* ------------------------------------------------------------------ */

interface TurnDetailProps {
  readonly turn: Turn;
  readonly onSessionNavigate?: (sessionId: string) => void;
}

const TurnDetail = memo(function TurnDetail({ turn, onSessionNavigate }: TurnDetailProps) {
  const hasUser = turn.userMessage !== null;
  const hasAssistant = turn.assistantMessages.length > 0;
  const firstAssistant = turn.assistantMessages[0] ?? null;
  const additionalMessages = turn.assistantMessages.slice(1);

  const panelCount = (hasUser ? 1 : 0) + (hasAssistant ? 1 : 0);
  const gridClassName =
    styles.turnPanelsGrid + (panelCount === 1 ? ' ' + styles.turnPanelSingle : '');

  return (
    <div className={styles.fanoutDetail}>
      {/* Panels grid — user prompt and/or agent response */}
      {panelCount > 0 && (
        <div className={gridClassName}>
          {hasUser && (
            <div className={styles.turnPanelUser}>
              <div className={styles.turnPanelLabel}>
                USER PROMPT · {formatTime(turn.userMessage!.timestamp)}
              </div>
              <div className={styles.turnPanelBody}>{turn.userMessage!.content}</div>
            </div>
          )}
          {firstAssistant && (
            <div className={styles.turnPanelAgent}>
              <div className={styles.turnPanelLabel}>AGENT RESPONSE</div>
              {/* Token summary for this turn */}
              {(() => {
                const tok = turnTokens(turn);
                const hasTokData = tok.output > 0 || tok.input > 0 || tok.cacheRead > 0;
                if (!hasTokData) return null;
                const parts: string[] = [];
                if (tok.output > 0) parts.push(`Out: ${formatTokenCount(tok.output)}`);
                if (tok.input > 0) parts.push(`In: ${formatTokenCount(tok.input)}`);
                if (tok.cacheRead > 0) parts.push(`Cached: ${formatTokenCount(tok.cacheRead)}`);
                return (
                  <div className={styles.turnTokenSummary}>
                    {parts.join(' · ')}
                  </div>
                );
              })()}
              {firstAssistant.reasoningText && (
                <div className={styles.reasoning}>{firstAssistant.reasoningText}</div>
              )}
              <div className={styles.turnPanelBody}>{firstAssistant.content}</div>
            </div>
          )}
        </div>
      )}

      {/* Tool nodes */}
      {turn.toolCalls.map((toolCall) => (
        <div key={toolCall.toolCallId} className={styles.toolNode}>
          <span className={styles.nodeIcon}>⚙</span>
          <div className={styles.nodeContent}>
            <div className={styles.nodeName}>{toolCall.toolName}</div>
            {toolCall.argumentsPreview && (
              <div className={styles.nodeArgs}>{toolCall.argumentsPreview}</div>
            )}
            <div className={styles.nodeMeta}>
              {toolCall.durationMs !== null && formatDuration(toolCall.durationMs)}
              {toolCall.success !== null && (
                <span
                  className={
                    toolCall.success ? styles.nodeStatusSuccess : styles.nodeStatusFailure
                  }
                >
                  {toolCall.success ? ' ✓' : ' ✗'}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Sub-agent nodes */}
      {turn.subagents.map((sub, idx) => (
        <div key={`subagent-${String(idx)}`} className={styles.subAgentNode}>
          <span className={styles.nodeIcon}>🤖</span>
          <div className={styles.nodeContent}>
            <div className={styles.nodeName}>{sub.agentName}</div>
            <div className={styles.nodeMeta}>
              {formatTokenCount(sub.totalTokens)} tokens · {sub.messageCount} msgs
              {sub.childSessionRef && onSessionNavigate && (
                <button
                  type="button"
                  className={styles.drillDownButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSessionNavigate(sub.childSessionRef!);
                  }}
                  title={`Open child session ${sub.childSessionRef}`}
                >
                  Open session ↗
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Additional assistant message nodes (beyond the first shown in panel) */}
      {additionalMessages.map((msg, idx) => (
        <div key={`msg-${String(idx)}`} className={styles.msgNode}>
          <span className={styles.nodeIcon}>✎</span>
          <div className={styles.nodeContent}>
            <div className={styles.nodeName}>assistant message</div>
            <div className={styles.nodeMeta}>
              {formatTokenCount(msg.outputTokens)} out · {formatTime(msg.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
TurnDetail.displayName = 'TurnDetail';

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

export const FanoutTimeline = memo(FanoutTimelineInner);
FanoutTimeline.displayName = 'FanoutTimeline';
