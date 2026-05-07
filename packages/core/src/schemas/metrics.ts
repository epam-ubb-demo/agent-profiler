/**
 * Zod schemas for metrics domain types.
 */

import { z } from 'zod';

export const modelMetricsSchema = z.object({
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  requestCount: z.number().int().nonnegative(),
  apiDurationMs: z.number().int().nonnegative(),
});

export const tokenBucketSchema = z.object({
  system: z.number().int().nonnegative(),
  conversation: z.number().int().nonnegative(),
  toolDefinitions: z.number().int().nonnegative(),
});

export const shutdownMetricsSchema = z.object({
  totalPremiumRequests: z.number().nonnegative(),
  totalApiDurationMs: z.number().int().nonnegative(),
  modelMetrics: z.array(modelMetricsSchema),
  currentTokens: z.number().int().nonnegative(),
  systemTokens: z.number().int().nonnegative(),
  conversationTokens: z.number().int().nonnegative(),
  toolDefinitionsTokens: z.number().int().nonnegative(),
  codeChanges: z.record(z.unknown()),
  timestamp: z.string().nullable(),
});

export const utilisationSampleSchema = z.object({
  timestamp: z.string(),
  percentage: z.number().min(0).max(100),
  used: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  buckets: tokenBucketSchema,
});
