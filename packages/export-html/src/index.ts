/**
 * @agent-profiler/export-html — public API.
 *
 * Exports standalone HTML reports from session and bench-run data.
 * Never throws — returns error HTML on failure.
 */

import type { BenchRunAggregation, Session } from '@agent-profiler/core';

import { renderBenchRun } from './renderers/benchrun-renderer';
import { renderSession } from './renderers/session-renderer';
import { escapeHtml, renderBaseTemplate } from './templates/base';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ExportOptions {
  title?: string | undefined;
  includeStyles?: boolean | undefined;
  includeInteractivity?: boolean | undefined;
  theme?: 'light' | 'dark' | undefined;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

interface ResolvedOptions {
  readonly title: string;
  readonly includeStyles: boolean;
  readonly includeInteractivity: boolean;
  readonly theme: 'light' | 'dark';
}

function resolveOptions(options?: ExportOptions): ResolvedOptions {
  return {
    title: options?.title ?? 'Agent Profiler Report',
    includeStyles: options?.includeStyles ?? true,
    includeInteractivity: options?.includeInteractivity ?? true,
    theme: options?.theme ?? 'light',
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Export a single session as a standalone HTML report.
 */
export function exportSessionToHtml(session: Session, options?: ExportOptions): string {
  const resolved = resolveOptions(options);

  try {
    const title = resolved.title !== 'Agent Profiler Report'
      ? resolved.title
      : `Session Report — ${session.sessionId || 'Unknown'}`;

    const bodyContent = `<h1>${escapeHtml(title)}</h1>\n${renderSession(session)}`;

    return renderBaseTemplate({
      title,
      bodyContent,
      theme: resolved.theme,
      includeStyles: resolved.includeStyles,
      includeInteractivity: resolved.includeInteractivity,
    });
  } catch {
    return renderErrorHtml('Failed to render session report', resolved);
  }
}

/**
 * Export a multi-session bench run as a standalone HTML report.
 */
export function exportBenchRunToHtml(
  aggregation: BenchRunAggregation,
  sessions: Session[],
  options?: ExportOptions
): string {
  const resolved = resolveOptions(options);

  try {
    const title = resolved.title !== 'Agent Profiler Report'
      ? resolved.title
      : 'Bench Run Report';

    const bodyContent = `<h1>${escapeHtml(title)}</h1>\n${renderBenchRun(aggregation, sessions)}`;

    return renderBaseTemplate({
      title,
      bodyContent,
      theme: resolved.theme,
      includeStyles: resolved.includeStyles,
      includeInteractivity: resolved.includeInteractivity,
    });
  } catch {
    return renderErrorHtml('Failed to render bench run report', resolved);
  }
}

// ─── Error fallback ──────────────────────────────────────────────────────────

function renderErrorHtml(message: string, options: ResolvedOptions): string {
  const bodyContent = `
<div class="card">
  <div class="card-header" style="color:var(--failure);">Error</div>
  <p>${escapeHtml(message)}</p>
</div>`;

  return renderBaseTemplate({
    title: 'Error — Agent Profiler',
    bodyContent,
    theme: options.theme,
    includeStyles: options.includeStyles,
    includeInteractivity: options.includeInteractivity,
  });
}
