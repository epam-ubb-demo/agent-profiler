import { useState, useCallback } from 'react';

type ExportState = 'idle' | 'loading' | 'success' | 'error';

interface PdfExportButtonProps {
  /** When provided, exports a session object instead of current view. */
  session?: unknown;
  /** Optional class name for the button element. */
  className?: string;
}

/**
 * PDF Export button that integrates with the Electron IPC API.
 *
 * Shows loading, success, and error states with appropriate feedback.
 */
export function PdfExportButton({ session, className }: PdfExportButtonProps) {
  const [state, setState] = useState<ExportState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setState('loading');
    setErrorMessage(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).electronApi;
      if (!api?.pdf) {
        throw new Error('PDF export API not available');
      }

      const outputPath = await api.pdf.selectOutputPath();
      if (!outputPath) {
        setState('idle');
        return; // User cancelled
      }

      const options = { outputPath };
      const result = session
        ? await api.pdf.exportSession(session, options)
        : await api.pdf.exportCurrentView(options);

      if (result.success) {
        setState('success');
        setTimeout(() => setState('idle'), 2000);
      } else {
        throw new Error(result.error ?? 'Export failed');
      }
    } catch (err) {
      setState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(() => setState('idle'), 3000);
    }
  }, [session]);

  const label =
    state === 'loading'
      ? 'Exporting…'
      : state === 'success'
        ? '✓ Exported'
        : state === 'error'
          ? '✗ Failed'
          : 'Export PDF';

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleExport}
        disabled={state === 'loading'}
        title={errorMessage ?? undefined}
        aria-label="Export to PDF"
      >
        {label}
      </button>
    </div>
  );
}
