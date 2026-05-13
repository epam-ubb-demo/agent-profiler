import { execFile } from 'node:child_process';

import { logAnalyticsWorkspaceSchema } from '@agent-profiler/core';
import type { ListWorkspacesResultIpc } from '@agent-profiler/core';
import { z } from 'zod';

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB — large tenants can have many workspaces

/** Shape of a single workspace entry in `az monitor log-analytics workspace list` output. */
const azWorkspaceSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  resourceGroup: z.string().optional(),
  location: z.string(),
  id: z.string().optional(), // ARM resource ID — used to extract resourceGroup as fallback
});

/** Extract resource group from an ARM resource ID. */
function extractResourceGroup(armId: string): string {
  const match = /\/resourceGroups\/([^/]+)/i.exec(armId);
  return match?.[1] ?? 'unknown';
}

/** Run `az` CLI and return stdout. Handles platform differences (az.cmd on Windows). */
function runAzCli(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32';
    execFile('az', [...args], { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, shell: useShell }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr?.trim() || error.message;

        if (error.code === 'ENOENT' || msg.includes('not found') || msg.includes('is not recognized')) {
          reject(new Error(
            'Azure CLI was not found. Install Azure CLI (https://aka.ms/installazurecli) or enter the Workspace ID manually.',
          ));
          return;
        }

        if (msg.includes('az login') || msg.includes('Please run \'az login\'') || msg.includes('AADSTS')) {
          reject(new Error(
            'Azure CLI is not logged in. Run `az login` in a terminal, then try again.',
          ));
          return;
        }

        if ((error as NodeJS.ErrnoException).killed) {
          reject(new Error(
            'Azure CLI did not respond in time. Check your network connection and Azure CLI login.',
          ));
          return;
        }

        reject(new Error(`Azure CLI error: ${msg}`));
        return;
      }

      resolve(stdout);
    });
  });
}

/**
 * Discover available Log Analytics workspaces using `az monitor log-analytics workspace list`.
 * Also fetches the current subscription name for display context.
 */
export async function listLogAnalyticsWorkspaces(): Promise<ListWorkspacesResultIpc> {
  try {
    const [workspacesJson, subscriptionJson] = await Promise.all([
      runAzCli(['monitor', 'log-analytics', 'workspace', 'list', '--output', 'json']),
      runAzCli(['account', 'show', '--output', 'json', '--query', '{name: name}']),
    ]);

    let subscriptionName = 'unknown';
    try {
      const sub = JSON.parse(subscriptionJson);
      if (typeof sub.name === 'string') {
        subscriptionName = sub.name;
      }
    } catch {
      // Non-critical — fall back to 'unknown'
    }

    const raw: unknown = JSON.parse(workspacesJson);
    if (!Array.isArray(raw)) {
      return { success: false, error: 'Unexpected Azure CLI output format.' };
    }

    const workspaces = raw
      .map((entry) => {
        const parsed = azWorkspaceSchema.safeParse(entry);
        if (!parsed.success) return null;
        const rg = parsed.data.resourceGroup ?? (parsed.data.id ? extractResourceGroup(parsed.data.id) : 'unknown');
        return logAnalyticsWorkspaceSchema.parse({
          customerId: parsed.data.customerId,
          name: parsed.data.name,
          resourceGroup: rg,
          location: parsed.data.location,
          subscriptionName,
        });
      })
      .filter((w): w is NonNullable<typeof w> => w !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (workspaces.length === 0) {
      return { success: false, error: 'No Log Analytics workspaces found in the current Azure subscription.' };
    }

    return { success: true, workspaces };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list workspaces.',
    };
  }
}
