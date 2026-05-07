import { generateHeaderTemplate, generateFooterTemplate } from './templates';
import type { PdfExportOptions, ResolvedPdfOptions } from './types';

const DEFAULT_MARGIN = 40;

function marginVal(val: number | undefined, fallback: number): number {
  return val !== undefined ? val : fallback;
}

/**
 * Validate export options. Returns error message or null if valid.
 */
export function validateOptions(opts: PdfExportOptions): string | null {
  if (!opts.outputPath || opts.outputPath.trim() === '') {
    return 'outputPath is required and must be non-empty';
  }
  if (!opts.outputPath.toLowerCase().endsWith('.pdf')) {
    return 'outputPath must have a .pdf extension';
  }
  if (opts.margins) {
    const { top, bottom, left, right } = opts.margins;
    const values = [top, bottom, left, right].filter((v) => v !== undefined);
    if (values.some((v) => v < 0)) {
      return 'Margin values must be non-negative';
    }
  }
  return null;
}

/**
 * Merge user options with defaults to produce fully resolved options.
 */
export function resolveOptions(opts: PdfExportOptions): ResolvedPdfOptions {
  const title = opts.title ?? 'Agent Profiler Report';
  const m = opts.margins;

  return {
    outputPath: opts.outputPath,
    landscape: opts.landscape ?? false,
    pageSize: opts.pageSize ?? 'A4',
    printBackground: opts.printBackground ?? true,
    displayHeaderFooter: opts.displayHeaderFooter ?? true,
    headerTemplate: opts.headerTemplate ?? generateHeaderTemplate({ title }),
    footerTemplate: opts.footerTemplate ?? generateFooterTemplate(),
    margins: {
      top: marginVal(m?.top, DEFAULT_MARGIN),
      bottom: marginVal(m?.bottom, DEFAULT_MARGIN),
      left: marginVal(m?.left, DEFAULT_MARGIN),
      right: marginVal(m?.right, DEFAULT_MARGIN),
    },
    title,
  };
}
