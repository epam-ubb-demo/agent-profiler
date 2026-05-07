/**
 * PDF export IPC handlers.
 *
 * Registers channels for exporting the current view or a session to PDF.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { z } from 'zod';

import { PdfExporter } from '@agent-profiler/export-pdf';
import type { Session } from '@agent-profiler/core';

/* ---------- Zod schemas for IPC validation ---------- */

const pdfOptionsSchema = z.object({
  outputPath: z.string().min(1),
  landscape: z.boolean().optional(),
  pageSize: z.enum(['A4', 'Letter', 'A3']).optional(),
  printBackground: z.boolean().optional(),
  displayHeaderFooter: z.boolean().optional(),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  margins: z
    .object({
      top: z.number().nonnegative().optional(),
      bottom: z.number().nonnegative().optional(),
      left: z.number().nonnegative().optional(),
      right: z.number().nonnegative().optional(),
    })
    .optional(),
  title: z.string().optional(),
});

const exportSessionSchema = z.object({
  session: z.unknown(),
  options: pdfOptionsSchema,
});

/* ---------- Channel names ---------- */

const PDF_CHANNELS = {
  EXPORT_CURRENT_VIEW: 'pdf:export-current-view',
  EXPORT_SESSION: 'pdf:export-session',
  SELECT_OUTPUT_PATH: 'pdf:select-output-path',
} as const;

/* ---------- Handler registration ---------- */

const exporter = new PdfExporter();

/**
 * Register IPC handlers for PDF export operations.
 */
export function registerPdfExportHandlers(): void {
  ipcMain.handle(PDF_CHANNELS.EXPORT_CURRENT_VIEW, async (event, rawOptions: unknown) => {
    const parsed = pdfOptionsSchema.safeParse(rawOptions);
    if (!parsed.success) {
      return { success: false, error: parsed.error.message };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, error: 'No active window found' };
    }

    try {
      await exporter.exportView(win.webContents, parsed.data);
      return { success: true, outputPath: parsed.data.outputPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(PDF_CHANNELS.EXPORT_SESSION, async (_event, rawPayload: unknown) => {
    const parsed = exportSessionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return { success: false, error: parsed.error.message };
    }

    const session = parsed.data.session as Session;
    const options = parsed.data.options;

    try {
      await exporter.exportSession(session, options, () => {
        const offscreen = new BrowserWindow({
          show: false,
          width: 1024,
          height: 768,
          webPreferences: { offscreen: true },
        });
        return offscreen;
      });
      return { success: true, outputPath: options.outputPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/**
 * Register IPC handler for the "Save As" dialog for PDF output.
 */
export function registerPdfDialogHandler(): void {
  ipcMain.handle(PDF_CHANNELS.SELECT_OUTPUT_PATH, async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export PDF',
      defaultPath: 'agent-profiler-report.pdf',
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  });
}
