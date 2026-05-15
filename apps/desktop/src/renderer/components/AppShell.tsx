import type { SyncStatusIpc } from '@agent-profiler/core';
import { MainMenu } from '@epam/loveship';
import { FlexSpacer, MainMenuButton, Tooltip } from '@epam/uui';
import { MainMenuCustomElement } from '@epam/uui-components';
import type { AdaptiveItemProps } from '@epam/uui-components';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import epamLogo from '@/assets/epam-white.png';
import { MoonIcon, SunIcon } from '@/components/icons';
import { useTheme } from '@/components/useTheme';

export interface AppShellProps {
  children: ReactNode;
}

/** Small pill shown in the header bar reflecting the current sync state. */
function SyncStatusPill({ status }: { readonly status: SyncStatusIpc | null }) {
  if (!status || status.state === 'idle') return null;

  if (status.state === 'scanning' || status.state === 'pushing') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 10,
          paddingRight: 10,
          height: 24,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: 12,
        }}
        aria-label="Sync in progress"
      >
        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Syncing…</span>
      </div>
    );
  }

  if (status.state === 'error') {
    const errorMsg = status.lastError ?? 'Sync failed';
    return (
      <Tooltip content={errorMsg} placement="bottom">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 10,
            paddingRight: 10,
            height: 24,
            borderRadius: 12,
            background: 'rgba(229,67,34,0.25)',
            color: 'rgba(255,180,160,1)',
            fontSize: 12,
            cursor: 'default',
          }}
          aria-label={`Sync error: ${errorMsg}`}
        >
          <AlertTriangle size={12} />
          <span>Sync error</span>
        </div>
      </Tooltip>
    );
  }

  return null;
}

/**
 * Application shell providing the EPAM-branded header bar and a content area.
 *
 * The header uses the Loveship `MainMenu` component in its default dark colour
 * scheme and includes:
 * - An EPAM logo / app title on the left
 * - A dark/light theme toggle on the right
 *
 * Page content is rendered below the header via `children`.
 */
export function AppShell({ children }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [syncStatus, setSyncStatus] = useState<SyncStatusIpc | null>(null);

  // Fetch initial sync status and subscribe to push updates
  useEffect(() => {
    void window.electronApi.sync.getStatus().then(setSyncStatus).catch(() => undefined);
    const unsub = window.electronApi.sync.onStatusUpdated(setSyncStatus);
    return unsub;
  }, []);

  const menuItems: AdaptiveItemProps[] = useMemo(
    () => [
      {
        id: 'logo',
        priority: 99,
        render: () => (
          <MainMenuCustomElement key="logo">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                paddingLeft: 12,
                paddingRight: 12,
              }}
            >
              <img src={epamLogo} alt="EPAM" style={{ height: 20 }} />
              <span
                style={{
                  width: 1,
                  height: 18,
                  backgroundColor: 'rgba(255,255,255,0.3)',
                }}
              />
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
                Agent Profiler
              </span>
            </div>
          </MainMenuCustomElement>
        ),
      },
      {
        id: 'spacer',
        priority: 1,
        render: () => <FlexSpacer key="spacer" />,
      },
      {
        id: 'sync-status',
        priority: 97,
        render: () => (
          <MainMenuCustomElement key="sync-status">
            <SyncStatusPill status={syncStatus} />
          </MainMenuCustomElement>
        ),
      },
      {
        id: 'theme-toggle',
        priority: 98,
        render: () => (
          <MainMenuButton
            key="theme-toggle"
            caption={theme === 'light' ? 'Dark mode' : 'Light mode'}
            icon={theme === 'light' ? MoonIcon : SunIcon}
            onClick={toggleTheme}
            rawProps={{
              'aria-label': `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`,
            }}
          />
        ),
      },
    ],
    [theme, toggleTheme, syncStatus],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <MainMenu items={menuItems} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
