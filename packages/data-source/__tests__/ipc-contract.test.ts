/**
 * IPC contract test — verifies that data serialized for IPC transport
 * validates against the Zod schemas defined in @agent-profiler/core.
 */

import { join } from 'node:path';

import { sessionListItemSchema } from '@agent-profiler/core';
import { describe, it, expect } from 'vitest';

import { LocalFsDataSource } from '../src/local-fs';

const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('IPC contract validation', () => {
  it('listSessions output serializes to valid sessionListItemSchema', async () => {
    const ds = new LocalFsDataSource(FIXTURES_DIR);
    const items = await ds.listSessions();

    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // Simulate the IPC serialization done in main process
      const serialized = {
        id: item.id,
        name: item.name,
        path: item.path,
        createdAt: item.createdAt.toISOString(),
        adapter: item.adapter,
      };

      const result = sessionListItemSchema.safeParse(serialized);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid session list items', () => {
    const invalid = {
      id: 123, // should be string
      name: 'test',
      path: '/some/path',
      createdAt: 'not-a-date',
      adapter: 'unknown-adapter',
    };

    const result = sessionListItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('getSession returns data consistent with Session type', async () => {
    const ds = new LocalFsDataSource(FIXTURES_DIR);
    const session = await ds.getSession('session-001');

    expect(session).not.toBeNull();
    // Verify key Session interface fields are present
    expect(session!.sessionId).toBeDefined();
    expect(session!.parseStatus).toBeDefined();
    expect(session!.parseStatus.status).toMatch(/^(ok|partial|failed)$/);
    expect(session!.turns).toBeDefined();
    expect(Array.isArray(session!.toolCalls)).toBe(true);
  });
});
