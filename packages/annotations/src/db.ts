import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';

import { runMigrations } from './schema.js';

/**
 * The annotations database wrapper.
 */
export interface AnnotationsDb {
  /** The underlying better-sqlite3 database instance. */
  db: Database.Database;
  /** Close the database connection. */
  close(): void;
}

/**
 * Create and initialize an annotations database at the given path.
 * Enables WAL mode and runs migrations on open.
 */
export function createAnnotationsDb(dbPath: string): AnnotationsDb {
  const db = new BetterSqlite3(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run schema migrations
  runMigrations(db);

  return {
    db,
    close() {
      db.close();
    },
  };
}
