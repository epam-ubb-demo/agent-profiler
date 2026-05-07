import type { Session } from '@agent-profiler/core';
import { validateOptions, resolveOptions } from './options';
import { generateSessionHeaderTemplate } from './templates';
import { savePdf } from './save';
import { escapeHtml } from './templates';
import type {
  PdfExportOptions,
  ResolvedPdfOptions,
  PrintableWebContents,
  CreateOffscreenWindow,
} from './types';

/** Page dimensions in microns for Electron printToPDF. */
const PAGE_SIZES = {
  A4: { width: 210000, height: 297000 },
  Letter: { width: 215900, height: 279400 },
  A3: { width: 297000, height: 420000 },
} as const;

/** Convert CSS pixels to inches (96 DPI). */
function pxToInches(px: number): number {
  return px / 96;
}

/**
 * Convert resolved options to Electron printToPDF parameters.
 */
function toElectronPrintOptions(resolved: ResolvedPdfOptions): Record<string, unknown> {
  const size = PAGE_SIZES[resolved.pageSize];
  return {
    landscape: resolved.landscape,
    printBackground: resolved.printBackground,
    displayHeaderFooter: resolved.displayHeaderFooter,
    headerTemplate: resolved.headerTemplate,
    footerTemplate: resolved.footerTemplate,
    pageSize: { width: size.width, height: size.height },
    margins: {
      top: pxToInches(resolved.margins.top),
      bottom: pxToInches(resolved.margins.bottom),
      left: pxToInches(resolved.margins.left),
      right: pxToInches(resolved.margins.right),
    },
  };
}

/**
 * Build an HTML document for session export.
 */
function buildSessionHtml(session: Session, title: string): string {
  const turnRows = session.turns
    .map((turn) => {
      const userMsg = turn.userMessage
        ? `<p class="user-msg"><strong>User:</strong> ${escapeHtml(turn.userMessage.content)}</p>`
        : '';
      const toolList = turn.toolCalls
        .map((tc) => `<li>${escapeHtml(tc.toolName)} (${tc.success ? '✓' : '✗'})</li>`)
        .join('');
      return `
        <div class="turn">
          ${userMsg}
          ${toolList ? `<ul class="tool-calls">${toolList}</ul>` : ''}
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1a1a1a; }
    h1 { font-size: 1.4em; margin-bottom: 0.5em; }
    .meta { color: #555; font-size: 0.85em; margin-bottom: 1.5em; }
    .turn { border-left: 3px solid #0066cc; padding-left: 12px; margin-bottom: 16px; }
    .user-msg { margin: 4px 0; }
    .tool-calls { margin: 4px 0; padding-left: 20px; font-size: 0.9em; }
    .tool-calls li { margin: 2px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <p>Session: ${escapeHtml(session.sessionId)} | Model: ${escapeHtml(session.selectedModel)}</p>
    <p>Repository: ${escapeHtml(session.repository ?? 'N/A')} | Branch: ${escapeHtml(session.branch ?? 'N/A')}</p>
  </div>
  ${turnRows}
</body>
</html>`;
}

/**
 * Core PDF exporter class.
 */
export class PdfExporter {
  /**
   * Export the current webContents view as a PDF.
   */
  async exportView(
    webContents: PrintableWebContents,
    options: PdfExportOptions,
  ): Promise<Uint8Array> {
    const error = validateOptions(options);
    if (error) {
      throw new Error(`PDF export validation failed: ${error}`);
    }

    const resolved = resolveOptions(options);
    const electronOpts = toElectronPrintOptions(resolved);
    const buffer = await webContents.printToPDF(electronOpts);

    await savePdf(resolved.outputPath, buffer);
    return buffer;
  }

  /**
   * Export a Session as a formatted PDF (renders HTML offscreen).
   */
  async exportSession(
    session: Session,
    options: PdfExportOptions,
    createOffscreenWindow?: CreateOffscreenWindow,
  ): Promise<Uint8Array> {
    if (!createOffscreenWindow) {
      throw new Error('createOffscreenWindow factory is required for session export');
    }

    const error = validateOptions(options);
    if (error) {
      throw new Error(`PDF export validation failed: ${error}`);
    }

    const resolved = resolveOptions(options);
    const title = resolved.title !== 'Agent Profiler Report'
      ? resolved.title
      : `Session: ${session.sessionId}`;
    resolved.headerTemplate = generateSessionHeaderTemplate(session.sessionId, { title });

    const html = buildSessionHtml(session, title);
    const window = createOffscreenWindow();

    try {
      await window.webContents.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      );

      const electronOpts = toElectronPrintOptions(resolved);
      const buffer = await window.webContents.printToPDF(electronOpts);

      await savePdf(resolved.outputPath, buffer);
      return buffer;
    } finally {
      window.close();
    }
  }
}
