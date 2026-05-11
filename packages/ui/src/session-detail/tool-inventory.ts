/**
 * Pure-function utilities for computing per-category tool usage statistics
 * from a Session's observed tool calls.
 *
 * Note: this operates on *tools actually called* during the session, not
 * tool definitions loaded into the context window. Per-tool definition
 * data is not available in the current data model.
 */

import type { Session, ToolCall } from '@agent-profiler/core';

/* ------------------------------------------------------------------ */
/*  Public interfaces                                                  */
/* ------------------------------------------------------------------ */

/** Per-tool row within a category group. */
export interface ToolUsageRow {
  readonly toolName: string;
  readonly callCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly unknownCount: number;
  readonly avgDurationMs: number | null;
  readonly totalDurationMs: number;
}

/** Aggregated category row. */
export interface ToolCategoryRow {
  readonly category: string;
  readonly tools: readonly ToolUsageRow[];
  readonly toolCount: number;
  readonly totalCalls: number;
  readonly successRate: number | null;
  readonly avgDurationMs: number | null;
}

/** Result returned by {@link computeToolInventory}. */
export interface ToolInventoryResult {
  readonly categories: readonly ToolCategoryRow[];
  readonly totalTools: number;
  readonly totalCalls: number;
  /** Session-level tool-definitions token budget (from shutdown metrics). */
  readonly toolDefinitionsTokens: number | null;
}

/* ------------------------------------------------------------------ */
/*  Category rules                                                     */
/* ------------------------------------------------------------------ */

/** Exact-match set for built-in CLI tools. */
const BUILT_IN_TOOLS = new Set([
  'bash',
  'view',
  'edit',
  'create',
  'grep',
  'glob',
  'write_bash',
  'read_bash',
  'stop_bash',
  'list_bash',
  'store_memory',
  'report_intent',
  'show_file',
  'fetch_copilot_cli_documentation',
  'skill',
  'ask_user',
  'sql',
  'task_complete',
  'read_agent',
  'list_agents',
  'write_agent',
  'web_fetch',
  'web_search',
  'task',
  'extensions_reload',
  'extensions_manage',
  'apply_patch',
  'insert_edit_into_file',
  'replace_string_in_file',
  'multi_tool_use.parallel',
]);

/** Ordered prefix rules — first match wins. */
const PREFIX_RULES: readonly { readonly prefix: string; readonly category: string }[] = [
  { prefix: 'playwright-mcp-', category: 'Playwright Browser' },
  { prefix: 'github-mcp-server-', category: 'GitHub (MCP)' },
  { prefix: 'github-actions_', category: 'GitHub Actions' },
  { prefix: 'github-actions', category: 'GitHub Actions' },
  { prefix: 'github-', category: 'GitHub' },
  { prefix: 'presales-', category: 'EPAM Presales' },
  { prefix: 'microsoft-learn-', category: 'Microsoft Learn' },
  { prefix: 'workiq-', category: 'WorkIQ' },
];

/**
 * Categorise a tool name into a human-readable group.
 *
 * Exported for independent testing.
 */
export function categoriseToolName(toolName: string): string {
  if (BUILT_IN_TOOLS.has(toolName)) return 'Built-in CLI';

  for (const rule of PREFIX_RULES) {
    if (toolName.startsWith(rule.prefix)) return rule.category;
  }

  return 'Other';
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Mutable accumulator for a single tool. */
interface ToolAccumulator {
  callCount: number;
  successCount: number;
  failureCount: number;
  unknownCount: number;
  totalDurationMs: number;
  durationSamples: number;
}

function emptyToolAcc(): ToolAccumulator {
  return { callCount: 0, successCount: 0, failureCount: 0, unknownCount: 0, totalDurationMs: 0, durationSamples: 0 };
}

/* ------------------------------------------------------------------ */
/*  Main computation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Computes per-category tool usage statistics from a session's observed
 * tool calls. Categories are sorted by total calls descending; tools
 * within each category are sorted by call count descending.
 */
export function computeToolInventory(session: Session): ToolInventoryResult {
  /* Phase 1 — accumulate per tool */
  const accByTool = new Map<string, ToolAccumulator>();

  const allToolCalls: readonly ToolCall[] = session.toolCalls;

  for (const tc of allToolCalls) {
    let acc = accByTool.get(tc.toolName);
    if (!acc) {
      acc = emptyToolAcc();
      accByTool.set(tc.toolName, acc);
    }
    acc.callCount += 1;

    if (tc.success === true) acc.successCount += 1;
    else if (tc.success === false) acc.failureCount += 1;
    else acc.unknownCount += 1;

    if (tc.durationMs !== null && tc.durationMs >= 0) {
      acc.totalDurationMs += tc.durationMs;
      acc.durationSamples += 1;
    }
  }

  /* Phase 2 — group by category */
  const catMap = new Map<string, ToolUsageRow[]>();

  for (const [toolName, acc] of accByTool) {
    const category = categoriseToolName(toolName);
    let list = catMap.get(category);
    if (!list) {
      list = [];
      catMap.set(category, list);
    }
    list.push({
      toolName,
      callCount: acc.callCount,
      successCount: acc.successCount,
      failureCount: acc.failureCount,
      unknownCount: acc.unknownCount,
      avgDurationMs: acc.durationSamples > 0 ? Math.round(acc.totalDurationMs / acc.durationSamples) : null,
      totalDurationMs: Math.round(acc.totalDurationMs),
    });
  }

  /* Phase 3 — build sorted category rows */
  const categories: ToolCategoryRow[] = [];

  for (const [category, tools] of catMap) {
    tools.sort((a, b) => b.callCount - a.callCount);

    const totalCalls = tools.reduce((sum, t) => sum + t.callCount, 0);
    const totalSuccess = tools.reduce((sum, t) => sum + t.successCount, 0);
    const totalKnown = tools.reduce((sum, t) => sum + t.successCount + t.failureCount, 0);
    const totalDuration = tools.reduce((sum, t) => sum + t.totalDurationMs, 0);
    const durationSamples = tools.reduce(
      (sum, t) => sum + (t.avgDurationMs !== null ? t.callCount : 0),
      0,
    );

    categories.push({
      category,
      tools,
      toolCount: tools.length,
      totalCalls,
      successRate: totalKnown > 0 ? totalSuccess / totalKnown : null,
      avgDurationMs: durationSamples > 0 ? Math.round(totalDuration / durationSamples) : null,
    });
  }

  categories.sort((a, b) => b.totalCalls - a.totalCalls);

  const totalTools = accByTool.size;
  const totalCalls = allToolCalls.length;
  const toolDefinitionsTokens = session.shutdown?.toolDefinitionsTokens ?? null;

  return { categories, totalTools, totalCalls, toolDefinitionsTokens };
}
