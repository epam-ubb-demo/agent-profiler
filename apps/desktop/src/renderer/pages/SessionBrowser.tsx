import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { SessionListItemIpc } from '../../preload/api';

import { EmptyState } from '@/components/EmptyState';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Button } from '@/components/ui/button';

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
      <div data-testid="session-browser-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '0.875rem', color: '#6C6F80' }}>Loading sessions…</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return <EmptyState onOpenFolder={handleOpenFolder} />;
  }

  return (
    <div data-testid="session-browser" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Sessions</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={handleOpenFolder}>
            <FolderOpen style={{ marginRight: '0.5rem', height: '1rem', width: '1rem' }} />
            Open Folder…
          </Button>
          <SettingsPanel onSettingsSaved={handleSettingsSaved} />
        </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }} data-testid="session-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              style={{
                width: '100%',
                borderRadius: '0.375rem',
                border: '1px solid #E1E3EB',
                padding: '0.75rem',
                textAlign: 'left',
                background: 'none',
                cursor: 'pointer',
              }}
              onClick={() => onSelectSession(session.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500 }}>{session.name}</span>
                <span style={{
                  borderRadius: '0.25rem',
                  backgroundColor: '#F5F6FA',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}>
                  {session.adapter}
                </span>
              </div>
              <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#6C6F80' }}>
                {new Date(session.createdAt).toLocaleString()}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
