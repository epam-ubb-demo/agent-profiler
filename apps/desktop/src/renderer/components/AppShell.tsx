import { MainMenu } from '@epam/loveship';
import { FlexSpacer, MainMenuButton } from '@epam/uui';
import { MainMenuCustomElement } from '@epam/uui-components';
import type { AdaptiveItemProps } from '@epam/uui-components';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { MoonIcon, SunIcon } from '@/components/icons';
import { useTheme } from '@/components/useTheme';

export interface AppShellProps {
  children: ReactNode;
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
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: 2,
                  color: '#fff',
                }}
              >
                EPAM
              </span>
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
    [theme, toggleTheme],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <MainMenu items={menuItems} />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{children}</div>
    </div>
  );
}
