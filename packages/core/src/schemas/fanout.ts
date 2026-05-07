/**
 * Zod schema for the FanoutTurn type.
 */

import { z } from 'zod';

import { assistantMessageSchema, subagentInvocationSchema, toolCallSchema, userMessageSchema } from './events';

export const fanoutTurnSchema = z.object({
  turnId: z.string(),
  startTs: z.string().nullable(),
  endTs: z.string().nullable(),
  model: z.string().nullable(),
  assistantMessages: z.array(assistantMessageSchema),
  toolCalls: z.array(toolCallSchema),
  subagents: z.array(subagentInvocationSchema),
  userMessage: userMessageSchema.nullable(),
});
