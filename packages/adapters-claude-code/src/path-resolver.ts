/**
 * Path resolver for Claude Code session files.
 *
 * Claude Code stores session history under:
 *   - macOS/Linux: `~/.claude/projects/<project>/<uuid>.jsonl`
 *   - Windows:     `%USERPROFILE%\.claude\projects\<project>\<uuid>.jsonl`
 *
 * Each project directory represents one repository/workspace; each `.jsonl`
 * file is one conversation session.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';

import type { DiscoveredSession, DiscoveryResult } from './types.js';

/**
 * Return the root Claude Code projects directory for the current platform.
 *
 * @returns Absolute path to `~/.claude/projects/` (or Windows equivalent).
 */
export function getClaudeProjectsDir(): string {
  const home = homedir();
  if (platform === 'win32') {
    return join(home, '.claude', 'projects');
  }
  return join(home, '.claude', 'projects');
}

/**
 * Discover all Claude Code session files under the Claude projects directory.
 *
 * Non-existent directories are handled gracefully — an empty result is
 * returned rather than throwing.
 */
export function discoverSessions(): DiscoveryResult {
  const projectsDir = getClaudeProjectsDir();
  return discoverSessionsFromDir(projectsDir);
}

/**
 * Discover all Claude Code session files under an explicit directory.
 *
 * This overload is used by tests and the source constructor to bypass the
 * platform home directory lookup.
 */
export function discoverSessionsFromDir(projectsDir: string): DiscoveryResult {
  const sessions: DiscoveredSession[] = [];
  const errors: string[] = [];

  let projectEntries: string[];
  try {
    projectEntries = readdirSync(projectsDir);
  } catch {
    // Directory does not exist or is not accessible
    return { sessions, errors };
  }

  for (const entry of projectEntries) {
    const projectDir = join(projectsDir, entry);

    let sessionFiles: string[];
    try {
      sessionFiles = readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      errors.push(`Cannot read project directory: ${projectDir}`);
      continue;
    }

    for (const file of sessionFiles) {
      const filePath = join(projectDir, file);
      const sessionId = extractSessionId(filePath, file);
      const cwd = extractCwd(filePath);
      sessions.push({ filePath, sessionId, projectDir, cwd });
    }
  }

  return { sessions, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Attempt to extract the session ID from the first line of a JSONL file.
 * Falls back to the filename (without extension) if not found.
 */
function extractSessionId(filePath: string, filename: string): string {
  try {
    const content = readFileSync(filePath, { encoding: 'utf-8' });
    const firstLine = content.split('\n')[0] ?? '';
    const parsed: unknown = JSON.parse(firstLine.trim());
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj['session_id'] === 'string' && obj['session_id']) {
        return obj['session_id'];
      }
    }
  } catch {
    // Fall through to filename fallback
  }
  return filename.replace(/\.jsonl$/, '');
}

/**
 * Attempt to extract the `cwd` from the first event that carries it.
 * Returns null if not found.
 */
function extractCwd(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, { encoding: 'utf-8' });
    for (const line of content.split('\n')) {
      const stripped = line.trim();
      if (!stripped) continue;
      try {
        const parsed: unknown = JSON.parse(stripped);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj['cwd'] === 'string' && obj['cwd']) {
            return obj['cwd'];
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Cannot read file
  }
  return null;
}
