/**
 * Bare minimum valid session fixture.
 *
 * Scenario:
 * - Single root span (no children)
 * - No `copilot_chat.session.id` — falls back to `traceId` (operation_Id)
 * - No `copilot_chat.turn.id`
 * - One LLM span as root with token counts
 *
 * Expected output:
 * - `sessionId` = traceId ('minimal-trace-001')
 * - 1 turn (synthesised as 'turn-0')
 * - `selectedModel` = 'claude-4'
 * - `parseStatus` = 'ok'
 * - No model changes
 */

export const minimalSessionRows: Record<string, unknown>[] = [
  {
    id: 'min-span-001',
    operation_Id: 'minimal-trace-001',
    operation_ParentId: null,
    name: 'llm-call',
    timestamp: '2025-06-15T09:00:00.000Z',
    duration: 2000,
    success: true,
    customDimensions: JSON.stringify({
      'gen_ai.request.model': 'claude-4',
      'gen_ai.response.model': 'claude-4',
      'gen_ai.usage.input_tokens': '500',
      'gen_ai.usage.output_tokens': '200',
    }),
  },
];
