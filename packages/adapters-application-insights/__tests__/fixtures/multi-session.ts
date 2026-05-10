/**
 * Multiple sessions in one query result fixture.
 *
 * Scenario:
 * - Spans from 2 different sessions (different `copilot_chat.session.id`)
 * - Session A ('sess-multi-a'): 3 spans across trace 'trace-multi-a'
 * - Session B ('sess-multi-b'): 2 spans across trace 'trace-multi-b'
 *
 * Expected output from `groupSpansBySession()`:
 * - 2 groups: one with sessionId 'sess-multi-a' (3 spans), one with 'sess-multi-b' (2 spans)
 */

export const multiSessionRows: Record<string, unknown>[] = [
  // Session A — root
  {
    id: 'ms-a-root',
    operation_Id: 'trace-multi-a',
    operation_ParentId: null,
    name: 'session-root',
    timestamp: '2025-06-15T11:00:00.000Z',
    duration: 20000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-multi-a',
    }),
  },
  // Session A — LLM
  {
    id: 'ms-a-llm',
    operation_Id: 'trace-multi-a',
    operation_ParentId: 'ms-a-root',
    name: 'llm-call',
    timestamp: '2025-06-15T11:00:01.000Z',
    duration: 3000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-multi-a',
      'gen_ai.request.model': 'claude-4',
      'gen_ai.usage.input_tokens': '400',
      'gen_ai.usage.output_tokens': '150',
    }),
  },
  // Session A — tool
  {
    id: 'ms-a-tool',
    operation_Id: 'trace-multi-a',
    operation_ParentId: 'ms-a-llm',
    name: 'tool-call',
    timestamp: '2025-06-15T11:00:02.000Z',
    duration: 100,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-multi-a',
      'copilot_chat.tool.call.name': 'read_file',
      'copilot_chat.tool.call.id': 'tc-ms-a',
    }),
  },
  // Session B — root
  {
    id: 'ms-b-root',
    operation_Id: 'trace-multi-b',
    operation_ParentId: null,
    name: 'session-root',
    timestamp: '2025-06-15T12:00:00.000Z',
    duration: 15000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-multi-b',
    }),
  },
  // Session B — LLM
  {
    id: 'ms-b-llm',
    operation_Id: 'trace-multi-b',
    operation_ParentId: 'ms-b-root',
    name: 'llm-call',
    timestamp: '2025-06-15T12:00:01.000Z',
    duration: 2000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': 'sess-multi-b',
      'gen_ai.request.model': 'gpt-5',
      'gen_ai.usage.input_tokens': '600',
      'gen_ai.usage.output_tokens': '250',
    }),
  },
];
