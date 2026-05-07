/**
 * Bench-run renderer — produces HTML body content for a multi-session report.
 *
 * Renders:
 * - Summary header (name, total cost, variants, sessions)
 * - Session comparison table
 * - Per-model breakdown table
 * - Per-tool matrix
 * - Embedded per-session details (collapsible)
 */

import type { BenchRunAggregation, Session } from '@agent-profiler/core';

import { escapeHtml } from '../templates/base';

import { renderSession } from './session-renderer';

export function renderBenchRun(
  aggregation: BenchRunAggregation,
  sessions: readonly Session[]
): string {
  const parts: string[] = [];

  parts.push(renderSummaryHeader(aggregation));
  parts.push(renderSessionComparisonTable(aggregation));
  parts.push(renderModelBreakdownTable(aggregation));
  parts.push(renderToolMatrix(aggregation));
  parts.push(renderEmbeddedSessions(sessions));

  return parts.join('\n');
}

// ─── Summary Header ──────────────────────────────────────────────────────────

function renderSummaryHeader(aggregation: BenchRunAggregation): string {
  const costStr =
    aggregation.totalCost !== null ? `$${aggregation.totalCost.toFixed(4)}` : 'N/A';

  return `
<div class="meta-grid">
  <div class="meta-item">
    <div class="meta-label">Sessions</div>
    <div class="meta-value">${aggregation.sessionCount}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Variants</div>
    <div class="meta-value">${aggregation.variantCount}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Total Cost</div>
    <div class="meta-value">${escapeHtml(costStr)}</div>
  </div>
  <div class="meta-item">
    <div class="meta-label">Total Wall Time</div>
    <div class="meta-value">${escapeHtml(formatDuration(aggregation.totalWallTimeMs))}</div>
  </div>
</div>`;
}

// ─── Session Comparison Table ────────────────────────────────────────────────

function renderSessionComparisonTable(aggregation: BenchRunAggregation): string {
  if (aggregation.sessions.length === 0) {
    return '<h2>Session Comparison</h2><p>No sessions to compare.</p>';
  }

  const rows = aggregation.sessions
    .map(
      (s) =>
        `<tr>
      <td>${escapeHtml(s.label || s.sessionId)}</td>
      <td>${escapeHtml(formatDuration(s.wallTimeMs))}</td>
      <td>${formatNumber(s.totalInputTokens)}</td>
      <td>${formatNumber(s.totalOutputTokens)}</td>
      <td>${s.totalCost !== null ? '$' + s.totalCost.toFixed(4) : 'N/A'}</td>
      <td>${s.turnCount}</td>
      <td>${s.toolCallCount}</td>
      <td>${escapeHtml(s.models.join(', '))}</td>
      <td><span class="badge ${s.parseStatus === 'ok' ? 'badge-success' : s.parseStatus === 'failed' ? 'badge-failure' : 'badge-neutral'}">${escapeHtml(s.parseStatus)}</span></td>
    </tr>`
    )
    .join('\n');

  return `
<h2>Session Comparison</h2>
<table data-sortable>
  <thead>
    <tr><th>Session</th><th>Wall Time</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost</th><th>Turns</th><th>Tool Calls</th><th>Models</th><th>Status</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

// ─── Model Breakdown Table ───────────────────────────────────────────────────

function renderModelBreakdownTable(aggregation: BenchRunAggregation): string {
  if (aggregation.modelUsage.length === 0) {
    return '<h2>Model Breakdown</h2><p>No model data available.</p>';
  }

  const rows = aggregation.modelUsage
    .map(
      (m) =>
        `<tr>
      <td>${escapeHtml(m.model)}</td>
      <td>${formatNumber(m.totalInputTokens)}</td>
      <td>${formatNumber(m.totalOutputTokens)}</td>
      <td>${formatNumber(m.totalCacheReadTokens)}</td>
      <td>${formatNumber(m.totalCacheWriteTokens)}</td>
      <td>${m.totalCost !== null ? '$' + m.totalCost.toFixed(4) : 'N/A'}</td>
      <td>${m.sessionCount}</td>
    </tr>`
    )
    .join('\n');

  return `
<h2>Model Breakdown</h2>
<table data-sortable>
  <thead>
    <tr><th>Model</th><th>Input Tokens</th><th>Output Tokens</th><th>Cache Read</th><th>Cache Write</th><th>Cost</th><th>Sessions</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

// ─── Tool Matrix ─────────────────────────────────────────────────────────────

function renderToolMatrix(aggregation: BenchRunAggregation): string {
  if (aggregation.toolUsage.length === 0) {
    return '<h2>Tool Usage</h2><p>No tool usage data available.</p>';
  }

  const rows = [...aggregation.toolUsage]
    .sort((a, b) => b.callCount - a.callCount)
    .map(
      (t) =>
        `<tr>
      <td>${escapeHtml(t.toolName)}</td>
      <td>${t.callCount}</td>
      <td>${escapeHtml(formatDuration(t.totalDurationMs))}</td>
      <td>${t.successCount}</td>
      <td>${t.failureCount}</td>
      <td>${escapeHtml(t.models.join(', '))}</td>
    </tr>`
    )
    .join('\n');

  return `
<h2>Tool Usage</h2>
<table data-sortable>
  <thead>
    <tr><th>Tool</th><th>Calls</th><th>Total Duration</th><th>Success</th><th>Failure</th><th>Models</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

// ─── Embedded Per-Session Details ────────────────────────────────────────────

function renderEmbeddedSessions(sessions: readonly Session[]): string {
  if (sessions.length === 0) return '';

  const items = sessions.map((session, i) => {
    const label = session.sessionId || `Session ${i + 1}`;
    return `
<details>
  <summary>${escapeHtml(label)}</summary>
  <div class="detail-content">
    ${renderSession(session)}
  </div>
</details>`;
  });

  return `
<h2>Session Details</h2>
<button data-toggle-all="#session-details-section">Collapse All</button>
<div id="session-details-section">
  ${items.join('\n')}
</div>`;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

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
