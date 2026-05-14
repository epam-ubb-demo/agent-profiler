/**
 * Integration tests for table sorting & filtering.
 *
 * Verifies that useSortableData + SortableHeader and
 * useFilterableData + TableFilter work correctly when wired into
 * actual table components (ModelSpendTable, EventTypesTable,
 * ToolInventoryTable).
 */

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventTypeRow } from '../src/session-detail/event-type-stats';
import { EventTypesTable } from '../src/session-detail/EventTypesTable';
import type { ModelSpendResult } from '../src/session-detail/model-spend';
import { ModelSpendTable } from '../src/session-detail/ModelSpendTable';
import type { ToolInventoryResult } from '../src/session-detail/tool-inventory';
import { ToolInventoryTable } from '../src/session-detail/ToolInventoryTable';

import { render } from './test-utils';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MODEL_SPEND_RESULT: ModelSpendResult = {
  rows: [
    {
      model: 'claude-sonnet-4',
      requestCount: 10,
      premiumRequests: null,
      premiumRequestCostUsd: 0.50,
      inputTokens: 50_000,
      outputTokens: 20_000,
      cacheReadTokens: 10_000,
      cacheWriteTokens: 5_000,
      estimatedUsd: 0.50,
      inputCostUsd: 0,
      cacheReadCostUsd: 0,
      cacheWriteCostUsd: 0,
      outputCostUsd: 0,
    },
    {
      model: 'gpt-4o',
      requestCount: 5,
      premiumRequests: null,
      premiumRequestCostUsd: 0.30,
      inputTokens: 30_000,
      outputTokens: 10_000,
      cacheReadTokens: 5_000,
      cacheWriteTokens: 2_000,
      estimatedUsd: 0.30,
      inputCostUsd: 0,
      cacheReadCostUsd: 0,
      cacheWriteCostUsd: 0,
      outputCostUsd: 0,
    },
    {
      model: 'claude-haiku-3',
      requestCount: 20,
      premiumRequests: null,
      premiumRequestCostUsd: 0.10,
      inputTokens: 100_000,
      outputTokens: 40_000,
      cacheReadTokens: 30_000,
      cacheWriteTokens: 10_000,
      estimatedUsd: 0.10,
      inputCostUsd: 0,
      cacheReadCostUsd: 0,
      cacheWriteCostUsd: 0,
      outputCostUsd: 0,
    },
  ],
  totals: {
    requestCount: 35,
    premiumRequests: 0,
    premiumRequestCostUsd: 0.90,
    inputTokens: 180_000,
    outputTokens: 70_000,
    cacheReadTokens: 45_000,
    cacheWriteTokens: 17_000,
    estimatedUsd: 0.90,
    inputCostUsd: 0,
    cacheReadCostUsd: 0,
    cacheWriteCostUsd: 0,
    outputCostUsd: 0,
  },
  confidence: 'known',
  source: 'shutdown',
};

const MODEL_COLOURS: Record<string, string> = {
  'claude-sonnet-4': '#ff0000',
  'gpt-4o': '#00ff00',
  'claude-haiku-3': '#0000ff',
};

const EVENT_TYPE_ROWS: readonly EventTypeRow[] = [
  { type: 'Tool calls', count: 42 },
  { type: 'Assistant messages', count: 15 },
  { type: 'User messages', count: 8 },
  { type: 'Compactions', count: 3 },
];

const TOOL_INVENTORY_RESULT: ToolInventoryResult = {
  categories: [
    {
      category: 'Built-in CLI',
      tools: [
        { toolName: 'bash', callCount: 20, successCount: 18, failureCount: 2, unknownCount: 0, avgDurationMs: 500, totalDurationMs: 10_000 },
        { toolName: 'edit', callCount: 10, successCount: 10, failureCount: 0, unknownCount: 0, avgDurationMs: 100, totalDurationMs: 1_000 },
      ],
      toolCount: 2,
      totalCalls: 30,
      successRate: 0.93,
      avgDurationMs: 367,
    },
    {
      category: 'GitHub',
      tools: [
        { toolName: 'github-create_pull_request', callCount: 3, successCount: 3, failureCount: 0, unknownCount: 0, avgDurationMs: 2000, totalDurationMs: 6_000 },
      ],
      toolCount: 1,
      totalCalls: 3,
      successRate: 1,
      avgDurationMs: 2000,
    },
    {
      category: 'Playwright Browser',
      tools: [
        { toolName: 'playwright-mcp-browser_click', callCount: 5, successCount: 5, failureCount: 0, unknownCount: 0, avgDurationMs: 300, totalDurationMs: 1_500 },
      ],
      toolCount: 1,
      totalCalls: 5,
      successRate: 1,
      avgDurationMs: 300,
    },
  ],
  totalTools: 4,
  totalCalls: 38,
  toolDefinitionsTokens: 12_000,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Get text content of each data row's first cell (model name / type / category). */
function getDataRowTexts(tableEl: HTMLElement, cellIndex = 0): string[] {
  const tbody = tableEl.querySelector('tbody');
  if (!tbody) return [];
  const rows = tbody.querySelectorAll('tr');
  return Array.from(rows).map(
    (row) => row.querySelectorAll('td')[cellIndex]?.textContent?.trim() ?? '',
  );
}

/** Change a filter input and advance fake timers past the 150ms debounce. */
function changeFilter(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Flush pending debounce timers before React cleanup
  act(() => {
    vi.runAllTimers();
  });
  cleanup();
  vi.useRealTimers();
});

/* ================================================================== */
/*  GROUP 1: ModelSpendTable sorting                                   */
/* ================================================================== */

describe('ModelSpendTable — sorting', () => {
  function renderTable() {
    render(<ModelSpendTable result={MODEL_SPEND_RESULT} modelColours={MODEL_COLOURS} />);
    return screen.getByRole('grid');
  }

  function getModelSortBtn(table: HTMLElement) {
    return within(table).getByRole('button', { name: /^Model/ });
  }

  it('renders rows sorted by estimatedUsd descending by default', () => {
    const table = renderTable();
    const names = getDataRowTexts(table);
    expect(names).toEqual(['claude-sonnet-4', 'gpt-4o', 'claude-haiku-3']);
  });

  it('clicking "Model" header sorts alphabetically ascending', () => {
    const table = renderTable();
    fireEvent.click(getModelSortBtn(table));

    const names = getDataRowTexts(table);
    expect(names).toEqual(['claude-haiku-3', 'claude-sonnet-4', 'gpt-4o']);
  });

  it('clicking "Model" header again sorts descending', () => {
    const table = renderTable();
    const btn = getModelSortBtn(table);
    fireEvent.click(btn); // asc
    fireEvent.click(btn); // desc

    const names = getDataRowTexts(table);
    expect(names).toEqual(['gpt-4o', 'claude-sonnet-4', 'claude-haiku-3']);
  });

  it('clicking "Model" header a third time resets to default sort', () => {
    const table = renderTable();
    const btn = getModelSortBtn(table);
    fireEvent.click(btn); // asc
    fireEvent.click(btn); // desc
    fireEvent.click(btn); // reset → no sort, original prop order

    const names = getDataRowTexts(table);
    // Reset = no sort applied → prop order (already sorted by estimatedUsd desc)
    expect(names).toEqual(['claude-sonnet-4', 'gpt-4o', 'claude-haiku-3']);
  });

  it('sort indicator shows ▼ for active desc column and ▲ for active asc', () => {
    const table = renderTable();

    // Default: estimatedUsd desc
    const estHeader = within(table).getByRole('columnheader', { name: /Token USD/i });
    expect(estHeader).toHaveAttribute('aria-sort', 'descending');
    expect(estHeader.textContent).toContain('▼');

    // Click Model → asc
    fireEvent.click(getModelSortBtn(table));

    const modelHeader = within(table).getByRole('columnheader', { name: /^Model/ });
    expect(modelHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(modelHeader.textContent).toContain('▲');
  });
});

/* ================================================================== */
/*  GROUP 2: ModelSpendTable filtering                                 */
/* ================================================================== */

describe('ModelSpendTable — filtering', () => {
  function renderTable() {
    render(<ModelSpendTable result={MODEL_SPEND_RESULT} modelColours={MODEL_COLOURS} />);
    return screen.getByRole('grid');
  }

  function getFilter() {
    return screen.getByPlaceholderText(/Filter models/);
  }

  it('filter input is present with expected placeholder', () => {
    renderTable();
    const filter = getFilter();
    expect(filter).toBeInTheDocument();
  });

  it('typing a model name shows only matching rows', () => {
    const table = renderTable();
    changeFilter(getFilter(), 'claude');

    const names = getDataRowTexts(table);
    expect(names).toHaveLength(2);
    expect(names).toContain('claude-sonnet-4');
    expect(names).toContain('claude-haiku-3');
    expect(names).not.toContain('gpt-4o');
  });

  it('filtering is case-insensitive', () => {
    const table = renderTable();
    changeFilter(getFilter(), 'GPT');

    const names = getDataRowTexts(table);
    expect(names).toEqual(['gpt-4o']);
  });

  it('clearing filter restores all rows', () => {
    const table = renderTable();
    const filter = getFilter();
    changeFilter(filter, 'claude');
    changeFilter(filter, '');

    const names = getDataRowTexts(table);
    expect(names).toHaveLength(3);
  });

  it('totals in tfoot remain unchanged regardless of filter', () => {
    const table = renderTable();

    // Capture original footer text
    const tfoot = table.querySelector('tfoot')!;
    const originalFooterText = tfoot.textContent;

    // Apply filter
    changeFilter(getFilter(), 'claude');

    // Footer totals should remain unchanged (totals come from props, not filtered data)
    const newFooterText = table.querySelector('tfoot')!.textContent;
    expect(newFooterText).toBe(originalFooterText);
  });
});

/* ================================================================== */
/*  GROUP 3: EventTypesTable (simplest table)                          */
/* ================================================================== */

describe('EventTypesTable — sort & filter', () => {
  function renderTable() {
    render(<EventTypesTable rows={EVENT_TYPE_ROWS} />);
    return screen.getByRole('grid');
  }

  function getFilter() {
    return screen.getByPlaceholderText(/Filter types/);
  }

  it('renders rows sorted by count descending by default', () => {
    const table = renderTable();
    const types = getDataRowTexts(table);
    expect(types).toEqual(['Tool calls', 'Assistant messages', 'User messages', 'Compactions']);
  });

  it('filter narrows to matching type names', () => {
    const table = renderTable();
    changeFilter(getFilter(), 'message');

    const types = getDataRowTexts(table);
    expect(types).toHaveLength(2);
    expect(types).toContain('Assistant messages');
    expect(types).toContain('User messages');
  });

  it('sort + filter work together', () => {
    const table = renderTable();

    // Filter to messages
    changeFilter(getFilter(), 'message');

    // Sort by type ascending
    const typeBtn = within(table).getByRole('button', { name: /Type/ });
    fireEvent.click(typeBtn);

    const types = getDataRowTexts(table);
    // Alphabetical ascending among filtered results
    expect(types).toEqual(['Assistant messages', 'User messages']);
  });
});

/* ================================================================== */
/*  GROUP 4: ToolInventoryTable (expandable)                           */
/* ================================================================== */

describe('ToolInventoryTable — sort, filter & expand', () => {
  function renderTable() {
    render(<ToolInventoryTable result={TOOL_INVENTORY_RESULT} />);
    return screen.getByTestId('tool-inventory');
  }

  function getFilter() {
    return screen.getByPlaceholderText(/Filter categories/);
  }

  it('filter narrows visible categories', () => {
    const table = renderTable();
    changeFilter(getFilter(), 'GitHub');

    const categories = getDataRowTexts(table, 1); // category is in 2nd cell (index 1)
    expect(categories).toEqual(['GitHub']);
  });

  it('sorting applies to categories by totalCalls', () => {
    const table = renderTable();

    // Default sort is totalCalls desc: Built-in CLI (30), Playwright (5), GitHub (3)
    const categoriesBefore = getDataRowTexts(table, 1);
    expect(categoriesBefore).toEqual(['Built-in CLI', 'Playwright Browser', 'GitHub']);

    // Click Category header to sort alphabetically ascending
    const catBtn = within(table).getByRole('button', { name: /Category/i });
    fireEvent.click(catBtn);

    const categoriesAfter = getDataRowTexts(table, 1);
    expect(categoriesAfter).toEqual(['Built-in CLI', 'GitHub', 'Playwright Browser']);
  });

  it('expand/collapse still works after sort/filter applied', () => {
    const table = renderTable();

    // Filter to Built-in CLI
    changeFilter(getFilter(), 'Built-in');

    // Expand Built-in CLI
    const expandBtn = within(table).getByRole('button', { name: /Expand Built-in CLI/i });
    fireEvent.click(expandBtn);

    // Should now show individual tools within the category
    const tbody = table.querySelector('tbody')!;
    const allRows = tbody.querySelectorAll('tr');

    // 1 category row + 2 tool rows
    expect(allRows.length).toBe(3);

    // Check tool names are visible
    expect(tbody.textContent).toContain('bash');
    expect(tbody.textContent).toContain('edit');

    // Collapse again
    const collapseBtn = within(table).getByRole('button', { name: /Collapse Built-in CLI/i });
    fireEvent.click(collapseBtn);

    const rowsAfterCollapse = tbody.querySelectorAll('tr');
    expect(rowsAfterCollapse.length).toBe(1);
  });
});
