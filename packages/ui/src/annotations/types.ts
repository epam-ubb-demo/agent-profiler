/**
 * UI-level annotation types for the annotations module.
 */

/** The type of entity an annotation targets. */
export type TargetType = 'session' | 'turn' | 'tool_call';

/** Identifies the target of an annotation. */
export interface AnnotationTarget {
  readonly type: TargetType;
  readonly id: string;
  readonly sessionId: string;
}

/** A tag attached to an annotation. */
export interface Tag {
  readonly id: string;
  readonly label: string;
}

/** A comment attached to an annotation. */
export interface Comment {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string;
}

/** A full annotation with its tags and comments. */
export interface Annotation {
  readonly id: string;
  readonly target: AnnotationTarget;
  readonly tags: Tag[];
  readonly comments: Comment[];
  readonly createdAt: string;
}

/** Callbacks for annotation CRUD operations. */
export interface AnnotationCallbacks {
  onCreateAnnotation: (target: AnnotationTarget, tags: string[], comment?: string) => void;
  onAddTag: (annotationId: string, label: string) => void;
  onRemoveTag: (tagId: string) => void;
  onAddComment: (annotationId: string, content: string) => void;
  onRemoveComment: (commentId: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}
