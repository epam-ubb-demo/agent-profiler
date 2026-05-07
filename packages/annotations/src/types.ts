/**
 * Target types that can be annotated.
 */
export type TargetType = 'session' | 'turn' | 'tool_call';

/**
 * A tag attached to an annotation.
 */
export interface Tag {
  id: string;
  label: string;
}

/**
 * A comment attached to an annotation.
 */
export interface Comment {
  id: string;
  content: string;
  createdAt: string;
}

/**
 * An annotation on a session element (session, turn, or tool call).
 */
export interface Annotation {
  id: string;
  sessionId: string;
  targetType: TargetType;
  targetId: string;
  tags: Tag[];
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new annotation.
 */
export interface CreateAnnotationInput {
  sessionId: string;
  targetType: TargetType;
  targetId: string;
  tags?: string[];
  comment?: string;
}
