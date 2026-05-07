/**
 * Path-based metadata inference for ctb benchmark runs.
 *
 * Extracts bench name and run ID from the conventional directory layout:
 *   .ctb/runs/<bench-name>/<timestamp>/copilot/...
 */

import { basename, dirname } from 'node:path';

/**
 * Inferred metadata from a run directory path.
 */
export interface InferredMetadata {
  readonly benchName: string | null;
  readonly runId: string | null;
}

/**
 * ISO-like timestamp pattern used as directory names in ctb:
 * e.g., "2024-01-15T10-30-00"
 */
const TIMESTAMP_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

/**
 * Infer bench name and run ID from the run directory path.
 *
 * Expected layout: .../<bench-name>/<timestamp>/
 * - runId: the timestamp directory name
 * - benchName: the parent directory name
 */
export function inferMetadata(runDir: string): InferredMetadata {
  const dirName = basename(runDir);
  const parentName = basename(dirname(runDir));

  // If the directory name looks like a timestamp, use it as the run ID
  // and the parent as the bench name
  if (TIMESTAMP_DIR_PATTERN.test(dirName)) {
    return {
      runId: dirName,
      benchName: parentName && parentName !== '/' ? parentName : null,
    };
  }

  // Otherwise we can't reliably infer — return the directory name as a fallback ID
  return {
    runId: dirName || null,
    benchName: null,
  };
}

/**
 * Extract variant ID from directory name.
 * The variant directory name IS the variant ID.
 */
export function inferVariantId(dirName: string): string {
  return dirName;
}

/**
 * Extract step index from a step directory name.
 * Expected format: "step-<N>"
 *
 * @returns step index or null if pattern doesn't match
 */
export function inferStepIndex(dirName: string): number | null {
  const match = /^step-(\d+)$/.exec(dirName);
  return match ? Number(match[1]) : null;
}
