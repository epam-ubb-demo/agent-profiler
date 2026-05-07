/**
 * Unit tests for LocalFsDataSource.
 */

import { join } from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import { LocalFsDataSource } from '../src/local-fs';

const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('LocalFsDataSource', () => {
  let dataSource: LocalFsDataSource;

  beforeEach(() => {
    dataSource = new LocalFsDataSource(FIXTURES_DIR);
  });

  describe('isAvailable()', () => {
    it('returns true for an existing directory', async () => {
      expect(await dataSource.isAvailable()).toBe(true);
    });

    it('returns false for a non-existent directory', async () => {
      const ds = new LocalFsDataSource('/non/existent/path/xyz');
      expect(await ds.isAvailable()).toBe(false);
    });
  });

  describe('listSessions()', () => {
    it('lists only directories with recognized session files', async () => {
      const items = await dataSource.listSessions();
      const ids = items.map((i) => i.id);

      expect(ids).toContain('session-001');
      expect(ids).toContain('session-002');
      expect(ids).not.toContain('not-a-session');
    });

    it('returns items with correct adapter type', async () => {
      const items = await dataSource.listSessions();
      for (const item of items) {
        expect(item.adapter).toBe('copilot-cli');
      }
    });

    it('returns items with valid createdAt dates', async () => {
      const items = await dataSource.listSessions();
      for (const item of items) {
        expect(item.createdAt).toBeInstanceOf(Date);
        expect(item.createdAt.getTime()).not.toBeNaN();
      }
    });

    it('includes correct path for each item', async () => {
      const items = await dataSource.listSessions();
      const session001 = items.find((i) => i.id === 'session-001');
      expect(session001?.path).toBe(join(FIXTURES_DIR, 'session-001'));
    });

    it('returns empty array for non-existent directory', async () => {
      const ds = new LocalFsDataSource('/non/existent/dir');
      const items = await ds.listSessions();
      expect(items).toEqual([]);
    });
  });

  describe('getSession()', () => {
    it('parses and returns a valid session', async () => {
      const session = await dataSource.getSession('session-001');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('sess-001');
      expect(session!.parseStatus.status).toBe('ok');
    });

    it('returns null for a non-existent session ID', async () => {
      const session = await dataSource.getSession('non-existent-id');
      expect(session).toBeNull();
    });

    it('returns null for a directory without recognized files', async () => {
      const session = await dataSource.getSession('not-a-session');
      expect(session).toBeNull();
    });

    it('caches parsed sessions', async () => {
      const first = await dataSource.getSession('session-001');
      const second = await dataSource.getSession('session-001');
      // Same object reference indicates cache hit
      expect(first).toBe(second);
    });

    it('evicts oldest entry when cache is full', async () => {
      const ds = new LocalFsDataSource(FIXTURES_DIR, { maxCacheSize: 1 });

      const first = await ds.getSession('session-001');
      expect(first).not.toBeNull();

      // Load second session, should evict first
      await ds.getSession('session-002');

      // Load first again — it should be re-parsed (different object)
      const reloaded = await ds.getSession('session-001');
      expect(reloaded).not.toBe(first);
      expect(reloaded!.sessionId).toBe('sess-001');
    });
  });

  describe('clearCache()', () => {
    it('clears the session cache', async () => {
      const first = await dataSource.getSession('session-001');
      dataSource.clearCache();
      const second = await dataSource.getSession('session-001');
      // After cache clear, should be a different object reference
      expect(second).not.toBe(first);
      expect(second!.sessionId).toBe(first!.sessionId);
    });
  });

  describe('getRootDir()', () => {
    it('returns the configured root directory', () => {
      expect(dataSource.getRootDir()).toBe(FIXTURES_DIR);
    });
  });
});
