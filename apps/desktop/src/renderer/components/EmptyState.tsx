import { Button, FlexRow, Text } from '@epam/uui';

import { SearchIcon } from '@/components/icons';

export interface EmptyStateProps {
  /** Called when the user clicks the "Open a folder" button. */
  readonly onOpenFolder: () => void;
}

export function EmptyState({ onOpenFolder }: EmptyStateProps) {
  return (
    <FlexRow
      alignItems="center"
      justifyContent="center"
      padding="24"
      rawProps={{ 'data-testid': 'empty-state' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
        <SearchIcon style={{ height: '3rem', width: '3rem' }} />
        <Text size="48" fontWeight="600">No sessions found</Text>
        <Text size="24" color="secondary">
          Agent Profiler looks for Copilot CLI sessions in{' '}
          <code>~/.copilot/session-state/</code>
        </Text>
        <Button color="primary" caption="Open a folder containing session logs" onClick={onOpenFolder} />
        <Text size="18" color="secondary">
          To generate sessions, use the Copilot CLI (
          <code>gh copilot</code>) in any repository.
          Sessions appear here automatically.
        </Text>
      </div>
    </FlexRow>
  );
}
