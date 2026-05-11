/**
 * DetailModal — full-content modal for turn/tool-call inspection.
 *
 * Uses native HTML dialog element for accessibility (focus trap, Escape to close).
 * Content is organized into tabs: Message, Tool Call, and Metadata.
 */

import type { AssistantMessage, ToolCall, Turn } from '@agent-profiler/core';
import { Badge, Button, Text } from '@epam/uui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

/** Tabs available in the detail modal. */
type TabId = 'message' | 'toolcall' | 'metadata';

export interface DetailModalProps {
  /** Whether the modal is open. */
  readonly open: boolean;
  /** Callback to close the modal. */
  readonly onClose: () => void;
  /** The turn being inspected (optional). */
  readonly turn?: Turn | null;
  /** The specific tool call being inspected (optional). */
  readonly toolCall?: ToolCall | null;
}

export const DetailModal = memo(function DetailModal({
  open,
  onClose,
  turn,
  toolCall,
}: DetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>('message');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

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

  if (!open) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'message', label: 'Message' },
    { id: 'toolcall', label: 'Tool Call' },
    { id: 'metadata', label: 'Metadata' },
  ];

  return (
    <dialog
      ref={dialogRef}
      data-testid="detail-modal"
      style={{
        position: 'fixed',
        inset: 0,
        margin: 'auto',
        width: '100%',
        maxWidth: '42rem',
        borderRadius: 6,
        border: '1px solid var(--uui-neutral-40)',
        padding: 0,
      }}
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--uui-neutral-40)',
            padding: '12px 16px',
          }}
        >
          <Text size="36" fontWeight="600">
            {toolCall ? `Tool: ${toolCall.toolName}` : turn ? `Turn ${turn.turnId}` : 'Details'}
          </Text>
          <Button
            fill="ghost"
            size="24"
            caption="✕"
            onClick={onClose}
            rawProps={{ 'data-testid': 'detail-modal-close', 'aria-label': 'Close' }}
          />
        </div>

        {/* Tabs */}
        <div
          style={{ display: 'flex', borderBottom: '1px solid var(--uui-neutral-40)' }}
          role="tablist"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              data-testid={`tab-${tab.id}`}
              style={{
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: 500,
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--uui-info-50)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--uui-info-50)' : 'var(--uui-text-secondary)',
                cursor: 'pointer',
                transition: 'color 150ms',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          data-testid="detail-modal-content"
          style={{ maxHeight: '60vh', overflowY: 'auto', padding: 16 }}
        >
          {activeTab === 'message' && <MessageTab turn={turn ?? null} />}
          {activeTab === 'toolcall' && <ToolCallTab toolCall={toolCall ?? null} />}
          {activeTab === 'metadata' && <MetadataTab turn={turn ?? null} toolCall={toolCall ?? null} />}
        </div>
      </div>
    </dialog>
  );
});

/* ---------- Tab content sub-components ---------- */

function MessageTab({ turn }: { readonly turn?: Turn | null }) {
  if (!turn) {
    return <Text size="24" color="secondary">No message data available.</Text>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {turn.userMessage && (
        <section>
          <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>User Message</Text>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              borderRadius: 6,
              background: 'var(--uui-surface-section)',
              padding: 12,
              fontSize: '0.875rem',
              color: 'var(--uui-text-primary)',
              margin: 0,
            }}
          >
            {turn.userMessage.content || '(empty)'}
          </pre>
        </section>
      )}
      {turn.assistantMessages.length > 0 && (
        <section>
          <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>Assistant Messages</Text>
          {turn.assistantMessages.map((msg: AssistantMessage, i: number) => (
            <pre
              key={i}
              style={{
                whiteSpace: 'pre-wrap',
                borderRadius: 6,
                background: 'var(--uui-surface-section)',
                padding: 12,
                fontSize: '0.875rem',
                color: 'var(--uui-text-primary)',
                margin: 0,
                marginTop: i > 0 ? 8 : 0,
              }}
            >
              {msg.content || '(empty)'}
            </pre>
          ))}
        </section>
      )}
    </div>
  );
}

function ToolCallTab({ toolCall }: { readonly toolCall?: ToolCall | null }) {
  if (!toolCall) {
    return <Text size="24" color="secondary">No tool call data available.</Text>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section>
        <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>Tool Name</Text>
        <Text size="24">{toolCall.toolName}</Text>
      </section>
      <section>
        <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>Arguments</Text>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            borderRadius: 6,
            background: 'var(--uui-surface-section)',
            padding: 12,
            fontSize: '0.875rem',
            color: 'var(--uui-text-primary)',
            margin: 0,
          }}
        >
          {toolCall.argumentsPreview || '(none)'}
        </pre>
      </section>
      <section>
        <Text size="24" fontWeight="600" rawProps={{ style: { marginBottom: 4 } }}>Status</Text>
        <Badge
          size="18"
          fill="solid"
          color={
            toolCall.success === true
              ? 'success'
              : toolCall.success === false
                ? 'critical'
                : 'neutral'
          }
          caption={
            toolCall.success === true ? 'Success' : toolCall.success === false ? 'Failed' : 'Unknown'
          }
        />
      </section>
    </div>
  );
}

function MetadataTab({
  turn,
  toolCall,
}: {
  readonly turn?: Turn | null;
  readonly toolCall?: ToolCall | null;
}) {
  const rows: { label: string; value: string }[] = [];

  if (toolCall) {
    rows.push({ label: 'Tool Call ID', value: toolCall.toolCallId });
    if (toolCall.model) rows.push({ label: 'Model', value: toolCall.model });
    if (toolCall.startTs) rows.push({ label: 'Start', value: toolCall.startTs });
    if (toolCall.endTs) rows.push({ label: 'End', value: toolCall.endTs });
    if (toolCall.durationMs != null) rows.push({ label: 'Duration', value: `${toolCall.durationMs}ms` });
  }

  if (turn) {
    rows.push({ label: 'Turn ID', value: turn.turnId });
    if (turn.startTs) rows.push({ label: 'Turn Start', value: turn.startTs });
    if (turn.endTs) rows.push({ label: 'Turn End', value: turn.endTs });

    const totalInput = turn.assistantMessages.reduce((s, m) => s + m.inputTokens, 0);
    const totalOutput = turn.assistantMessages.reduce((s, m) => s + m.outputTokens, 0);
    const totalCache = turn.assistantMessages.reduce((s, m) => s + m.cacheReadTokens, 0);
    rows.push({ label: 'Input Tokens', value: String(totalInput) });
    rows.push({ label: 'Output Tokens', value: String(totalOutput) });
    rows.push({ label: 'Cache Read Tokens', value: String(totalCache) });
  }

  if (rows.length === 0) {
    return <Text size="24" color="secondary">No metadata available.</Text>;
  }

  return (
    <table style={{ width: '100%', fontSize: '0.875rem' }} data-testid="metadata-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} style={{ borderBottom: '1px solid var(--uui-neutral-40)' }}>
            <td style={{ padding: '6px 16px 6px 0', fontWeight: 500, color: 'var(--uui-text-secondary)' }}>{row.label}</td>
            <td style={{ padding: '6px 0', color: 'var(--uui-text-primary)' }}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
