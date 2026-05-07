import crypto from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  Annotation,
  Comment,
  CreateAnnotationInput,
  Tag,
  TargetType,
} from './types.js';

/**
 * Annotations repository — CRUD operations on annotations, tags, and comments.
 */
export class AnnotationsRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Create a new annotation with optional tags and comment.
   */
  create(input: CreateAnnotationInput): Annotation {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertAnnotation = this.db.prepare(`
      INSERT INTO annotations (id, session_id, target_type, target_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertTag = this.db.prepare(`
      INSERT INTO tags (id, annotation_id, label) VALUES (?, ?, ?)
    `);

    const insertComment = this.db.prepare(`
      INSERT INTO comments (id, annotation_id, content, created_at) VALUES (?, ?, ?, ?)
    `);

    const tags: Tag[] = [];
    const comments: Comment[] = [];

    const transaction = this.db.transaction(() => {
      insertAnnotation.run(id, input.sessionId, input.targetType, input.targetId, now, now);

      if (input.tags) {
        for (const label of input.tags) {
          const tagId = crypto.randomUUID();
          insertTag.run(tagId, id, label);
          tags.push({ id: tagId, label });
        }
      }

      if (input.comment) {
        const commentId = crypto.randomUUID();
        insertComment.run(commentId, id, input.comment, now);
        comments.push({ id: commentId, content: input.comment, createdAt: now });
      }
    });

    transaction();

    return {
      id,
      sessionId: input.sessionId,
      targetType: input.targetType,
      targetId: input.targetId,
      tags,
      comments,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Find all annotations for a given session.
   */
  findBySession(sessionId: string): Annotation[] {
    const rows = this.db
      .prepare(`SELECT * FROM annotations WHERE session_id = ? ORDER BY created_at DESC`)
      .all(sessionId) as AnnotationRow[];

    return rows.map((row) => this.hydrate(row));
  }

  /**
   * Find all annotations for a given target.
   */
  findByTarget(targetType: TargetType, targetId: string): Annotation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM annotations WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC`,
      )
      .all(targetType, targetId) as AnnotationRow[];

    return rows.map((row) => this.hydrate(row));
  }

  /**
   * Find all annotations that have a specific tag label.
   */
  findByTag(label: string): Annotation[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT a.* FROM annotations a
         INNER JOIN tags t ON t.annotation_id = a.id
         WHERE t.label = ?
         ORDER BY a.created_at DESC`,
      )
      .all(label) as AnnotationRow[];

    return rows.map((row) => this.hydrate(row));
  }

  /**
   * Add a tag to an existing annotation.
   */
  addTag(annotationId: string, label: string): Tag {
    this.assertAnnotationExists(annotationId);

    const tagId = crypto.randomUUID();
    this.db
      .prepare(`INSERT INTO tags (id, annotation_id, label) VALUES (?, ?, ?)`)
      .run(tagId, annotationId, label);

    this.touchUpdatedAt(annotationId);

    return { id: tagId, label };
  }

  /**
   * Remove a tag by its ID.
   */
  removeTag(tagId: string): void {
    const tag = this.db.prepare(`SELECT annotation_id FROM tags WHERE id = ?`).get(tagId) as
      | { annotation_id: string }
      | undefined;

    this.db.prepare(`DELETE FROM tags WHERE id = ?`).run(tagId);

    if (tag) {
      this.touchUpdatedAt(tag.annotation_id);
    }
  }

  /**
   * Add a comment to an existing annotation.
   */
  addComment(annotationId: string, content: string): Comment {
    this.assertAnnotationExists(annotationId);

    const commentId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`INSERT INTO comments (id, annotation_id, content, created_at) VALUES (?, ?, ?, ?)`)
      .run(commentId, annotationId, content, now);

    this.touchUpdatedAt(annotationId);

    return { id: commentId, content, createdAt: now };
  }

  /**
   * Remove a comment by its ID.
   */
  removeComment(commentId: string): void {
    const comment = this.db
      .prepare(`SELECT annotation_id FROM comments WHERE id = ?`)
      .get(commentId) as { annotation_id: string } | undefined;

    this.db.prepare(`DELETE FROM comments WHERE id = ?`).run(commentId);

    if (comment) {
      this.touchUpdatedAt(comment.annotation_id);
    }
  }

  /**
   * Delete an annotation and cascade-delete its tags and comments.
   */
  delete(annotationId: string): void {
    // Foreign keys with ON DELETE CASCADE handle tags/comments cleanup
    this.db.prepare(`DELETE FROM annotations WHERE id = ?`).run(annotationId);
  }

  /**
   * Get all unique tag labels (for autocomplete).
   */
  getAllTags(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT label FROM tags ORDER BY label`)
      .all() as { label: string }[];

    return rows.map((row) => row.label);
  }

  /**
   * Hydrate an annotation row with its tags and comments.
   */
  private hydrate(row: AnnotationRow): Annotation {
    const tags = this.db
      .prepare(`SELECT id, label FROM tags WHERE annotation_id = ?`)
      .all(row.id) as Tag[];

    const commentRows = this.db
      .prepare(
        `SELECT id, content, created_at FROM comments WHERE annotation_id = ? ORDER BY created_at`,
      )
      .all(row.id) as CommentRow[];

    const comments: Comment[] = commentRows.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
    }));

    return {
      id: row.id,
      sessionId: row.session_id,
      targetType: row.target_type as TargetType,
      targetId: row.target_id,
      tags,
      comments,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update the updated_at timestamp for an annotation.
   */
  private touchUpdatedAt(annotationId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE annotations SET updated_at = ? WHERE id = ?`).run(now, annotationId);
  }

  /**
   * Assert that an annotation exists, throw if not.
   */
  private assertAnnotationExists(annotationId: string): void {
    const row = this.db.prepare(`SELECT id FROM annotations WHERE id = ?`).get(annotationId);

    if (!row) {
      throw new Error(`Annotation not found: ${annotationId}`);
    }
  }
}

// -- Internal row types for SQLite result mapping --

interface AnnotationRow {
  id: string;
  session_id: string;
  target_type: string;
  target_id: string;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
}
