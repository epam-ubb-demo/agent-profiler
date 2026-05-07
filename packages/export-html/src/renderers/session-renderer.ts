/**
 * Session renderer — produces HTML body content for a single session report.
 *
 * Renders:
 * - Session metadata header
 * - Timeline SVG
 * - Turn list (collapsible)
 * - Tool call summary table
 * - Token usage chart
 */

import type { Session } from '@agent-profiler/core';

import { escapeHtml } from '../templates/base';

export function renderSession(session: Session): string {
  const parts: string[] = [];

  parts.push(renderMetadataHeader(session));
  parts.push(renderTimeline(session));
  parts.push(renderTokenUsageChart(session));
  parts.push(renderToolCallTable(session));
  parts.push(renderTurnList(session));

  return parts.join('\n');
}

// ─── Metadata Header ─────────────────────────────────────────────────────────

function renderMetadataHeader(session: Session): string {
  const durationMs = computeDurationMs(session.startTs, session.endTs);
  const durationStr = durationMs !== null ? formatDuration(durationMs) : 'N/A';
  const totalTokens = computeTotalTokens(session);

  return `
<div class="meta-grid">
  <div class="meta-item">
    <div class="meta-label">Session ID</div>
    <div class="meta-value">${escapeHtml(session.sessionId || 'Unknown')}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Model</div>
    <div class="meta-value">${escapeHtml(session.selectedModel || 'Unknown')}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Duration</div>
    <div class="meta-value">${escapeHtml(durationStr)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Turns</div>
    <div class="meta-value">${session.turns.length}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Tool Calls</div>
    <div class="meta-value">${session.toolCalls.length}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Total Tokens</div>
    <div class="meta-value">${formatNumber(totalTokens)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Repository</div>
    <div class="meta-value">${escapeHtml(session.repository || 'N/A')}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Status</div>
    <div class="meta-value"><span class="badge ${session.success === true ? 'badge-success' : session.success === false ? 'badge-failure' : 'badge-neutral'}">${session.success === true ? 'Success' : session.success === false ? 'Failed' : 'Unknown'}</span></div>
  </div>
</div>`;
}

// ─── Timeline SVG ────────────────────────────────────────────────────────────

function renderTimeline(session: Session): string {
  if (session.turns.length === 0) {
    return '<div class="card"><div class="card-header">Timeline</div><p>No turns recorded.</p></div>';
  }

  const sessionStart = session.startTs ? new Date(session.startTs).getTime() : null;
  const sessionEnd = session.endTs ? new Date(session.endTs).getTime() : null;

  if (sessionStart === null || sessionEnd === null || sessionEnd <= sessionStart) {
    return '<div class="card"><div class="card-header">Timeline</div><p>Insufficient timing data.</p></div>';
  }

  const totalMs = sessionEnd - sessionStart;
  const svgWidth = 900;
  const barHeight = 18;
  const laneGap = 4;
  const labelWidth = 60;
  const chartWidth = svgWidth - labelWidth;

  const bars: string[] = [];
  let laneIndex = 0;

  for (const turn of session.turns) {
    const turnStart = turn.startTs ? new Date(turn.startTs).getTime() : null;
    const turnEnd = turn.endTs ? new Date(turn.endTs).getTime() : null;

    if (turnStart === null || turnEnd === null) {
      laneIndex++;
      continue;
    }

    const x = labelWidth + ((turnStart - sessionStart) / totalMs) * chartWidth;
    const width = Math.max(2, ((turnEnd - turnStart) / totalMs) * chartWidth);
    const y = laneIndex * (barHeight + laneGap) + 20;

    bars.push(
      `<rect class="timeline-bar timeline-bar-tool" x="${x}" y="${y}" width="${width}" height="${barHeight}" />` +
        `<text class="timeline-label" x="4" y="${y + 13}">T${laneIndex + 1}</text>`
    );
    laneIndex++;
  }

  const svgHeight = laneIndex * (barHeight + laneGap) + 30;

  // Time ticks
  const tickCount = 5;
  const ticks: string[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const frac = i / tickCount;
    const x = labelWidth + frac * chartWidth;
    const timeLabel = formatDuration(frac * totalMs);
    ticks.push(
      `<line class="timeline-tick" x1="${x}" y1="0" x2="${x}" y2="${svgHeight}" />` +
        `<text class="timeline-label" x="${x}" y="${svgHeight + 12}" text-anchor="middle">${escapeHtml(timeLabel)}</text>`
    );
  }

  return `
<h2>Timeline</h2>
<div class="timeline-container">
  <svg viewBox="0 0 ${svgWidth} ${svgHeight + 20}" xmlns="http://www.w3.org/2000/svg">
    ${ticks.join('\n    ')}
    ${bars.join('\n    ')}
  </svg>
</div>`;
}

// ─── Token Usage Chart ───────────────────────────────────────────────────────

function renderTokenUsageChart(session: Session): string {
  if (session.assistantMessages.length === 0) {
    return '';
  }

  const maxTokens = Math.max(
    ...session.assistantMessages.map((m) => m.inputTokens + m.outputTokens),
    1
  );

  const bars = session.assistantMessages.slice(0, 30).map((msg, i) => {
    const total = msg.inputTokens + msg.outputTokens;
    const pct = (total / maxTokens) * 100;
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
      <div class="bar" style="height:${pct}%" title="Input: ${msg.inputTokens}, Output: ${msg.outputTokens}"></div>
      <div class="bar-label">${i + 1}</div>
    </div>`;
  });

  return `
<h2>Token Usage</h2>
<div class="card">
  <div class="bar-chart">
    ${bars.join('\n    ')}
  </div>
  <p style="color:var(--text-muted);font-size:0.8rem;">Bar height = total tokens per assistant message (showing up to 30)</p>
</div>`;
}

// ─── Tool Call Summary Table ─────────────────────────────────────────────────

function renderToolCallTable(session: Session): string {
  if (session.toolCalls.length === 0) {
    return '<h2>Tool Calls</h2><p>No tool calls recorded.</p>';
  }

  // Aggregate by tool name
  const toolMap = new Map<string, { count: number; totalMs: number; success: number; failure: number }>();
  for (const tc of session.toolCalls) {
    const name = tc.toolName || 'unknown';
    const entry = toolMap.get(name) ?? { count: 0, totalMs: 0, success: 0, failure: 0 };
    entry.count++;
    if (tc.durationMs !== null) entry.totalMs += tc.durationMs;
    if (tc.success === true) entry.success++;
    if (tc.success === false) entry.failure++;
    toolMap.set(name, entry);
  }

  const rows = Array.from(toolMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([name, data]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${data.count}</td><td>${formatDuration(data.totalMs)}</td><td>${data.success}</td><td>${data.failure}</td></tr>`
    )
    .join('\n');

  return `
<h2>Tool Calls</h2>
<table data-sortable>
  <thead><tr><th>Tool</th><th>Count</th><th>Total Duration</th><th>Success</th><th>Failure</th></tr></thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

// ─── Turn List ───────────────────────────────────────────────────────────────

function renderTurnList(session: Session): string {
  if (session.turns.length === 0) {
    return '<h2>Turns</h2><p>No turns recorded.</p>';
  }

  const items = session.turns.map((turn, i) => {
    const userContent = turn.userMessage?.content
      ? escapeHtml(turn.userMessage.content.slice(0, 200)) +
        (turn.userMessage.content.length > 200 ? '…' : '')
      : '<em>No user message</em>';

    const assistantCount = turn.assistantMessages.length;
    const toolCount = turn.toolCalls.length;

    return `
<details>
  <summary>Turn ${i + 1} — ${toolCount} tool call${toolCount !== 1 ? 's' : ''}, ${assistantCount} response${assistantCount !== 1 ? 's' : ''}</summary>
  <div class="detail-content">
    <p><strong>User:</strong> ${userContent}</p>
    ${toolCount > 0 ? `<p><strong>Tools:</strong> ${turn.toolCalls.map((tc) => escapeHtml(tc.toolName)).join(', ')}</p>` : ''}
  </div>
</details>`;
  });

  return `
<h2>Turns</h2>
<button data-toggle-all="#turns-section">Collapse All</button>
<div id="turns-section">
  ${items.join('\n')}
</div>`;
}

// ─── Utility functions ───────────────────────────────────────────────────────

function computeDurationMs(startTs: string | null, endTs: string | null): number | null {
  if (!startTs || !endTs) return null;
  const start = new Date(startTs).getTime();
  const end = new Date(endTs).getTime();
  if (isNaN(start) || isNaN(end)) return null;
  return end - start;
}

function computeTotalTokens(session: Session): number {
  let total = 0;
  for (const msg of session.assistantMessages) {
    total += msg.inputTokens + msg.outputTokens;
  }
  return total;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
