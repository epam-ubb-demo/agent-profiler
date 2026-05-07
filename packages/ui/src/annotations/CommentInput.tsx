/**
 * CommentInput — Comment display and creation component.
 *
 * Shows existing comments with timestamps and provides a textarea
 * for adding new comments (submit via button or Ctrl+Enter).
 */

import { useState, useCallback, type KeyboardEvent } from 'react';

import type { Comment } from './types';

export interface CommentInputProps {
  /** Existing comments to display. */
  readonly comments: Comment[];
  /** Called when a new comment is submitted. */
  readonly onAdd: (content: string) => void;
  /** Called when a comment is deleted. */
  readonly onRemove: (commentId: string) => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function CommentInput({ comments, onAdd, onRemove }: CommentInputProps) {
  const [draft, setDraft] = useState('');

  const submit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    onAdd(trimmed);
    setDraft('');
  }, [draft, onAdd]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div data-testid="comment-input" className="comment-input">
      {comments.length > 0 && (
        <ul className="comment-input__list" aria-label="Comments">
          {comments.map((comment) => (
            <li key={comment.id} className="comment-input__item" data-testid="comment-item">
              <div className="comment-input__content">{comment.content}</div>
              <div className="comment-input__meta">
                <time className="comment-input__time">{formatTimestamp(comment.createdAt)}</time>
                <button
                  type="button"
                  aria-label={`Delete comment`}
                  className="comment-input__delete"
                  data-testid="comment-delete"
                  onClick={() => onRemove(comment.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="comment-input__form">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment…"
          aria-label="Add comment"
          data-testid="comment-textarea"
          className="comment-input__textarea"
          rows={2}
        />
        <button
          type="button"
          onClick={submit}
          disabled={draft.trim().length === 0}
          aria-label="Submit comment"
          data-testid="comment-submit"
          className="comment-input__submit"
        >
          Add Comment
        </button>
      </div>
    </div>
  );
}
