/**
 * useAnnotations — Hook for annotation state management.
 *
 * Accepts an annotationLoader function for testability/decoupling.
 * Returns annotations for the current target plus CRUD callbacks.
 * Manages optimistic updates.
 */

import { useState, useEffect, useCallback } from 'react';

import type { Annotation, AnnotationTarget, AnnotationCallbacks } from './types';

/** Function signature for loading annotations for a target. */
export type AnnotationLoader = (target: AnnotationTarget) => Promise<Annotation[]>;

/** Function signature for persisting annotation mutations. */
export interface AnnotationMutator {
  create: (target: AnnotationTarget, tags: string[], comment?: string) => Promise<Annotation>;
  addTag: (annotationId: string, label: string) => Promise<{ id: string; label: string }>;
  removeTag: (tagId: string) => Promise<void>;
  addComment: (annotationId: string, content: string) => Promise<{ id: string; content: string; createdAt: string }>;
  removeComment: (commentId: string) => Promise<void>;
  deleteAnnotation: (annotationId: string) => Promise<void>;
}

export interface UseAnnotationsReturn {
  readonly annotations: Annotation[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly callbacks: AnnotationCallbacks;
}

export function useAnnotations(
  target: AnnotationTarget | null,
  loader: AnnotationLoader,
  mutator: AnnotationMutator,
): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setAnnotations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loader(target)
      .then((result) => {
        if (!cancelled) {
          setAnnotations(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load annotations');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [target, loader]);

  const onCreateAnnotation = useCallback(
    (t: AnnotationTarget, tags: string[], comment?: string) => {
      mutator
        .create(t, tags, comment)
        .then((annotation) => {
          setAnnotations((prev) => [...prev, annotation]);
        })
        .catch(() => {
          setError('Failed to create annotation');
        });
    },
    [mutator],
  );

  const onAddTag = useCallback(
    (annotationId: string, label: string) => {
      mutator
        .addTag(annotationId, label)
        .then((tag) => {
          setAnnotations((prev) =>
            prev.map((a) =>
              a.id === annotationId ? { ...a, tags: [...a.tags, tag] } : a,
            ),
          );
        })
        .catch(() => {
          setError('Failed to add tag');
        });
    },
    [mutator],
  );

  const onRemoveTag = useCallback(
    (tagId: string) => {
      // Optimistic: remove immediately
      setAnnotations((prev) =>
        prev.map((a) => ({
          ...a,
          tags: a.tags.filter((t) => t.id !== tagId),
        })),
      );

      mutator.removeTag(tagId).catch(() => {
        setError('Failed to remove tag');
      });
    },
    [mutator],
  );

  const onAddComment = useCallback(
    (annotationId: string, content: string) => {
      mutator
        .addComment(annotationId, content)
        .then((comment) => {
          setAnnotations((prev) =>
            prev.map((a) =>
              a.id === annotationId ? { ...a, comments: [...a.comments, comment] } : a,
            ),
          );
        })
        .catch(() => {
          setError('Failed to add comment');
        });
    },
    [mutator],
  );

  const onRemoveComment = useCallback(
    (commentId: string) => {
      // Optimistic: remove immediately
      setAnnotations((prev) =>
        prev.map((a) => ({
          ...a,
          comments: a.comments.filter((c) => c.id !== commentId),
        })),
      );

      mutator.removeComment(commentId).catch(() => {
        setError('Failed to remove comment');
      });
    },
    [mutator],
  );

  const onDeleteAnnotation = useCallback(
    (annotationId: string) => {
      // Optimistic: remove immediately
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));

      mutator.deleteAnnotation(annotationId).catch(() => {
        setError('Failed to delete annotation');
      });
    },
    [mutator],
  );

  return {
    annotations,
    loading,
    error,
    callbacks: {
      onCreateAnnotation,
      onAddTag,
      onRemoveTag,
      onAddComment,
      onRemoveComment,
      onDeleteAnnotation,
    },
  };
}
