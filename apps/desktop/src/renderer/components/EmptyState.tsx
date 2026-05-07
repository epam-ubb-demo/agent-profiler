import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface EmptyStateProps {
  /** Called when the user clicks the "Open a folder" button. */
  readonly onOpenFolder: () => void;
}

export function EmptyState({ onOpenFolder }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center gap-4 p-12 text-center"
    >
      <Search className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-xl font-semibold">No sessions found</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Agent Profiler looks for Copilot CLI sessions in{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.copilot/session-state/</code>
      </p>
      <Button variant="default" onClick={onOpenFolder}>
        Open a folder containing session logs
      </Button>
      <p className="max-w-sm text-xs text-muted-foreground">
        To generate sessions, use the Copilot CLI (
        <code className="rounded bg-muted px-1 py-0.5">gh copilot</code>) in any repository.
        Sessions appear here automatically.
      </p>
    </div>
  );
}
