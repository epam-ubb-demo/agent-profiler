import React, { useCallback, useEffect, useState } from 'react';

import { Button, FlexRow, Text } from '@epam/uui';

/**
 * State shape received from the main process via IPC.
 */
export interface UpdateNotificationState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info: { version: string; releaseDate?: string } | null;
  progress: { percent: number; bytesPerSecond: number; transferred: number; total: number } | null;
  error: string | null;
  skippedVersion: string | null;
}

/**
 * IPC bridge interface — implemented by the preload script.
 */
export interface UpdaterIpc {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<void>;
  installAndRestart(): void;
  getStatus(): Promise<UpdateNotificationState>;
  skipVersion(version: string): void;
  onStatusChanged(callback: (state: UpdateNotificationState) => void): () => void;
}

export interface UpdateNotificationProps {
  /** IPC bridge for communicating with the main process */
  ipc: UpdaterIpc;
  /** Custom class name for the container */
  className?: string;
}

/**
 * Non-intrusive update notification banner.
 *
 * Shows when an update is available, displays download progress,
 * and provides Install & Restart / Later / Skip buttons.
 */
export function UpdateNotification({ ipc, className = '' }: UpdateNotificationProps): React.ReactElement | null {
  const [state, setState] = useState<UpdateNotificationState>({
    status: 'idle',
    info: null,
    progress: null,
    error: null,
    skippedVersion: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Get initial status
    ipc.getStatus().then(setState).catch(() => {});

    // Subscribe to status changes
    const unsubscribe = ipc.onStatusChanged((newState) => {
      setState(newState);
      // Show banner again when a new update is detected
      if (newState.status === 'available' || newState.status === 'downloaded') {
        setDismissed(false);
      }
    });

    return unsubscribe;
  }, [ipc]);

  const handleDownload = useCallback(() => {
    ipc.downloadUpdate();
  }, [ipc]);

  const handleInstall = useCallback(() => {
    ipc.installAndRestart();
  }, [ipc]);

  const handleLater = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleSkip = useCallback(() => {
    if (state.info?.version) {
      ipc.skipVersion(state.info.version);
      setDismissed(true);
    }
  }, [ipc, state.info]);

  // Don't render if dismissed or in idle/checking/not-available states
  if (dismissed) return null;
  if (state.status === 'idle' || state.status === 'checking' || state.status === 'not-available') {
    return null;
  }

  return (
    <div
      className={`update-notification ${className}`}
      role="alert"
      aria-live="polite"
      data-testid="update-notification"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        maxWidth: '400px',
        padding: '1rem',
        borderRadius: '0.5rem',
        backgroundColor: 'var(--uui-surface-higher)',
        color: 'var(--uui-text-primary)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 9999,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.875rem',
      }}
    >
      {state.status === 'available' && state.info && (
        <>
          <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: '0.75rem' } }}>
            Update available: v{state.info.version}
          </Text>
          <FlexRow columnGap="6" rawProps={{ style: { flexWrap: 'wrap' } }}>
            <Button color="primary" caption="Download" onClick={handleDownload} size="30" />
            <Button color="secondary" fill="outline" caption="Later" onClick={handleLater} size="30" />
            <Button color="secondary" fill="ghost" caption="Skip this version" onClick={handleSkip} size="30" />
          </FlexRow>
        </>
      )}

      {state.status === 'downloading' && state.progress && (
        <>
          <Text size="24" rawProps={{ style: { marginBottom: '0.5rem' } }}>
            Downloading update… {Math.round(state.progress.percent)}%
          </Text>
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              backgroundColor: 'var(--uui-neutral-30)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${state.progress.percent}%`,
                backgroundColor: 'var(--uui-info-50)',
                transition: 'width 0.3s ease',
              }}
              role="progressbar"
              aria-valuenow={state.progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </>
      )}

      {state.status === 'downloaded' && state.info && (
        <>
          <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: '0.75rem' } }}>
            Ready to install: v{state.info.version}
          </Text>
          <FlexRow columnGap="6" rawProps={{ style: { flexWrap: 'wrap' } }}>
            <Button color="primary" caption="Install &amp; Restart" onClick={handleInstall} size="30" />
            <Button color="secondary" fill="outline" caption="Later" onClick={handleLater} size="30" />
          </FlexRow>
        </>
      )}

      {state.status === 'error' && (
        <>
          <Text size="24" color="critical" rawProps={{ style: { marginBottom: '0.5rem' } }}>
            Update error: {state.error ?? 'Unknown error'}
          </Text>
          <Button color="secondary" fill="outline" caption="Dismiss" onClick={handleLater} size="30" />
        </>
      )}
    </div>
  );
}

