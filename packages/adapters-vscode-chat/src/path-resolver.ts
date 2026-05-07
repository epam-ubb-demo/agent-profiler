/**
 * Path resolver — discovers VS Code Copilot Chat transcript files on disk.
 *
 * Walks the VS Code workspace storage directories to find
 * `GitHub.copilot-chat/transcripts/*.jsonl` files.
 *
 * Supports macOS, Windows, and Linux.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveredSession {
  /** Absolute path to the transcript JSONL file. */
  readonly filePath: string;
  /** Session ID derived from the filename (without .jsonl extension). */
  readonly sessionId: string;
  /** Workspace storage directory this session belongs to. */
  readonly workspaceDir: string;
  /** VS Code variant (stable or insiders). */
  readonly variant: 'stable' | 'insiders';
}

export interface DiscoveryResult {
  readonly sessions: DiscoveredSession[];
  readonly errors: string[];
}

// ---------------------------------------------------------------------------
// Platform-specific base paths
// ---------------------------------------------------------------------------

interface PlatformPaths {
  variant: 'stable' | 'insiders';
  basePath: string;
}

/**
 * Get the workspace storage base paths for the current platform.
 */
export function getWorkspaceStoragePaths(
  os: string = platform(),
  home: string = homedir(),
): PlatformPaths[] {
  switch (os) {
    case 'darwin':
      return [
        { variant: 'stable', basePath: join(home, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage') },
        { variant: 'insiders', basePath: join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'workspaceStorage') },
      ];
    case 'win32':
      return [
        { variant: 'stable', basePath: join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage') },
        { variant: 'insiders', basePath: join(home, 'AppData', 'Roaming', 'Code - Insiders', 'User', 'workspaceStorage') },
      ];
    case 'linux':
      return [
        { variant: 'stable', basePath: join(home, '.config', 'Code', 'User', 'workspaceStorage') },
        { variant: 'insiders', basePath: join(home, '.config', 'Code - Insiders', 'User', 'workspaceStorage') },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const EXTENSION_DIR = 'GitHub.copilot-chat';
const TRANSCRIPTS_DIR = 'transcripts';

/**
 * Discover all VS Code Copilot Chat transcript files on the current system.
 *
 * Scans known workspace storage paths for each platform, looking for
 * the `GitHub.copilot-chat/transcripts/*.jsonl` directory structure.
 *
 * @param os - Override platform for testing (defaults to os.platform())
 * @param home - Override home directory for testing (defaults to os.homedir())
 */
export function discoverSessions(
  os?: string,
  home?: string,
): DiscoveryResult {
  const sessions: DiscoveredSession[] = [];
  const errors: string[] = [];
  const platformPaths = getWorkspaceStoragePaths(os, home);

  for (const { variant, basePath } of platformPaths) {
    if (!existsSync(basePath)) continue;

    let workspaceDirs: string[];
    try {
      workspaceDirs = readdirSync(basePath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to read workspace storage: ${msg}`);
      continue;
    }

    for (const wsDir of workspaceDirs) {
      const transcriptsPath = join(basePath, wsDir, EXTENSION_DIR, TRANSCRIPTS_DIR);
      if (!existsSync(transcriptsPath)) continue;

      let files: string[];
      try {
        files = readdirSync(transcriptsPath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to read transcripts directory: ${msg}`);
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;

        const filePath = join(transcriptsPath, file);
        try {
          const stat = statSync(filePath);
          if (!stat.isFile()) continue;
        } catch {
          continue;
        }

        sessions.push({
          filePath,
          sessionId: file.replace(/\.jsonl$/, ''),
          workspaceDir: wsDir,
          variant,
        });
      }
    }
  }

  return { sessions, errors };
}
