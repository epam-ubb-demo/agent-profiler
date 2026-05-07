/**
 * useDeepLink — manages URL hash-based deep linking for session detail modals.
 *
 * On mount, checks window.location.hash for `#session/<id>`.
 * When the modal opens, updates the hash. When it closes, clears it.
 */

import { useCallback, useEffect, useState } from 'react';

const SESSION_HASH_PREFIX = '#session/';

export interface UseDeepLinkReturn {
  /** The session ID extracted from the URL hash, or null if none. */
  readonly linkedSessionId: string | null;
  /** Set the hash to link to a session. */
  readonly setSessionHash: (sessionId: string) => void;
  /** Clear the hash (session modal closed). */
  readonly clearSessionHash: () => void;
}

/**
 * Hook that synchronizes a session ID with the URL hash fragment.
 */
export function useDeepLink(): UseDeepLinkReturn {
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash;
    if (hash.startsWith(SESSION_HASH_PREFIX)) {
      return hash.slice(SESSION_HASH_PREFIX.length) || null;
    }
    return null;
  });

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash;
      if (hash.startsWith(SESSION_HASH_PREFIX)) {
        setLinkedSessionId(hash.slice(SESSION_HASH_PREFIX.length) || null);
      } else {
        setLinkedSessionId(null);
      }
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const setSessionHash = useCallback((sessionId: string) => {
    window.location.hash = `session/${sessionId}`;
    setLinkedSessionId(sessionId);
  }, []);

  const clearSessionHash = useCallback(() => {
    // Remove hash without triggering navigation
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setLinkedSessionId(null);
  }, []);

  return { linkedSessionId, setSessionHash, clearSessionHash };
}
