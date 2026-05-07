import { z } from 'zod';

/**
 * Zod schemas for IPC channel payloads between Electron main ↔ renderer.
 * These define the contract; actual IPC handlers are wired in the Electron app.
 */

const TargetTypeSchema = z.enum(['session', 'turn', 'tool_call']);

// -- Request schemas --

export const CreateAnnotationSchema = z.object({
  sessionId: z.string().min(1),
  targetType: TargetTypeSchema,
  targetId: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  comment: z.string().min(1).optional(),
});

export const ListBySessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const ListByTargetSchema = z.object({
  targetType: TargetTypeSchema,
  targetId: z.string().min(1),
});

export const AddTagSchema = z.object({
  annotationId: z.string().min(1),
  label: z.string().min(1),
});

export const RemoveTagSchema = z.object({
  tagId: z.string().min(1),
});

export const AddCommentSchema = z.object({
  annotationId: z.string().min(1),
  content: z.string().min(1),
});

export const RemoveCommentSchema = z.object({
  commentId: z.string().min(1),
});

export const DeleteAnnotationSchema = z.object({
  annotationId: z.string().min(1),
});

// -- IPC channel map (channel name → request schema) --

export const IpcSchemas = {
  'annotations:create': CreateAnnotationSchema,
  'annotations:list-by-session': ListBySessionSchema,
  'annotations:list-by-target': ListByTargetSchema,
  'annotations:add-tag': AddTagSchema,
  'annotations:remove-tag': RemoveTagSchema,
  'annotations:add-comment': AddCommentSchema,
  'annotations:remove-comment': RemoveCommentSchema,
  'annotations:delete': DeleteAnnotationSchema,
  'annotations:all-tags': z.object({}),
} as const;

export type IpcChannel = keyof typeof IpcSchemas;
