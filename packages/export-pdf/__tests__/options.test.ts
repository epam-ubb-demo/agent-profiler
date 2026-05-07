import { describe, it, expect } from 'vitest';

import { resolveOptions, validateOptions } from '../src/options';
import type { PdfExportOptions } from '../src/types';

describe('options', () => {
  describe('validateOptions', () => {
    it('should return null for valid options', () => {
      const opts: PdfExportOptions = { outputPath: '/tmp/test.pdf' };
      expect(validateOptions(opts)).toBeNull();
    });

    it('should reject empty outputPath', () => {
      const opts: PdfExportOptions = { outputPath: '' };
      expect(validateOptions(opts)).toContain('outputPath is required');
    });

    it('should reject whitespace-only outputPath', () => {
      const opts: PdfExportOptions = { outputPath: '   ' };
      expect(validateOptions(opts)).toContain('outputPath is required');
    });

    it('should reject outputPath without .pdf extension', () => {
      const opts: PdfExportOptions = { outputPath: '/tmp/test.txt' };
      expect(validateOptions(opts)).toContain('.pdf extension');
    });

    it('should reject negative margins', () => {
      const opts: PdfExportOptions = {
        outputPath: '/tmp/test.pdf',
        margins: { top: -10 },
      };
      expect(validateOptions(opts)).toContain('non-negative');
    });

    it('should accept valid margins', () => {
      const opts: PdfExportOptions = {
        outputPath: '/tmp/test.pdf',
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
      };
      expect(validateOptions(opts)).toBeNull();
    });
  });

  describe('resolveOptions', () => {
    it('should apply defaults when no options are provided', () => {
      const resolved = resolveOptions({ outputPath: '/tmp/test.pdf' });
      expect(resolved.landscape).toBe(false);
      expect(resolved.pageSize).toBe('A4');
      expect(resolved.printBackground).toBe(true);
      expect(resolved.title).toBe('Agent Profiler Report');
    });

    it('should preserve user-specified values', () => {
      const resolved = resolveOptions({
        outputPath: '/out/report.pdf',
        landscape: true,
        pageSize: 'Letter',
        title: 'My Report',
      });
      expect(resolved.landscape).toBe(true);
      expect(resolved.pageSize).toBe('Letter');
      expect(resolved.title).toBe('My Report');
      expect(resolved.outputPath).toBe('/out/report.pdf');
    });

    it('should apply default margins', () => {
      const resolved = resolveOptions({ outputPath: '/tmp/test.pdf' });
      expect(resolved.margins.top).toBe(40);
      expect(resolved.margins.bottom).toBe(40);
      expect(resolved.margins.left).toBe(40);
      expect(resolved.margins.right).toBe(40);
    });

    it('should merge partial margins with defaults', () => {
      const resolved = resolveOptions({
        outputPath: '/tmp/test.pdf',
        margins: { top: 60 },
      });
      expect(resolved.margins.top).toBe(60);
      expect(resolved.margins.bottom).toBe(40);
    });

    it('should generate header template when not provided', () => {
      const resolved = resolveOptions({ outputPath: '/tmp/test.pdf' });
      expect(resolved.headerTemplate).toContain('Agent Profiler Report');
    });

    it('should generate footer template when not provided', () => {
      const resolved = resolveOptions({ outputPath: '/tmp/test.pdf' });
      expect(resolved.footerTemplate).toContain('pageNumber');
    });
  });
});
