/**
 * useSourceDiscovery — hook that manages discovery status for enabled sources.
 *
 * Triggers discovery when sources are enabled and returns a status map.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DiscoverFn, DiscoveryStatus, SourceType } from './types';

/** Map from source type to its discovery status. */
export type DiscoveryStatusMap = Record<SourceType, DiscoveryStatus>;

export interface UseSourceDiscoveryOptions {
  /** Currently enabled source types. */
  readonly enabledSources: readonly SourceType[];
  /** Discovery function (injected for testability). */
  readonly discover: DiscoverFn;
}

export interface UseSourceDiscoveryReturn {
  /** Current discovery status for each source. */
  readonly statusMap: DiscoveryStatusMap;
  /** Manually trigger re-scan for a specific source. */
  readonly rescan: (type: SourceType) => void;
}

const INITIAL_STATUS: DiscoveryStatus = { state: 'idle' };

function createInitialMap(): DiscoveryStatusMap {
  return {
    'copilot-cli': INITIAL_STATUS,
    'vscode-chat': INITIAL_STATUS,
    'vscode-coding-agent': INITIAL_STATUS,
    'ctb': INITIAL_STATUS,
  };
}

export function useSourceDiscovery({
  enabledSources,
  discover,
}: UseSourceDiscoveryOptions): UseSourceDiscoveryReturn {
  const [statusMap, setStatusMap] = useState<DiscoveryStatusMap>(createInitialMap);

  // Track abort for cleanup
  const abortRef = useRef<AbortController | null>(null);

  const runDiscovery = useCallback(
    async (type: SourceType, signal: AbortSignal) => {
      setStatusMap((prev) => ({ ...prev, [type]: { state: 'scanning' } }));

      try {
        const result = await discover(type);
        if (signal.aborted) return;
        setStatusMap((prev) => ({
          ...prev,
          [type]: { state: 'found', count: result.count, path: result.path },
        }));
      } catch (err) {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        setStatusMap((prev) => ({
          ...prev,
          [type]: { state: 'error', message },
        }));
      }
    },
    [discover],
  );

  useEffect(() => {
    // Abort previous discovery run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset disabled sources to idle, trigger enabled ones
    setStatusMap((prev) => {
      const next = { ...prev };
      const allTypes: SourceType[] = ['copilot-cli', 'vscode-chat', 'vscode-coding-agent', 'ctb'];
      for (const type of allTypes) {
        if (!enabledSources.includes(type)) {
          next[type] = INITIAL_STATUS;
        }
      }
      return next;
    });

    for (const type of enabledSources) {
      void runDiscovery(type, controller.signal);
    }

    return () => {
      controller.abort();
    };
  }, [enabledSources, runDiscovery]);

  const rescan = useCallback(
    (type: SourceType) => {
      if (!enabledSources.includes(type)) return;
      const controller = new AbortController();
      void runDiscovery(type, controller.signal);
    },
    [enabledSources, runDiscovery],
  );

  return { statusMap, rescan };
}
