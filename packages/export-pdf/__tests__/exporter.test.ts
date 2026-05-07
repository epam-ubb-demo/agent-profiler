import { describe, it, expect, vi } from 'vitest';

import { PdfExporter } from '../src/exporter';
import type { PdfExportOptions } from '../src/types';
import type { Session } from '@agent-profiler/core';

// Mock fs/promises for savePdf
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

function createMockWebContents(pdfBuffer?: Uint8Array) {
  return {
    printToPDF: vi.fn().mockResolvedValue(pdfBuffer ?? new Uint8Array([37, 80, 68, 70])),
  };
}

function createMockSession(overrides?: Partial<Session>): Session {
  return {
    sessionId: 'test-session-123',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4',
    reasoningEffort: 'medium',
    repository: 'test/repo',
    branch: 'main',
    cwd: '/tmp/test',
    startTs: '2025-01-15T10:00:00Z',
    endTs: '2025-01-15T10:30:00Z',
    modelChanges: [],
    toolCalls: [
      { toolCallId: 'tc1', toolName: 'read_file', model: null, startTs: null, endTs: null, durationMs: null, success: true, parentId: null, turnId: 't1', eventId: null, argumentsPreview: '{}' },
    ],
    assistantMessages: [],
    userMessages: [],
    compactions: [],
    subagents: [],
    shutdown: null,
    success: true,
    fanoutTurns: [],
    turns: [
      {
        turnId: 't1',
        startTs: '2025-01-15T10:00:00Z',
        endTs: '2025-01-15T10:05:00Z',
        userMessage: { content: 'Fix the bug in auth module', timestamp: '2025-01-15T10:00:00Z', interactionId: null, turnId: 't1' },
        assistantMessages: [],
        toolCalls: [{ toolCallId: 'tc1', toolName: 'read_file', model: null, startTs: null, endTs: null, durationMs: null, success: true, parentId: null, turnId: 't1', eventId: null, argumentsPreview: '{}' }],
        subagents: [],
      },
    ],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  };
}

describe('PdfExporter', () => {
  describe('exportView', () => {
    it('should call printToPDF with correct options', async () => {
      const exporter = new PdfExporter();
      const webContents = createMockWebContents();
      const options: PdfExportOptions = {
        outputPath: '/tmp/output.pdf',
        landscape: true,
        pageSize: 'Letter',
      };

      await exporter.exportView(webContents, options);

      expect(webContents.printToPDF).toHaveBeenCalledOnce();
      const callArgs = webContents.printToPDF.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs['landscape']).toBe(true);
    });

    it('should return the PDF buffer', async () => {
      const exporter = new PdfExporter();
      const expectedBuffer = new Uint8Array([37, 80, 68, 70]);
      const webContents = createMockWebContents(expectedBuffer);

      const result = await exporter.exportView(webContents, { outputPath: '/tmp/test.pdf' });

      expect(result).toBe(expectedBuffer);
    });

    it('should throw on invalid options', async () => {
      const exporter = new PdfExporter();
      const webContents = createMockWebContents();

      await expect(
        exporter.exportView(webContents, { outputPath: '' }),
      ).rejects.toThrow('PDF export validation failed');
    });

    it('should throw when outputPath has wrong extension', async () => {
      const exporter = new PdfExporter();
      const webContents = createMockWebContents();

      await expect(
        exporter.exportView(webContents, { outputPath: '/tmp/test.docx' }),
      ).rejects.toThrow('.pdf extension');
    });
  });

  describe('exportSession', () => {
    it('should throw without createOffscreenWindow factory', async () => {
      const exporter = new PdfExporter();
      const session = createMockSession();

      await expect(
        exporter.exportSession(session, { outputPath: '/tmp/test.pdf' }),
      ).rejects.toThrow('createOffscreenWindow factory is required');
    });

    it('should create offscreen window and export PDF', async () => {
      const exporter = new PdfExporter();
      const session = createMockSession();
      const mockBuffer = new Uint8Array([37, 80, 68, 70]);
      const mockWindow = {
        webContents: {
          printToPDF: vi.fn().mockResolvedValue(mockBuffer),
          loadURL: vi.fn().mockResolvedValue(undefined),
        },
        close: vi.fn(),
      };
      const factory = vi.fn().mockReturnValue(mockWindow);

      const result = await exporter.exportSession(
        session,
        { outputPath: '/tmp/session.pdf' },
        factory,
      );

      expect(factory).toHaveBeenCalledOnce();
      expect(mockWindow.webContents.loadURL).toHaveBeenCalledOnce();
      expect(mockWindow.close).toHaveBeenCalledOnce();
      expect(result).toBe(mockBuffer);
    });

    it('should close window even on error', async () => {
      const exporter = new PdfExporter();
      const session = createMockSession();
      const mockWindow = {
        webContents: {
          printToPDF: vi.fn().mockRejectedValue(new Error('print failed')),
          loadURL: vi.fn().mockResolvedValue(undefined),
        },
        close: vi.fn(),
      };
      const factory = vi.fn().mockReturnValue(mockWindow);

      await expect(
        exporter.exportSession(session, { outputPath: '/tmp/session.pdf' }, factory),
      ).rejects.toThrow('print failed');

      expect(mockWindow.close).toHaveBeenCalledOnce();
    });

    it('should use session ID as default title', async () => {
      const exporter = new PdfExporter();
      const session = createMockSession({ sessionId: 'my-session' });
      const mockWindow = {
        webContents: {
          printToPDF: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
          loadURL: vi.fn().mockResolvedValue(undefined),
        },
        close: vi.fn(),
      };
      const factory = vi.fn().mockReturnValue(mockWindow);

      await exporter.exportSession(session, { outputPath: '/tmp/out.pdf' }, factory);

      const loadedUrl = mockWindow.webContents.loadURL.mock.calls[0]![0] as string;
      const html = decodeURIComponent(loadedUrl.replace('data:text/html;charset=utf-8,', ''));
      expect(html).toContain('my-session');
    });
  });
});
