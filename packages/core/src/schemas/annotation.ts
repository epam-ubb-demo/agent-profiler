/**
 * Zod schema for the Annotation type.
 */

import { z } from 'zod';

export const annotationSchema = z.object({
  id: z.string(),
  targetType: z.enum(['turn', 'toolCall']),
  targetId: z.string(),
  label: z.string(),
  comment: z.string(),
  createdAt: z.string(),
  author: z.string(),
});
