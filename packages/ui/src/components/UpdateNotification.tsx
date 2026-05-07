import React, { useCallback, useEffect, useState } from 'react';

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
        backgroundColor: 'var(--update-bg, #1e293b)',
        color: 'var(--update-fg, #f8fafc)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 9999,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.875rem',
      }}
    >
      {state.status === 'available' && state.info && (
        <>
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong>Update available:</strong> v{state.info.version}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={handleDownload} style={buttonStyle('primary')}>
              Download
            </button>
            <button onClick={handleLater} style={buttonStyle('secondary')}>
              Later
            </button>
            <button onClick={handleSkip} style={buttonStyle('ghost')}>
              Skip this version
            </button>
          </div>
        </>
      )}

      {state.status === 'downloading' && state.progress && (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>
            Downloading update… {Math.round(state.progress.percent)}%
          </p>
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              backgroundColor: 'var(--update-track, #334155)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${state.progress.percent}%`,
                backgroundColor: 'var(--update-accent, #3b82f6)',
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
          <p style={{ margin: '0 0 0.75rem' }}>
            <strong>Ready to install:</strong> v{state.info.version}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={handleInstall} style={buttonStyle('primary')}>
              Install &amp; Restart
            </button>
            <button onClick={handleLater} style={buttonStyle('secondary')}>
              Later
            </button>
          </div>
        </>
      )}

      {state.status === 'error' && (
        <>
          <p style={{ margin: '0 0 0.5rem', color: '#ef4444' }}>
            Update error: {state.error ?? 'Unknown error'}
          </p>
          <button onClick={handleLater} style={buttonStyle('secondary')}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

function buttonStyle(variant: 'primary' | 'secondary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    border: 'none',
    borderRadius: '0.25rem',
    padding: '0.375rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
    lineHeight: 1.4,
  };

  switch (variant) {
    case 'primary':
      return { ...base, backgroundColor: '#3b82f6', color: '#fff' };
    case 'secondary':
      return { ...base, backgroundColor: '#475569', color: '#f8fafc' };
    case 'ghost':
      return { ...base, backgroundColor: 'transparent', color: '#94a3b8', textDecoration: 'underline' };
  }
}
