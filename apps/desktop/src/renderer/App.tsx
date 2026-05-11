import { ErrorBoundary } from '@agent-profiler/ui';
import { ContextProvider } from '@epam/uui-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { SessionBrowser } from '@/pages/SessionBrowser';
import { SessionDetail } from '@/pages/SessionDetail';

type AppRoute = { view: 'list' } | { view: 'detail'; sessionId: string };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  const [route, setRoute] = useState<AppRoute>({ view: 'list' });

  const handleSelectSession = useCallback((sessionId: string) => {
    setRoute({ view: 'detail', sessionId });
  }, []);

  const handleBack = useCallback(() => {
    setRoute({ view: 'list' });
  }, []);

  return (
    <ContextProvider onInitCompleted={() => {}}>
      <QueryClientProvider client={queryClient}>
        <AppShell>
          <ErrorBoundary>
            {route.view === 'list' && <SessionBrowser onSelectSession={handleSelectSession} />}
            {route.view === 'detail' && (
              <SessionDetail sessionId={route.sessionId} onBack={handleBack} onSessionNavigate={handleSelectSession} />
            )}
          </ErrorBoundary>
        </AppShell>
      </QueryClientProvider>
    </ContextProvider>
  );
}

