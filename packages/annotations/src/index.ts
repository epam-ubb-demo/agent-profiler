export { createAnnotationsDb } from './db.js';
export type { AnnotationsDb } from './db.js';
export { AnnotationsRepository } from './repository.js';
export { runMigrations } from './schema.js';
export {
  AddCommentSchema,
  AddTagSchema,
  CreateAnnotationSchema,
  DeleteAnnotationSchema,
  IpcSchemas,
  ListBySessionSchema,
  ListByTargetSchema,
  RemoveCommentSchema,
  RemoveTagSchema,
} from './ipc.js';
export type { IpcChannel } from './ipc.js';
export type {
  Annotation,
  Comment,
  CreateAnnotationInput,
  Tag,
  TargetType,
} from './types.js';
