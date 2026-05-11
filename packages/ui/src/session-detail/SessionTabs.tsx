/**
 * SessionTabs — horizontal tab bar using UUI Tabs for switching
 * between themed content panels in the session detail view.
 */

import type { TabsItemProps } from '@epam/uui';
import { Tabs } from '@epam/uui';
import { memo, useMemo } from 'react';

import styles from './session-detail.module.css';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** Ordered identifiers for the four content tabs. */
export const TAB_IDS = ['overview', 'cost-models', 'tools', 'timeline'] as const;

/** Union type of valid tab identifiers. */
export type TabId = (typeof TAB_IDS)[number];

/** Human-readable captions keyed by tab id. */
const TAB_CAPTIONS: Record<TabId, string> = {
  'overview': 'Overview',
  'cost-models': 'Cost & Models',
  'tools': 'Tools',
  'timeline': 'Timeline',
};

/** Props for the {@link SessionTabs} component. */
export interface SessionTabsProps {
  readonly activeTab: TabId;
  readonly onTabChange: (tab: TabId) => void;
  /** Which tabs have notable issues — drives notify dot display. */
  readonly tabNotifications: Partial<Record<TabId, boolean>>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function SessionTabsInner({ activeTab, onTabChange, tabNotifications }: SessionTabsProps) {
  const items: TabsItemProps[] = useMemo(
    () =>
      TAB_IDS.map((id) => ({
        id,
        caption: TAB_CAPTIONS[id],
        size: '48' as const,
        withNotify: tabNotifications[id] ?? false,
      })),
    [tabNotifications],
  );

  return (
    <div className={styles['tabBar']} data-testid="session-tabs">
      <Tabs
        value={activeTab}
        onValueChange={onTabChange as (id: string) => void}
        items={items}
      />
    </div>
  );
}

/** Horizontal tab bar for session detail content panels. */
export const SessionTabs = memo(SessionTabsInner);
SessionTabs.displayName = 'SessionTabs';
