import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAnnotationsDb } from '../src/db.js';
import type { AnnotationsDb } from '../src/db.js';
import {
  AddCommentSchema,
  AddTagSchema,
  CreateAnnotationSchema,
  DeleteAnnotationSchema,
  ListBySessionSchema,
  ListByTargetSchema,
  RemoveCommentSchema,
  RemoveTagSchema,
} from '../src/ipc.js';
import { AnnotationsRepository } from '../src/repository.js';

const TEST_DIR = join(import.meta.dirname, '.tmp-test-dbs');

let annotationsDb: AnnotationsDb;
let repo: AnnotationsRepository;
let dbCounter = 0;

function freshDb(): { annotationsDb: AnnotationsDb; repo: AnnotationsRepository } {
  dbCounter++;
  const dbPath = join(TEST_DIR, `test-${dbCounter}-${Date.now()}.db`);
  const aDb = createAnnotationsDb(dbPath);
  const r = new AnnotationsRepository(aDb.db);
  return { annotationsDb: aDb, repo: r };
}

beforeAll(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

beforeEach(() => {
  const fresh = freshDb();
  annotationsDb = fresh.annotationsDb;
  repo = fresh.repo;
});

afterEach(() => {
  annotationsDb.close();
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('AnnotationsRepository', () => {
  it('creates annotation with tags and comments', () => {
    const annotation = repo.create({
      sessionId: 'session-1',
      targetType: 'turn',
      targetId: 'turn-42',
      tags: ['important', 'bug'],
      comment: 'This turn has an issue',
    });

    expect(annotation.id).toBeDefined();
    expect(annotation.sessionId).toBe('session-1');
    expect(annotation.targetType).toBe('turn');
    expect(annotation.targetId).toBe('turn-42');
    expect(annotation.tags).toHaveLength(2);
    expect(annotation.tags.map((t) => t.label).sort()).toEqual(['bug', 'important']);
    expect(annotation.comments).toHaveLength(1);
    expect(annotation.comments[0]!.content).toBe('This turn has an issue');
  });

  it('creates annotation without tags or comment', () => {
    const annotation = repo.create({
      sessionId: 'session-1',
      targetType: 'session',
      targetId: 'session-1',
    });

    expect(annotation.tags).toHaveLength(0);
    expect(annotation.comments).toHaveLength(0);
  });

  it('finds annotations by session', () => {
    repo.create({ sessionId: 'sess-a', targetType: 'turn', targetId: 't1' });
    repo.create({ sessionId: 'sess-a', targetType: 'turn', targetId: 't2' });
    repo.create({ sessionId: 'sess-b', targetType: 'turn', targetId: 't3' });

    const results = repo.findBySession('sess-a');
    expect(results).toHaveLength(2);
    expect(results.every((a) => a.sessionId === 'sess-a')).toBe(true);
  });

  it('finds annotations by target', () => {
    repo.create({ sessionId: 'sess-a', targetType: 'tool_call', targetId: 'tc-1' });
    repo.create({ sessionId: 'sess-a', targetType: 'tool_call', targetId: 'tc-1' });
    repo.create({ sessionId: 'sess-a', targetType: 'turn', targetId: 'tc-1' });

    const results = repo.findByTarget('tool_call', 'tc-1');
    expect(results).toHaveLength(2);
  });

  it('finds annotations by tag', () => {
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't1', tags: ['bug'] });
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't2', tags: ['feature'] });
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't3', tags: ['bug', 'feature'] });

    const bugs = repo.findByTag('bug');
    expect(bugs).toHaveLength(2);

    const features = repo.findByTag('feature');
    expect(features).toHaveLength(2);
  });

  it('adds tag to existing annotation', () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'session',
      targetId: 's1',
    });

    const tag = repo.addTag(annotation.id, 'new-tag');
    expect(tag.id).toBeDefined();
    expect(tag.label).toBe('new-tag');

    const found = repo.findBySession('s1');
    expect(found[0]!.tags).toHaveLength(1);
    expect(found[0]!.tags[0]!.label).toBe('new-tag');
  });

  it('removes tag', () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'session',
      targetId: 's1',
      tags: ['keep', 'remove'],
    });

    const tagToRemove = annotation.tags.find((t) => t.label === 'remove')!;
    repo.removeTag(tagToRemove.id);

    const found = repo.findBySession('s1');
    expect(found[0]!.tags).toHaveLength(1);
    expect(found[0]!.tags[0]!.label).toBe('keep');
  });

  it('adds comment to existing annotation', () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'turn',
      targetId: 't1',
    });

    const comment = repo.addComment(annotation.id, 'A new comment');
    expect(comment.id).toBeDefined();
    expect(comment.content).toBe('A new comment');
    expect(comment.createdAt).toBeDefined();

    const found = repo.findBySession('s1');
    expect(found[0]!.comments).toHaveLength(1);
  });

  it('removes comment', () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'turn',
      targetId: 't1',
      comment: 'original comment',
    });

    repo.removeComment(annotation.comments[0]!.id);

    const found = repo.findBySession('s1');
    expect(found[0]!.comments).toHaveLength(0);
  });

  it('deletes annotation with cascade (tags + comments)', () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'turn',
      targetId: 't1',
      tags: ['tag1', 'tag2'],
      comment: 'a comment',
    });

    repo.delete(annotation.id);

    const found = repo.findBySession('s1');
    expect(found).toHaveLength(0);

    // Verify cascading deletes
    const tags = repo.getAllTags();
    expect(tags).not.toContain('tag1');
    expect(tags).not.toContain('tag2');
  });

  it('getAllTags returns unique labels', () => {
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't1', tags: ['bug', 'ux'] });
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't2', tags: ['bug', 'perf'] });

    const allTags = repo.getAllTags();
    expect(allTags.sort()).toEqual(['bug', 'perf', 'ux']);
  });

  it('handles non-existent annotation gracefully on addTag', () => {
    expect(() => repo.addTag('non-existent-id', 'tag')).toThrow('Annotation not found');
  });

  it('handles non-existent annotation gracefully on addComment', () => {
    expect(() => repo.addComment('non-existent-id', 'comment')).toThrow('Annotation not found');
  });

  it('handles removeTag for non-existent tag gracefully', () => {
    // Should not throw
    expect(() => repo.removeTag('non-existent-tag-id')).not.toThrow();
  });

  it('supports multiple annotations on same target', () => {
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't1', tags: ['first'] });
    repo.create({ sessionId: 's1', targetType: 'turn', targetId: 't1', tags: ['second'] });

    const results = repo.findByTarget('turn', 't1');
    expect(results).toHaveLength(2);
  });

  it('returns empty result for unknown session', () => {
    const results = repo.findBySession('unknown-session');
    expect(results).toHaveLength(0);
  });

  it('runs database migrations on fresh DB', () => {
    // The freshDb() already creates and migrates — verify tables exist
    const tables = annotationsDb.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('annotations', 'tags', 'comments') ORDER BY name`,
      )
      .all() as { name: string }[];

    expect(tables.map((t) => t.name)).toEqual(['annotations', 'comments', 'tags']);
  });

  it('enables WAL mode', () => {
    const result = annotationsDb.db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0]!.journal_mode).toBe('wal');
  });

  it('generates UUID-format IDs', () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'session',
      targetId: 's1',
      tags: ['test'],
      comment: 'hello',
    });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(annotation.id).toMatch(uuidRegex);
    expect(annotation.tags[0]!.id).toMatch(uuidRegex);
    expect(annotation.comments[0]!.id).toMatch(uuidRegex);
  });

  it('updates updatedAt timestamp on modification', async () => {
    const annotation = repo.create({
      sessionId: 's1',
      targetType: 'session',
      targetId: 's1',
    });

    const originalUpdatedAt = annotation.updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    repo.addTag(annotation.id, 'new-tag');

    const found = repo.findBySession('s1');
    expect(found[0]!.updatedAt).not.toBe(originalUpdatedAt);
  });
});

describe('IPC Schemas', () => {
  it('CreateAnnotationSchema validates correct input', () => {
    const result = CreateAnnotationSchema.safeParse({
      sessionId: 'session-1',
      targetType: 'turn',
      targetId: 'turn-1',
      tags: ['bug'],
      comment: 'A comment',
    });
    expect(result.success).toBe(true);
  });

  it('CreateAnnotationSchema rejects invalid targetType', () => {
    const result = CreateAnnotationSchema.safeParse({
      sessionId: 'session-1',
      targetType: 'invalid',
      targetId: 'turn-1',
    });
    expect(result.success).toBe(false);
  });

  it('CreateAnnotationSchema rejects empty sessionId', () => {
    const result = CreateAnnotationSchema.safeParse({
      sessionId: '',
      targetType: 'turn',
      targetId: 'turn-1',
    });
    expect(result.success).toBe(false);
  });

  it('ListBySessionSchema validates correct input', () => {
    const result = ListBySessionSchema.safeParse({ sessionId: 'session-1' });
    expect(result.success).toBe(true);
  });

  it('ListByTargetSchema validates correct input', () => {
    const result = ListByTargetSchema.safeParse({
      targetType: 'tool_call',
      targetId: 'tc-1',
    });
    expect(result.success).toBe(true);
  });

  it('AddTagSchema rejects empty label', () => {
    const result = AddTagSchema.safeParse({
      annotationId: 'ann-1',
      label: '',
    });
    expect(result.success).toBe(false);
  });

  it('AddCommentSchema rejects empty content', () => {
    const result = AddCommentSchema.safeParse({
      annotationId: 'ann-1',
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('RemoveTagSchema validates correct input', () => {
    const result = RemoveTagSchema.safeParse({ tagId: 'tag-1' });
    expect(result.success).toBe(true);
  });

  it('RemoveCommentSchema validates correct input', () => {
    const result = RemoveCommentSchema.safeParse({ commentId: 'comment-1' });
    expect(result.success).toBe(true);
  });

  it('DeleteAnnotationSchema validates correct input', () => {
    const result = DeleteAnnotationSchema.safeParse({ annotationId: 'ann-1' });
    expect(result.success).toBe(true);
  });
});
