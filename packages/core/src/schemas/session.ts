/**
 * Zod schemas for session-level domain types.
 */

import { z } from 'zod';

import {
  assistantMessageSchema,
  compactionSchema,
  subagentInvocationSchema,
  toolCallSchema,
  userMessageSchema,
} from './events';
import { fanoutTurnSchema } from './fanout';
import { shutdownMetricsSchema, utilisationSampleSchema } from './metrics';

export const parseStatusSchema = z.object({
  status: z.enum(['ok', 'partial', 'failed']),
  error: z.string().nullable(),
});

export const modelChangeSchema = z.object({
  timestamp: z.string(),
  model: z.string(),
});

export const turnSchema = z.object({
  turnId: z.string(),
  startTs: z.string().nullable(),
  endTs: z.string().nullable(),
  userMessage: userMessageSchema.nullable(),
  assistantMessages: z.array(assistantMessageSchema),
  toolCalls: z.array(toolCallSchema),
  subagents: z.array(subagentInvocationSchema),
});

export const sessionSchema = z.object({
  sessionId: z.string(),
  copilotVersion: z.string(),
  selectedModel: z.string(),
  reasoningEffort: z.string(),
  repository: z.string(),
  branch: z.string(),
  cwd: z.string(),
  startTs: z.string().nullable(),
  endTs: z.string().nullable(),
  modelChanges: z.array(modelChangeSchema),
  toolCalls: z.array(toolCallSchema),
  assistantMessages: z.array(assistantMessageSchema),
  userMessages: z.array(userMessageSchema),
  compactions: z.array(compactionSchema),
  subagents: z.array(subagentInvocationSchema),
  shutdown: shutdownMetricsSchema.nullable(),
  success: z.boolean().nullable(),
  fanoutTurns: z.array(fanoutTurnSchema),
  turns: z.array(turnSchema),
  parseStatus: parseStatusSchema,
  utilisation: z.array(utilisationSampleSchema),
});
