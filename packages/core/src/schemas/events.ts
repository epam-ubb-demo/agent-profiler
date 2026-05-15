/**
 * Zod schemas for event-level domain types.
 */

import { z } from 'zod';

export const toolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  model: z.string().nullable(),
  startTs: z.string().nullable(),
  endTs: z.string().nullable(),
  durationMs: z.number().nullable(),
  success: z.boolean().nullable(),
  parentId: z.string().nullable(),
  turnId: z.string().nullable(),
  eventId: z.string().nullable(),
  argumentsPreview: z.string(),
  skillName: z.string().nullable().optional(),
  skillSource: z.string().nullable().optional(),
  skillContentLength: z.number().int().nonnegative().nullable().optional(),
  skillOutcome: z.enum(['loaded', 'not_found', 'disabled', 'read_error']).nullable().optional(),
  skillErrorMessage: z.string().nullable().optional(),
});

export const assistantMessageSchema = z.object({
  interactionId: z.string().nullable(),
  requestId: z.string().nullable(),
  outputTokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  model: z.string().nullable(),
  timestamp: z.string().nullable(),
  turnId: z.string().nullable(),
  eventId: z.string().nullable(),
  parentId: z.string().nullable(),
  content: z.string(),
  reasoningText: z.string(),
});

export const userMessageSchema = z.object({
  interactionId: z.string().nullable(),
  timestamp: z.string().nullable(),
  turnId: z.string().nullable(),
  content: z.string(),
});

export const compactionSchema = z.object({
  timestamp: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  model: z.string().nullable(),
  turnId: z.string().nullable(),
});

export const subagentInvocationSchema = z.object({
  timestamp: z.string().nullable(),
  totalTokens: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  turnId: z.string().nullable(),
  eventId: z.string().nullable(),
  parentId: z.string().nullable(),
  agentName: z.string(),
  agentType: z.string(),
  childSessionRef: z.string().nullable(),
});
