/**
 * SessionDetailModal — full-screen modal overlay for per-session detail view.
 *
 * Uses native <dialog> element for accessibility (focus trap, Escape to close).
 * Lazy-loads SessionDetailContent via React.lazy + Suspense.
 */

import type { Session } from '@agent-profiler/core';
import { Text } from '@epam/uui';
import { memo, useCallback, useEffect, useRef, lazy, Suspense, useState } from 'react';

const LazySessionDetailContent = lazy(() =>
  import('./SessionDetailContent').then((mod) => ({ default: mod.SessionDetailContent })),
);

export interface SessionDetailModalProps {
  /** The session ID to display. */
  readonly sessionId: string;
  /** Loader function to fetch session data. */
  readonly sessionLoader: (sessionId: string) => Promise<Session | null>;
  /** Callback to close the modal. */
  readonly onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; session: Session }
  | { status: 'error'; error: string };

export const SessionDetailModal = memo(function SessionDetailModal({
  sessionId,
  sessionLoader,
  onClose,
}: SessionDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });

  // Open dialog on mount
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  // Load session data
  useEffect(() => {
    let cancelled = false;
    setLoadState({ status: 'loading' });

    sessionLoader(sessionId)
      .then((session) => {
        if (cancelled) return;
        if (session) {
          setLoadState({ status: 'loaded', session });
        } else {
          setLoadState({ status: 'error', error: 'Session not found' });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load session';
        setLoadState({ status: 'error', error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionLoader]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      data-testid="session-detail-modal"
      style={{
        position: 'fixed',
        inset: 0,
        margin: 0,
        height: '100%',
        width: '100%',
        maxHeight: '100%',
        maxWidth: '100%',
        border: 'none',
        background: 'var(--uui-surface-higher)',
        padding: 0,
      }}
      aria-modal="true"
      role="dialog"
      aria-label={`Session detail: ${sessionId}`}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      <div
        style={{ display: 'flex', height: '100%', width: '100%', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--uui-neutral-40)', padding: '16px 24px' }}>
          <div>
            <Text size="24" fontWeight="600" color="primary" rawProps={{ 'data-testid': 'session-detail-title' }}>
              Session: {sessionId}
            </Text>
            {loadState.status === 'loaded' && (
              <Text size="18" color="secondary">
                {loadState.session.selectedModel}
                {loadState.session.branch && ` • ${loadState.session.branch}`}
              </Text>
            )}
          </div>
          <button
            data-testid="session-detail-modal-close"
            style={{
              borderRadius: '6px',
              padding: '8px',
              color: 'var(--uui-text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={onClose}
            aria-label="Close session detail"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }} data-testid="session-detail-body">
          {loadState.status === 'loading' && <LoadingSkeleton />}
          {loadState.status === 'error' && <ErrorState message={loadState.error} />}
          {loadState.status === 'loaded' && (
            <Suspense fallback={<LoadingSkeleton />}>
              <LazySessionDetailContent session={loadState.session} />
            </Suspense>
          )}
        </div>
      </div>
    </dialog>
  );
});

function LoadingSkeleton() {
  return (
    <div data-testid="session-detail-loading" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ height: '40px', borderRadius: '6px', background: 'var(--uui-neutral-40)' }} />
      <div style={{ height: '160px', borderRadius: '6px', background: 'var(--uui-neutral-40)' }} />
      <div style={{ height: '80px', borderRadius: '6px', background: 'var(--uui-neutral-40)' }} />
    </div>
  );
}

function ErrorState({ message }: { readonly message: string }) {
  return (
    <div data-testid="session-detail-error" style={{ borderRadius: '6px', border: '1px solid var(--uui-warning-50)', background: 'var(--uui-surface-section)', padding: '16px' }}>
      <Text size="18" fontWeight="600" color="primary">Failed to load session</Text>
      <Text size="18" color="secondary" rawProps={{ style: { marginTop: '4px' } }}>{message}</Text>
    </div>
  );
}
