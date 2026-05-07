/**
 * SessionDetailModal — full-screen modal overlay for per-session detail view.
 *
 * Uses native <dialog> element for accessibility (focus trap, Escape to close).
 * Lazy-loads SessionDetailContent via React.lazy + Suspense.
 */

import type { Session } from '@agent-profiler/core';
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
      className="fixed inset-0 m-0 h-full w-full max-h-full max-w-full border-0 bg-white p-0 backdrop:bg-black/50"
      aria-modal="true"
      role="dialog"
      aria-label={`Session detail: ${sessionId}`}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      <div
        className="flex h-full w-full flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900" data-testid="session-detail-title">
              Session: {sessionId}
            </h2>
            {loadState.status === 'loaded' && (
              <p className="text-sm text-slate-500">
                {loadState.session.selectedModel}
                {loadState.session.branch && ` • ${loadState.session.branch}`}
              </p>
            )}
          </div>
          <button
            data-testid="session-detail-modal-close"
            className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            aria-label="Close session detail"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6" data-testid="session-detail-body">
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
    <div data-testid="session-detail-loading" className="space-y-4 animate-pulse">
      <div className="h-10 rounded bg-slate-200" />
      <div className="h-40 rounded bg-slate-200" />
      <div className="h-20 rounded bg-slate-200" />
    </div>
  );
}

function ErrorState({ message }: { readonly message: string }) {
  return (
    <div data-testid="session-detail-error" className="rounded border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">Failed to load session</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
    </div>
  );
}
