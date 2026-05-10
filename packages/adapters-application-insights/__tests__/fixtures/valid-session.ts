/**
 * Realistic multi-turn session fixture.
 *
 * Scenario:
 * - Root span with `copilot_chat.session.id = 'sess-valid-001'`
 * - 3 turns identified by `copilot_chat.turn.id`
 * - Turn 1: user message → LLM call (claude-4) → tool call (read_file)
 * - Turn 2: user message → LLM call (claude-4) → 2 parallel tool calls (edit, bash)
 * - Turn 3: user message → LLM call (gpt-5, model switch) → subagent with child LLM + child tool
 * - Context dims: repository, branch, cwd
 *
 * Expected output:
 * - `sessionId` = 'sess-valid-001'
 * - 3 turns (plus a `<no-turn>` bucket for the root span)
 * - `selectedModel` = 'claude-4' (first LLM span chronologically)
 * - 1 model change (claude-4 → gpt-5)
 * - 4 tool calls total (read_file, edit, bash, grep)
 * - 1 subagent invocation
 * - `parseStatus` = 'ok'
 */

const SESSION_ID = 'sess-valid-001';
const TRACE_ID = 'abc123def456';

export const validSessionRows: Record<string, unknown>[] = [
  // Root span
  {
    id: 'root-001',
    operation_Id: TRACE_ID,
    operation_ParentId: null,
    name: 'copilot-session',
    timestamp: '2025-06-15T10:00:00.000Z',
    duration: 60000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.context.repository': 'epam/agent-profiler',
      'copilot_chat.context.branch': 'main',
      'copilot_chat.context.cwd': '/home/dev/agent-profiler',
    }),
  },
  // Turn 1: user message
  {
    id: 't1-user',
    operation_Id: TRACE_ID,
    operation_ParentId: 'root-001',
    name: 'user-message',
    timestamp: '2025-06-15T10:00:01.000Z',
    duration: 5,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-001',
      'copilot_chat.message.role': 'user',
      'copilot_chat.message.content': 'Read the README and summarise it',
    }),
  },
  // Turn 1: LLM call (claude-4)
  {
    id: 't1-llm',
    operation_Id: TRACE_ID,
    operation_ParentId: 'root-001',
    name: 'llm-request',
    timestamp: '2025-06-15T10:00:02.000Z',
    duration: 3500,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-001',
      'gen_ai.request.model': 'claude-4',
      'gen_ai.response.model': 'claude-4',
      'gen_ai.usage.input_tokens': '1200',
      'gen_ai.usage.output_tokens': '350',
      'gen_ai.usage.cache_read_tokens': '800',
      'gen_ai.usage.cache_write_tokens': '200',
    }),
  },
  // Turn 1: tool call (read_file)
  {
    id: 't1-tool',
    operation_Id: TRACE_ID,
    operation_ParentId: 't1-llm',
    name: 'tool-read_file',
    timestamp: '2025-06-15T10:00:03.000Z',
    duration: 120,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-001',
      'copilot_chat.tool.call.name': 'read_file',
      'copilot_chat.tool.call.id': 'tc-001',
      'copilot_chat.tool.call.arguments': '{"path":"README.md"}',
      'copilot_chat.tool.call.success': 'true',
    }),
  },
  // Turn 2: user message
  {
    id: 't2-user',
    operation_Id: TRACE_ID,
    operation_ParentId: 'root-001',
    name: 'user-message',
    timestamp: '2025-06-15T10:00:10.000Z',
    duration: 5,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-002',
      'copilot_chat.message.role': 'user',
      'copilot_chat.message.content': 'Add a contributing section and run the linter',
    }),
  },
  // Turn 2: LLM call (claude-4)
  {
    id: 't2-llm',
    operation_Id: TRACE_ID,
    operation_ParentId: 'root-001',
    name: 'llm-request',
    timestamp: '2025-06-15T10:00:11.000Z',
    duration: 4200,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-002',
      'gen_ai.request.model': 'claude-4',
      'gen_ai.response.model': 'claude-4',
      'gen_ai.usage.input_tokens': '2500',
      'gen_ai.usage.output_tokens': '800',
    }),
  },
  // Turn 2: parallel tool call 1 (edit)
  {
    id: 't2-tool-edit',
    operation_Id: TRACE_ID,
    operation_ParentId: 't2-llm',
    name: 'tool-edit',
    timestamp: '2025-06-15T10:00:12.000Z',
    duration: 250,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-002',
      'copilot_chat.tool.call.name': 'edit',
      'copilot_chat.tool.call.id': 'tc-002',
      'copilot_chat.tool.call.arguments': '{"file":"CONTRIBUTING.md","content":"# Contributing\\n..."}',
    }),
  },
  // Turn 2: parallel tool call 2 (bash)
  {
    id: 't2-tool-bash',
    operation_Id: TRACE_ID,
    operation_ParentId: 't2-llm',
    name: 'tool-bash',
    timestamp: '2025-06-15T10:00:12.500Z',
    duration: 1800,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-002',
      'copilot_chat.tool.call.name': 'bash',
      'copilot_chat.tool.call.id': 'tc-003',
      'copilot_chat.tool.call.arguments': '{"command":"pnpm lint"}',
    }),
  },
  // Turn 3: user message
  {
    id: 't3-user',
    operation_Id: TRACE_ID,
    operation_ParentId: 'root-001',
    name: 'user-message',
    timestamp: '2025-06-15T10:00:20.000Z',
    duration: 5,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-003',
      'copilot_chat.message.role': 'user',
      'copilot_chat.message.content': 'Review the changes with a subagent',
    }),
  },
  // Turn 3: LLM call (gpt-5 — model switch)
  {
    id: 't3-llm',
    operation_Id: TRACE_ID,
    operation_ParentId: 'root-001',
    name: 'llm-request',
    timestamp: '2025-06-15T10:00:21.000Z',
    duration: 5000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-003',
      'gen_ai.request.model': 'gpt-5',
      'gen_ai.response.model': 'gpt-5',
      'gen_ai.usage.input_tokens': '3000',
      'gen_ai.usage.output_tokens': '1200',
    }),
  },
  // Turn 3: subagent invocation
  {
    id: 't3-subagent',
    operation_Id: TRACE_ID,
    operation_ParentId: 't3-llm',
    name: 'subagent-code-reviewer',
    timestamp: '2025-06-15T10:00:22.000Z',
    duration: 3000,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-003',
      'copilot_chat.subagent.name': 'code-reviewer',
      'copilot_chat.subagent.type': 'review',
    }),
  },
  // Turn 3: subagent child LLM
  {
    id: 't3-sub-llm',
    operation_Id: TRACE_ID,
    operation_ParentId: 't3-subagent',
    name: 'subagent-llm',
    timestamp: '2025-06-15T10:00:22.500Z',
    duration: 1500,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-003',
      'gen_ai.request.model': 'gpt-5',
      'gen_ai.response.model': 'gpt-5',
      'gen_ai.usage.input_tokens': '500',
      'gen_ai.usage.output_tokens': '150',
    }),
  },
  // Turn 3: subagent child tool
  {
    id: 't3-sub-tool',
    operation_Id: TRACE_ID,
    operation_ParentId: 't3-subagent',
    name: 'tool-grep',
    timestamp: '2025-06-15T10:00:24.000Z',
    duration: 80,
    success: true,
    customDimensions: JSON.stringify({
      'copilot_chat.session.id': SESSION_ID,
      'copilot_chat.turn.id': 'turn-003',
      'copilot_chat.tool.call.name': 'grep',
      'copilot_chat.tool.call.id': 'tc-004',
    }),
  },
];
