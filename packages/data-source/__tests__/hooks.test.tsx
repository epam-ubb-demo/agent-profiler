/**
 * Unit tests for session React hooks.
 *
 * Mocks the global electronApi to test hook behavior in isolation.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useSessionList, useSession, useSetRootDir } from '../src/hooks/index';

// Mock electronApi on globalThis
const mockApi = {
  session: {
    list: vi.fn(),
    open: vi.fn(),
    setRootDir: vi.fn(),
    onListUpdated: vi.fn(),
  },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('Session hooks', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).electronApi = mockApi;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).electronApi;
  });

  describe('useSessionList', () => {
    it('fetches session list via IPC', async () => {
      const mockItems = [
        { id: 's1', name: 's1', path: '/p/s1', createdAt: '2025-01-01T00:00:00.000Z', adapter: 'copilot-cli' as const },
      ];
      mockApi.session.list.mockResolvedValue(mockItems);
      mockApi.session.onListUpdated.mockReturnValue(() => {});

      const { result } = renderHook(() => useSessionList(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockItems);
      expect(mockApi.session.list).toHaveBeenCalledOnce();
    });

    it('handles errors gracefully', async () => {
      mockApi.session.list.mockRejectedValue(new Error('IPC failure'));
      mockApi.session.onListUpdated.mockReturnValue(() => {});

      const { result } = renderHook(() => useSessionList(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
    });

    it('subscribes to push updates via onListUpdated', async () => {
      const mockItems = [
        { id: 's1', name: 's1', path: '/p/s1', createdAt: '2025-01-01T00:00:00.000Z', adapter: 'copilot-cli' as const },
      ];
      mockApi.session.list.mockResolvedValue(mockItems);

      let updateCallback: ((sessions: typeof mockItems) => void) | null = null;

      // Create a persistent QueryClient for this test
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      mockApi.session.onListUpdated.mockImplementation((callback) => {
        updateCallback = callback;
        return vi.fn(); // Return unsubscribe function
      });

      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useSessionList(), { wrapper });

      // Wait for initial fetch
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify onListUpdated was called during hook setup
      expect(mockApi.session.onListUpdated).toHaveBeenCalledOnce();
      expect(result.current.data).toEqual(mockItems);

      // Simulate a push update from main process
      const updatedItems = [
        { id: 's1', name: 's1-updated', path: '/p/s1', createdAt: '2025-01-01T00:00:00.000Z', adapter: 'copilot-cli' as const },
        { id: 's2', name: 's2', path: '/p/s2', createdAt: '2025-01-02T00:00:00.000Z', adapter: 'copilot-cli' as const },
      ];

      // Wrap the callback execution in act to ensure React updates are handled properly
      await act(async () => {
        updateCallback?.(updatedItems);
      });

      // Verify hook data is updated without refetch
      await waitFor(() => {
        expect(result.current.data).toEqual(updatedItems);
      });

      // The initial fetch count should still be 1 (no refetch on push update)
      expect(mockApi.session.list).toHaveBeenCalledOnce();
    });

    it('cleans up subscription on unmount', async () => {
      const mockItems = [
        { id: 's1', name: 's1', path: '/p/s1', createdAt: '2025-01-01T00:00:00.000Z', adapter: 'copilot-cli' as const },
      ];
      mockApi.session.list.mockResolvedValue(mockItems);

      const unsubscribe = vi.fn();
      mockApi.session.onListUpdated.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useSessionList(), { wrapper: createWrapper() });

      // Wait for initial setup
      await waitFor(() => {
        expect(mockApi.session.onListUpdated).toHaveBeenCalledOnce();
      });

      // Unmount should call the unsubscribe function
      unmount();

      expect(unsubscribe).toHaveBeenCalledOnce();
    });
  });

  describe('useSession', () => {
    it('fetches a single session by ID', async () => {
      const mockSession = { sessionId: 'sess-1', parseStatus: { status: 'ok', error: null } };
      mockApi.session.open.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useSession('sess-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockSession);
      expect(mockApi.session.open).toHaveBeenCalledWith('sess-1');
    });

    it('does not fetch when sessionId is undefined', () => {
      const { result } = renderHook(() => useSession(undefined), { wrapper: createWrapper() });

      expect(result.current.fetchStatus).toBe('idle');
      expect(mockApi.session.open).not.toHaveBeenCalled();
    });
  });

  describe('useSetRootDir', () => {
    it('calls setRootDir via IPC', async () => {
      mockApi.session.setRootDir.mockResolvedValue(true);

      const { result } = renderHook(() => useSetRootDir(), { wrapper: createWrapper() });

      result.current.mutate('/new/path');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(true);
      expect(mockApi.session.setRootDir).toHaveBeenCalledWith('/new/path');
    });
  });
});
