/**
 * AnnotationPanel — Combined annotation panel for a target.
 *
 * Integrates TagInput + CommentInput, supports collapsible display,
 * and shows an "Add annotation" button when no annotations exist.
 */

import { useState } from 'react';

import { CommentInput } from './CommentInput';
import { TagInput } from './TagInput';
import type { Annotation, AnnotationTarget, AnnotationCallbacks } from './types';

export interface AnnotationPanelProps {
  /** The target entity for annotations. */
  readonly target: AnnotationTarget;
  /** Annotations for the current target. */
  readonly annotations: Annotation[];
  /** Suggestions for tag autocomplete. */
  readonly tagSuggestions?: string[];
  /** CRUD callbacks. */
  readonly callbacks: AnnotationCallbacks;
  /** Whether the panel starts expanded. */
  readonly defaultExpanded?: boolean;
}

export function AnnotationPanel({
  target,
  annotations,
  tagSuggestions = [],
  callbacks,
  defaultExpanded = false,
}: AnnotationPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleCreate = () => {
    callbacks.onCreateAnnotation(target, [], undefined);
  };

  return (
    <div data-testid="annotation-panel" className="annotation-panel">
      <button
        type="button"
        className="annotation-panel__toggle"
        aria-expanded={expanded}
        aria-label="Toggle annotations"
        data-testid="annotation-panel-toggle"
        onClick={() => setExpanded((prev) => !prev)}
      >
        Annotations ({annotations.length})
      </button>

      {expanded && (
        <div className="annotation-panel__body" data-testid="annotation-panel-body">
          {annotations.length === 0 ? (
            <button
              type="button"
              className="annotation-panel__create"
              data-testid="annotation-create"
              onClick={handleCreate}
            >
              Add annotation
            </button>
          ) : (
            annotations.map((annotation) => (
              <div
                key={annotation.id}
                className="annotation-panel__annotation"
                data-testid="annotation-entry"
              >
                <TagInput
                  tags={annotation.tags}
                  suggestions={tagSuggestions}
                  onAdd={(label) => callbacks.onAddTag(annotation.id, label)}
                  onRemove={(tagId) => callbacks.onRemoveTag(tagId)}
                />
                <CommentInput
                  comments={annotation.comments}
                  onAdd={(content) => callbacks.onAddComment(annotation.id, content)}
                  onRemove={(commentId) => callbacks.onRemoveComment(commentId)}
                />
                <button
                  type="button"
                  className="annotation-panel__delete"
                  data-testid="annotation-delete"
                  aria-label="Delete annotation"
                  onClick={() => callbacks.onDeleteAnnotation(annotation.id)}
                >
                  Delete Annotation
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
