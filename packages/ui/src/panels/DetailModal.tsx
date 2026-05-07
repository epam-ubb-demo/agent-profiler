/**
 * DetailModal — full-content modal for turn/tool-call inspection.
 *
 * Uses native HTML dialog element for accessibility (focus trap, Escape to close).
 * Content is organized into tabs: Message, Tool Call, and Metadata.
 */

import type { AssistantMessage, ToolCall, Turn } from '@agent-profiler/core';
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
      className="fixed inset-0 m-auto w-full max-w-2xl rounded-lg border border-slate-200 p-0 backdrop:bg-black/40"
      onClose={handleClose}
      onClick={handleBackdropClick}
    >
      <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {toolCall ? `Tool: ${toolCall.toolName}` : turn ? `Turn ${turn.turnId}` : 'Details'}
          </h2>
          <button
            data-testid="detail-modal-close"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              data-testid={`tab-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4" data-testid="detail-modal-content">
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
    return <p className="text-sm text-slate-500">No message data available.</p>;
  }

  return (
    <div className="space-y-4">
      {turn.userMessage && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-700">User Message</h3>
          <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-900">
            {turn.userMessage.content || '(empty)'}
          </pre>
        </section>
      )}
      {turn.assistantMessages.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-700">Assistant Messages</h3>
          {turn.assistantMessages.map((msg: AssistantMessage, i: number) => (
            <pre
              key={i}
              className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-900"
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
    return <p className="text-sm text-slate-500">No tool call data available.</p>;
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Tool Name</h3>
        <p className="text-sm text-slate-900">{toolCall.toolName}</p>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Arguments</h3>
        <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-900">
          {toolCall.argumentsPreview || '(none)'}
        </pre>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Status</h3>
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            toolCall.success === true
              ? 'bg-green-100 text-green-600'
              : toolCall.success === false
                ? 'bg-red-100 text-red-600'
                : 'bg-slate-100 text-slate-500'
          }`}
        >
          {toolCall.success === true ? 'Success' : toolCall.success === false ? 'Failed' : 'Unknown'}
        </span>
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
    return <p className="text-sm text-slate-500">No metadata available.</p>;
  }

  return (
    <table className="w-full text-sm" data-testid="metadata-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-slate-100">
            <td className="py-1.5 pr-4 font-medium text-slate-700">{row.label}</td>
            <td className="py-1.5 text-slate-900">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
