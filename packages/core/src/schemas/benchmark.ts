/**
 * Zod schemas for benchmark domain types.
 */

import { z } from 'zod';

export const variantSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  sessionId: z.string(),
});

export const benchRunSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  variants: z.array(variantSchema),
  metadata: z.record(z.unknown()),
});
