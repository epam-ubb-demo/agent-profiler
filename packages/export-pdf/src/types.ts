/**
 * PDF page size identifier.
 */
export type PageSize = 'A4' | 'Letter' | 'A3';

/**
 * Margin values in CSS pixels.
 */
export interface PdfMargins {
  top?: number | undefined;
  bottom?: number | undefined;
  left?: number | undefined;
  right?: number | undefined;
}

/**
 * User-supplied options for PDF export.
 */
export interface PdfExportOptions {
  /** Absolute path for the output PDF file (must end with .pdf). */
  outputPath: string;
  /** Page orientation. Default: false (portrait). */
  landscape?: boolean | undefined;
  /** Page size identifier. Default: 'A4'. */
  pageSize?: PageSize | undefined;
  /** Print CSS backgrounds. Default: true. */
  printBackground?: boolean | undefined;
  /** Display header/footer. Default: true. */
  displayHeaderFooter?: boolean | undefined;
  /** Custom header HTML template. */
  headerTemplate?: string | undefined;
  /** Custom footer HTML template. */
  footerTemplate?: string | undefined;
  /** Page margins in CSS pixels. */
  margins?: PdfMargins | undefined;
  /** Document title rendered in the header. Default: 'Agent Profiler Report'. */
  title?: string | undefined;
}

/**
 * Fully resolved export options (all fields have values).
 */
export interface ResolvedPdfOptions {
  outputPath: string;
  landscape: boolean;
  pageSize: PageSize;
  printBackground: boolean;
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
  margins: { top: number; bottom: number; left: number; right: number };
  title: string;
}

/**
 * Minimal abstraction over Electron WebContents for testing.
 */
export interface PrintableWebContents {
  printToPDF(options: Record<string, unknown>): Promise<Uint8Array>;
}

/**
 * Minimal abstraction over Electron BrowserWindow for offscreen rendering.
 */
export interface OffscreenWindow {
  webContents: PrintableWebContents & {
    loadURL(url: string): Promise<void>;
  };
  close(): void;
}

/**
 * Factory function to create an offscreen BrowserWindow for session export.
 */
export type CreateOffscreenWindow = () => OffscreenWindow;
