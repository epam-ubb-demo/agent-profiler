/**
 * AnnotationBadge — Small badge showing annotation counts.
 *
 * Shows tag count and/or comment count as a compact indicator.
 * Clickable to trigger panel expansion.
 */

export interface AnnotationBadgeProps {
  /** Total number of tags across all annotations for the target. */
  readonly tagCount: number;
  /** Total number of comments across all annotations for the target. */
  readonly commentCount: number;
  /** Called when the badge is clicked. */
  readonly onClick: () => void;
}

export function AnnotationBadge({ tagCount, commentCount, onClick }: AnnotationBadgeProps) {
  const total = tagCount + commentCount;

  if (total === 0) return null;

  return (
    <button
      type="button"
      className="annotation-badge"
      data-testid="annotation-badge"
      aria-label={`${tagCount} tags, ${commentCount} comments`}
      onClick={onClick}
    >
      {tagCount > 0 && (
        <span className="annotation-badge__tags" data-testid="badge-tag-count">
          🏷️ {tagCount}
        </span>
      )}
      {commentCount > 0 && (
        <span className="annotation-badge__comments" data-testid="badge-comment-count">
          💬 {commentCount}
        </span>
      )}
    </button>
  );
}
