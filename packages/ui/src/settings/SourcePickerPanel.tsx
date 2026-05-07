/**
 * SourcePickerPanel — settings panel for enabling/disabling session sources.
 *
 * Lists all 4 sources with toggles and discovery status indicators.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { SourceCard } from './SourceCard';
import type { DiscoverFn, SourceConfig, SourceType } from './types';
import { useSourceDiscovery } from './useSourceDiscovery';

/** Default source configurations. */
const DEFAULT_SOURCES: readonly SourceConfig[] = [
  {
    type: 'copilot-cli',
    label: 'Copilot CLI',
    description: 'Sessions from ~/.copilot/session-state/',
    enabled: true,
  },
  {
    type: 'vscode-chat',
    label: 'VS Code Chat',
    description: 'Workspace storage transcripts from VS Code chat sessions',
    enabled: true,
  },
  {
    type: 'vscode-coding-agent',
    label: 'VS Code Coding Agent',
    description: 'Coding agent sessions classified by heuristic from workspace storage',
    enabled: true,
  },
  {
    type: 'ctb',
    label: 'CTB Benchmark',
    description: 'User-selected directories containing benchmark sessions',
    enabled: false,
  },
];

const STORAGE_KEY = 'agent-profiler:source-picker:enabled';

export interface SourcePickerPanelProps {
  /** Discovery function (injected for testability). */
  readonly discover: DiscoverFn;
  /** Called when the set of enabled sources changes. */
  readonly onSourcesChanged?: (enabledSources: SourceType[]) => void;
  /** Optional localStorage key override for persistence. */
  readonly storageKey?: string;
  /** Optional initial source configs (overrides defaults). */
  readonly initialSources?: readonly SourceConfig[];
}

export function SourcePickerPanel({
  discover,
  onSourcesChanged,
  storageKey = STORAGE_KEY,
  initialSources,
}: SourcePickerPanelProps) {
  const [sources, setSources] = useState<SourceConfig[]>(() => {
    const base = initialSources ?? DEFAULT_SOURCES;
    // Restore persisted preferences
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const enabled: SourceType[] = JSON.parse(stored);
        return base.map((s) => ({ ...s, enabled: enabled.includes(s.type) }));
      }
    } catch {
      // Ignore parse errors
    }
    return [...base];
  });

  const enabledSources = useMemo(
    () => sources.filter((s) => s.enabled).map((s) => s.type),
    [sources],
  );

  const { statusMap } = useSourceDiscovery({ enabledSources, discover });

  // Persist enabled sources
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(enabledSources));
    } catch {
      // Ignore storage errors
    }
  }, [enabledSources, storageKey]);

  // Notify parent of changes
  useEffect(() => {
    onSourcesChanged?.(enabledSources);
  }, [enabledSources, onSourcesChanged]);

  const handleToggle = useCallback((type: SourceType, enabled: boolean) => {
    setSources((prev) =>
      prev.map((s) => (s.type === type ? { ...s, enabled } : s)),
    );
  }, []);

  return (
    <div data-testid="source-picker-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>Session Sources</h2>
      {sources.map((source) => (
        <SourceCard
          key={source.type}
          source={source}
          status={statusMap[source.type]}
          onToggle={(enabled) => handleToggle(source.type, enabled)}
        />
      ))}
    </div>
  );
}
