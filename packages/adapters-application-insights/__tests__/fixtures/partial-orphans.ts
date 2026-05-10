/**
 * Session with orphan spans (spike §6.1).
 *
 * Scenario:
 * - 5 spans total
 * - 3 spans have `parentSpanId` pointing to spans NOT in the set
 * - Orphan ratio = 3/5 = 60% (> 50% threshold)
 *
 * Expected output:
 * - `parseStatus` = { status: 'partial', error: 'High orphan ratio: 3/5 …' }
 * - Orphaned spans are promoted to root nodes in the tree
 */

export const partialOrphanRows: Record<string, unknown>[] = [
  // Root span (has no parent — not an orphan)
  {
    id: 'orp-root',
    operation_Id: 'orphan-trace-001',
    operation_ParentId: null,
    name: 'session-root',
    timestamp: '2025-06-15T08:00:00.000Z',
    duration: 30000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-orphan-001',
    }),
  },
  // Child of root (not an orphan)
  {
    id: 'orp-child-ok',
    operation_Id: 'orphan-trace-001',
    operation_ParentId: 'orp-root',
    name: 'llm-call',
    timestamp: '2025-06-15T08:00:01.000Z',
    duration: 1000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-orphan-001',
      'gen_ai.request.model': 'claude-4',
      'gen_ai.usage.input_tokens': '100',
      'gen_ai.usage.output_tokens': '50',
    }),
  },
  // Orphan 1 — parent span not in the set
  {
    id: 'orp-orphan-1',
    operation_Id: 'orphan-trace-001',
    operation_ParentId: 'missing-parent-aaa',
    name: 'orphan-tool-1',
    timestamp: '2025-06-15T08:00:02.000Z',
    duration: 200,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-orphan-001',
      'copilot_chat.tool.call.name': 'read_file',
      'copilot_chat.tool.call.id': 'tc-orp-1',
    }),
  },
  // Orphan 2 — parent span not in the set
  {
    id: 'orp-orphan-2',
    operation_Id: 'orphan-trace-001',
    operation_ParentId: 'missing-parent-bbb',
    name: 'orphan-llm-2',
    timestamp: '2025-06-15T08:00:03.000Z',
    duration: 500,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-orphan-001',
      'gen_ai.request.model': 'claude-4',
      'gen_ai.usage.input_tokens': '200',
      'gen_ai.usage.output_tokens': '80',
    }),
  },
  // Orphan 3 — parent span not in the set
  {
    id: 'orp-orphan-3',
    operation_Id: 'orphan-trace-001',
    operation_ParentId: 'missing-parent-ccc',
    name: 'orphan-tool-3',
    timestamp: '2025-06-15T08:00:04.000Z',
    duration: 150,
    success: false,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-orphan-001',
      'copilot_chat.tool.call.name': 'bash',
      'copilot_chat.tool.call.id': 'tc-orp-3',
    }),
  },
];
