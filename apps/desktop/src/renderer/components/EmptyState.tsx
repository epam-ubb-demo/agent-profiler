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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '3rem',
        textAlign: 'center',
      }}
    >
      <Search style={{ height: '3rem', width: '3rem', color: '#6C6F80' }} />
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>No sessions found</h2>
      <p style={{ maxWidth: '24rem', fontSize: '0.875rem', color: '#6C6F80' }}>
        Agent Profiler looks for Copilot CLI sessions in{' '}
        <code style={{ borderRadius: '0.25rem', backgroundColor: '#F5F6FA', padding: '0.125rem 0.25rem', fontSize: '0.75rem' }}>~/.copilot/session-state/</code>
      </p>
      <Button variant="default" onClick={onOpenFolder}>
        Open a folder containing session logs
      </Button>
      <p style={{ maxWidth: '24rem', fontSize: '0.75rem', color: '#6C6F80' }}>
        To generate sessions, use the Copilot CLI (
        <code style={{ borderRadius: '0.25rem', backgroundColor: '#F5F6FA', padding: '0.125rem 0.25rem' }}>gh copilot</code>) in any repository.
        Sessions appear here automatically.
      </p>
    </div>
  );
}
