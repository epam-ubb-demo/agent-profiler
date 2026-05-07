/**
 * React hooks for session data access via IPC.
 *
 * These hooks run in the Electron renderer process and communicate
 * with the main process through the preload bridge.
 */

import type { Session } from '@agent-profiler/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { SessionListItem } from '../types';

/** Shape of the IPC bridge exposed via window.electronApi */
interface ElectronSessionApi {
  session: {
    list: () => Promise<SessionListItem[]>;
    open: (sessionId: string) => Promise<Session | null>;
    setRootDir: (dir: string) => Promise<boolean>;
  };
}

function getApi(): ElectronSessionApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).electronApi as ElectronSessionApi;
}

/** Query key factory for session-related queries. */
export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => [...sessionKeys.all, 'list'] as const,
  list: () => [...sessionKeys.lists()] as const,
  details: () => [...sessionKeys.all, 'detail'] as const,
  detail: (id: string) => [...sessionKeys.details(), id] as const,
};

/**
 * Fetches the list of available sessions via IPC.
 * Automatically refetches when the query is invalidated (e.g., after root dir change).
 */
export function useSessionList() {
  return useQuery({
    queryKey: sessionKeys.list(),
    queryFn: async () => {
      const api = getApi();
      return api.session.list();
    },
  });
}

/**
 * Fetches a single session by ID via IPC.
 * Only runs when sessionId is provided (enabled: !!sessionId).
 */
export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId ?? ''),
    queryFn: async () => {
      if (!sessionId) return null;
      const api = getApi();
      return api.session.open(sessionId);
    },
    enabled: !!sessionId,
  });
}

/**
 * Mutation to change the root scan directory.
 * Invalidates the session list cache on success.
 */
export function useSetRootDir() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dir: string) => {
      const api = getApi();
      return api.session.setRootDir(dir);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.lists() });
    },
  });
}
