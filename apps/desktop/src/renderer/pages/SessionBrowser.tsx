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
      <div data-testid="session-browser-loading" className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return <EmptyState onOpenFolder={handleOpenFolder} />;
  }

  return (
    <div data-testid="session-browser" className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sessions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Folder…
          </Button>
          <SettingsPanel onSettingsSaved={handleSettingsSaved} />
        </div>
      </div>
      <ul className="flex flex-col gap-2" data-testid="session-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              className="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted"
              onClick={() => onSelectSession(session.id)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{session.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                  {session.adapter}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(session.createdAt).toLocaleString()}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
