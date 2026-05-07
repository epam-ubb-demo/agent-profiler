/**
 * Path resolver — locates the events file from a directory or direct path.
 *
 * Mirrors `resolve_events_path()` from the Python prototype.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATE_FILENAMES = ['events.jsonl', 'events.ndjson'] as const;

export interface PathResolution {
  readonly resolved: string | null;
  readonly error: string | null;
}

/**
 * Resolve the events file path from either a directory or a direct file path.
 *
 * - If `inputPath` is a file, use it directly.
 * - If it is a directory, look for `events.jsonl` or `events.ndjson` inside.
 * - Returns `{ resolved, error }` — never throws.
 */
export function resolveEventsPath(inputPath: string): PathResolution {
  try {
    if (!existsSync(inputPath)) {
      return { resolved: null, error: `Path does not exist: ${inputPath}` };
    }

    const stat = statSync(inputPath);

    if (stat.isFile()) {
      return { resolved: inputPath, error: null };
    }

    if (stat.isDirectory()) {
      for (const candidate of CANDIDATE_FILENAMES) {
        const full = join(inputPath, candidate);
        if (existsSync(full) && statSync(full).isFile()) {
          return { resolved: full, error: null };
        }
      }
      return {
        resolved: null,
        error: `No events file found in directory: ${inputPath} (looked for ${CANDIDATE_FILENAMES.join(', ')})`,
      };
    }

    return { resolved: null, error: `Path is neither a file nor directory: ${inputPath}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { resolved: null, error: `Failed to resolve path: ${message}` };
  }
}
