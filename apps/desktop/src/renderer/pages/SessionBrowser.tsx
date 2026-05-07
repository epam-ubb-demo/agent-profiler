import { Badge, Button, FlexRow, Panel, Spinner, Text } from '@epam/uui';
import { useCallback, useEffect, useState } from 'react';

import type { SessionListItemIpc } from '../../preload/api';

import { EmptyState } from '@/components/EmptyState';
import { FolderOpenIcon } from '@/components/icons';
import { SettingsPanel } from '@/components/SettingsPanel';

export interface SessionBrowserProps {
  /** Called when the user selects a session to view. */
  readonly onSelectSession: (sessionId: string) => void;
}

export function SessionBrowser({ onSelectSession }: SessionBrowserProps) {
  const [sessions, setSessions] = useState<SessionListItemIpc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.electronApi.session.list();
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleOpenFolder = useCallback(async () => {
    const path = await window.electronApi.dialog.openDirectory();
    if (path) {
      const success = await window.electronApi.session.setRootDir(path);
      if (success) {
        await loadSessions();
      }
    }
  }, [loadSessions]);

  const handleSettingsSaved = useCallback(() => {
    void loadSessions();
  }, [loadSessions]);

  if (loading) {
    return (
      <FlexRow justifyContent="center" padding="24" rawProps={{ 'data-testid': 'session-browser-loading' }}>
        <Spinner />
      </FlexRow>
    );
  }

  if (sessions.length === 0) {
    return <EmptyState onOpenFolder={handleOpenFolder} />;
  }

  return (
    <div data-testid="session-browser" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px' }}>
      <FlexRow alignItems="center" spacing="12">
        <Text size="42" fontWeight="600">Sessions</Text>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button fill="outline" size="30" icon={FolderOpenIcon} caption="Open Folder…" onClick={handleOpenFolder} />
          <SettingsPanel onSettingsSaved={handleSettingsSaved} />
        </div>
      </FlexRow>
      <div data-testid="session-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sessions.map((session) => (
          <Panel key={session.id} shadow onClick={() => onSelectSession(session.id)}>
            <FlexRow padding="12" spacing="12" alignItems="center">
              <Text size="30" fontWeight="600">{session.name}</Text>
              <div style={{ marginLeft: 'auto' }}>
                <Badge color="info" fill="outline" caption={session.adapter} size="18" />
              </div>
            </FlexRow>
            <FlexRow padding="12">
              <Text size="18" color="secondary">
                {new Date(session.createdAt).toLocaleString()}
              </Text>
            </FlexRow>
          </Panel>
        ))}
      </div>
    </div>
  );
}
