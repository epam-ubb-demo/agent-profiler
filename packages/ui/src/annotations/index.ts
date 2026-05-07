/**
 * Annotations module — public API barrel.
 */

export type {
  TargetType,
  AnnotationTarget,
  Tag,
  Comment,
  Annotation,
  AnnotationCallbacks,
} from './types';

export { TagInput } from './TagInput';
export type { TagInputProps } from './TagInput';

export { CommentInput } from './CommentInput';
export type { CommentInputProps } from './CommentInput';

export { AnnotationPanel } from './AnnotationPanel';
export type { AnnotationPanelProps } from './AnnotationPanel';

export { AnnotationBadge } from './AnnotationBadge';
export type { AnnotationBadgeProps } from './AnnotationBadge';

export { FilterByTag } from './FilterByTag';
export type { FilterByTagProps, TagFilterOption } from './FilterByTag';

export { useAnnotations } from './useAnnotations';
export type { AnnotationLoader, AnnotationMutator, UseAnnotationsReturn } from './useAnnotations';
