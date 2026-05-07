/**
 * Directory scanner for ctb benchmark run layouts.
 *
 * Discovers variants and steps from the conventional directory structure:
 *   <runDir>/copilot/<variant_id>/step-<N>/session-state/<uuid>/
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Discovered session path with associated metadata.
 */
export interface DiscoveredStep {
  readonly variantId: string;
  readonly stepIndex: number;
  readonly sessionPath: string;
}

/**
 * Result of scanning a ctb run directory.
 */
export interface ScanResult {
  readonly steps: readonly DiscoveredStep[];
  readonly warnings: readonly string[];
}

/**
 * Scan a ctb benchmark run directory and discover all session paths.
 *
 * Returns an empty result (never throws) if the directory structure
 * is missing or malformed.
 */
export async function scanRunDirectory(runDir: string): Promise<ScanResult> {
  const warnings: string[] = [];
  const steps: DiscoveredStep[] = [];

  const copilotDir = join(runDir, 'copilot');

  // Check if copilot/ directory exists
  if (!(await isDirectory(copilotDir))) {
    warnings.push(`No copilot/ directory found at ${copilotDir}`);
    return { steps, warnings };
  }

  // List variant directories (sorted alphabetically)
  const variantDirs = await listSortedDirectories(copilotDir);

  for (const variantId of variantDirs) {
    const variantPath = join(copilotDir, variantId);
    const stepDirs = await listStepDirectories(variantPath);

    if (stepDirs.length === 0) {
      warnings.push(`No step directories found in variant: ${variantId}`);
    }

    for (const { name: stepName, index: stepIndex } of stepDirs) {
      const stepPath = join(variantPath, stepName);
      const sessionPath = await findSessionStatePath(stepPath);

      if (sessionPath) {
        steps.push({ variantId, stepIndex, sessionPath });
      } else {
        warnings.push(`No session-state directory found in ${variantId}/${stepName}`);
      }
    }
  }

  return { steps, warnings };
}

/**
 * List directories matching `step-<N>` pattern, sorted numerically by N.
 */
async function listStepDirectories(
  variantPath: string,
): Promise<readonly { name: string; index: number }[]> {
  const entries = await listSortedDirectories(variantPath);
  const stepPattern = /^step-(\d+)$/;

  const matched = entries
    .map((name) => {
      const match = stepPattern.exec(name);
      return match ? { name, index: Number(match[1]) } : null;
    })
    .filter((entry): entry is { name: string; index: number } => entry !== null);

  // Sort by step index numerically
  matched.sort((a, b) => a.index - b.index);
  return matched;
}

/**
 * Find the session-state/<uuid>/ directory inside a step directory.
 * Returns the path to the uuid directory (for parseCopilotCliSession).
 */
async function findSessionStatePath(stepPath: string): Promise<string | null> {
  const sessionStateDir = join(stepPath, 'session-state');

  if (!(await isDirectory(sessionStateDir))) {
    return null;
  }

  // Find the first UUID directory inside session-state/
  const uuidDirs = await listSortedDirectories(sessionStateDir);

  if (uuidDirs.length === 0) {
    return null;
  }

  // Use the first directory (typically only one)
  const firstDir = uuidDirs[0];
  if (!firstDir) {
    return null;
  }
  return join(sessionStateDir, firstDir);
}

/**
 * List direct child directories, sorted alphabetically.
 */
async function listSortedDirectories(parentDir: string): Promise<string[]> {
  try {
    const entries = await readdir(parentDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Check if a path is an existing directory.
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
