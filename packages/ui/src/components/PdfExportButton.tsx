/**
 * PdfExportButton — triggers PDF export from the renderer process.
 *
 * Uses Electron IPC to communicate with the main process for PDF generation.
 * Shows loading state during export and displays success/failure notifications.
 */

import { memo, useCallback, useState } from 'react';

export interface PdfExportButtonProps {
  /** Variant determines which export strategy to use. */
  readonly variant: 'session' | 'table';
  /** Session ID — required when variant is 'session'. */
  readonly sessionId?: string;
  /** Optional custom title for the PDF. */
  readonly title?: string;
  /** Additional CSS class names. */
  readonly className?: string;
}

/** Status of the export operation. */
type ExportStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Access the electronApi from the window object (exposed via preload).
 */
function getElectronApi(): ElectronPdfApi | null {
  const win = globalThis.window as unknown as { electronApi?: ElectronPdfApi };
  return win.electronApi ?? null;
}

interface ElectronPdfApi {
  pdf?: {
    selectOutputPath: (defaultName?: string) => Promise<string | null>;
    exportCurrentView: (options: Record<string, unknown>) => Promise<{ success: boolean; outputPath: string }>;
    exportSession: (payload: { sessionId: string; options: Record<string, unknown> }) => Promise<{ success: boolean; outputPath: string }>;
  };
}

export const PdfExportButton = memo(function PdfExportButton({
  variant,
  sessionId,
  title,
  className,
}: PdfExportButtonProps) {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    const api = getElectronApi();
    if (!api?.pdf) {
      setStatus('error');
      setErrorMessage('PDF export not available');
      return;
    }

    try {
      setStatus('loading');
      setErrorMessage(null);

      // Ask user for save location
      const defaultName = variant === 'session'
        ? `session-${sessionId ?? 'export'}.pdf`
        : 'comparison-table.pdf';

      const outputPath = await api.pdf.selectOutputPath(defaultName);
      if (!outputPath) {
        // User cancelled
        setStatus('idle');
        return;
      }

      const options = {
        outputPath,
        title: title ?? (variant === 'session' ? `Session Report` : 'Comparison Table'),
        printBackground: true,
      };

      if (variant === 'session' && sessionId) {
        await api.pdf.exportSession({ sessionId, options });
      } else {
        await api.pdf.exportCurrentView(options);
      }

      setStatus('success');
      // Reset after showing success
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Export failed');
      setTimeout(() => setStatus('idle'), 5000);
    }
  }, [variant, sessionId, title]);

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={status === 'loading'}
        aria-label="Export as PDF"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          fontSize: '13px',
          fontWeight: 500,
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          background: status === 'loading' ? '#f3f4f6' : '#ffffff',
          color: '#374151',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          opacity: status === 'loading' ? 0.7 : 1,
          transition: 'all 150ms ease',
        }}
      >
        {status === 'loading' ? (
          <LoadingSpinner />
        ) : (
          <PdfIcon />
        )}
        {status === 'loading' ? 'Exporting…' : 'Export PDF'}
      </button>

      {status === 'success' && (
        <span style={{ fontSize: '12px', color: '#059669' }} role="status">
          ✓ PDF saved
        </span>
      )}

      {status === 'error' && errorMessage && (
        <span style={{ fontSize: '12px', color: '#dc2626' }} role="alert">
          ✗ {errorMessage}
        </span>
      )}
    </div>
  );
});

function PdfIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
