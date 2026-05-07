import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

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
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        {route.view === 'list' && <SessionBrowser onSelectSession={handleSelectSession} />}
        {route.view === 'detail' && (
          <SessionDetail sessionId={route.sessionId} onBack={handleBack} />
        )}
      </div>
    </QueryClientProvider>
  );
}

