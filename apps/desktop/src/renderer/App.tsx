import { Moon, Sun, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function App() {
  const [version, setVersion] = useState<string>('…');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    window.electronApi.getVersion().then(setVersion);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Agent Profiler</CardTitle>
          <CardDescription>
            Desktop application for visualising AI agent session logs
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Version {version}</p>
          <Button className="w-full" variant="default">
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Session
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsDark(!isDark)}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
