import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EnrichmentRow } from '@agent-profiler/core';

import { OtlpLogsWriter } from '../src/otlp-logs-writer';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

const ROW: EnrichmentRow = {
  TimeGenerated: '2025-01-15T10:00:00.000Z',
  EventId: 'sess-1:utilisation:0',
  SessionId: 'sess-1',
  Category: 'utilisation',
  Payload: { contextWindowUtilisation: 0.42 },
  SchemaVersion: 1,
  SourceUser: 'test-user',
  SourceMachine: 'test-machine',
  PushedAt: '',
};

// ─────────────────────────────────────────────────────────────────────────
// Mocking setup
// ─────────────────────────────────────────────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('OtlpLogsWriter', () => {
  // ───────────────────────────────────────────────────────────────────────
  // Constructor normalization tests
  // ───────────────────────────────────────────────────────────────────────

  describe('constructor endpoint normalisation', () => {
    it('strips trailing slash and appends /v1/logs', () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://example.com/',
      });

      // Trigger a fetch to verify the endpoint is correct
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      writer.push([ROW]);

      const [endpoint] = mockFetch.mock.calls[0];
      expect(endpoint).toBe('https://example.com/v1/logs');
    });

    it('handles multiple trailing slashes', () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://example.com///',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      writer.push([ROW]);

      const [endpoint] = mockFetch.mock.calls[0];
      expect(endpoint).toBe('https://example.com/v1/logs');
    });

    it('appends /v1/logs when no trailing slash', () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      writer.push([ROW]);

      const [endpoint] = mockFetch.mock.calls[0];
      expect(endpoint).toBe('https://example.com/v1/logs');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Empty array handling
  // ───────────────────────────────────────────────────────────────────────

  describe('push() with empty array', () => {
    it('returns 0 without making a fetch call', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://example.com',
      });

      const result = await writer.push([]);

      expect(result).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Payload structure verification
  // ───────────────────────────────────────────────────────────────────────

  describe('push() OTLP payload structure', () => {
    it('sends POST request with correct headers and endpoint', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await writer.push([ROW]);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [endpoint, options] = mockFetch.mock.calls[0];
      expect(endpoint).toBe('https://otel.example.com/v1/logs');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('includes resource attributes with service name and namespace', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await writer.push([ROW]);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.resourceLogs).toHaveLength(1);
      const resourceAttributes = body.resourceLogs[0].resource.attributes;

      expect(resourceAttributes).toContainEqual({
        key: 'service.name',
        value: { stringValue: 'agent-profiler-desktop' },
      });

      expect(resourceAttributes).toContainEqual({
        key: 'service.namespace',
        value: { stringValue: 'agent-profiler' },
      });
    });

    it('includes scope with correct name and version', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await writer.push([ROW]);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      const scope = body.resourceLogs[0].scopeLogs[0].scope;
      expect(scope.name).toBe('agent-profiler.enrichment');
      expect(scope.version).toBe('1');
    });

    it('maps EnrichmentRow fields to OTLP log record attributes', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await writer.push([ROW]);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      const attributes = body.resourceLogs[0].scopeLogs[0].logRecords[0].attributes;

      expect(attributes).toContainEqual({
        key: 'agent_profiler.enrichment',
        value: { boolValue: true },
      });

      expect(attributes).toContainEqual({
        key: 'agent_profiler.session_id',
        value: { stringValue: 'sess-1' },
      });

      expect(attributes).toContainEqual({
        key: 'agent_profiler.category',
        value: { stringValue: 'utilisation' },
      });

      expect(attributes).toContainEqual({
        key: 'agent_profiler.event_id',
        value: { stringValue: 'sess-1:utilisation:0' },
      });

      expect(attributes).toContainEqual({
        key: 'agent_profiler.schema_version',
        value: { intValue: '1' },
      });

      expect(attributes).toContainEqual({
        key: 'agent_profiler.source_user',
        value: { stringValue: 'test-user' },
      });

      expect(attributes).toContainEqual({
        key: 'agent_profiler.source_machine',
        value: { stringValue: 'test-machine' },
      });

      // Verify pushed_at is present (we can't test exact value due to timing)
      const pushedAtAttr = attributes.find((a: any) => a.key === 'agent_profiler.pushed_at');
      expect(pushedAtAttr).toBeDefined();
      expect(pushedAtAttr.value.stringValue).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('converts Payload to JSON string in log body', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await writer.push([ROW]);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      const logRecord = body.resourceLogs[0].scopeLogs[0].logRecords[0];
      const payload = JSON.parse(logRecord.body.stringValue);

      expect(payload).toEqual({ contextWindowUtilisation: 0.42 });
    });

    it('converts TimeGenerated to correct timeUnixNano format', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await writer.push([ROW]);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      const logRecord = body.resourceLogs[0].scopeLogs[0].logRecords[0];

      // TimeGenerated: 2025-01-15T10:00:00.000Z
      // getTime() returns milliseconds: 1736937600000
      // Multiply by 1_000_000 for nanoseconds: 1736937600000000000
      const expectedTimeNano = String(
        new Date('2025-01-15T10:00:00.000Z').getTime() * 1_000_000,
      );

      expect(logRecord.timeUnixNano).toBe(expectedTimeNano);
    });

    it('handles multiple rows correctly', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const row2: EnrichmentRow = {
        ...ROW,
        SessionId: 'sess-2',
        EventId: 'sess-2:utilisation:1',
      };

      await writer.push([ROW, row2]);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      const logRecords = body.resourceLogs[0].scopeLogs[0].logRecords;
      expect(logRecords).toHaveLength(2);

      expect(logRecords[0].attributes).toContainEqual({
        key: 'agent_profiler.session_id',
        value: { stringValue: 'sess-1' },
      });

      expect(logRecords[1].attributes).toContainEqual({
        key: 'agent_profiler.session_id',
        value: { stringValue: 'sess-2' },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Success and return value
  // ───────────────────────────────────────────────────────────────────────

  describe('push() return value on success', () => {
    it('returns row count when response is ok', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await writer.push([ROW]);

      expect(result).toBe(1);
    });

    it('returns correct count for multiple rows', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const rows = [ROW, { ...ROW, SessionId: 'sess-2' }];
      const result = await writer.push(rows);

      expect(result).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Error handling
  // ───────────────────────────────────────────────────────────────────────

  describe('push() error handling', () => {
    it('throws error on non-ok response with status and text', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Something went wrong',
      });

      await expect(writer.push([ROW])).rejects.toThrow(
        'OTLP push failed (500 Internal Server Error): Something went wrong',
      );
    });

    it('includes status code in error message on non-ok response', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      });

      await expect(writer.push([ROW])).rejects.toThrow('401');
    });

    it('handles response.text() failure gracefully', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => {
          throw new Error('Text parsing failed');
        },
      });

      await expect(writer.push([ROW])).rejects.toThrow('OTLP push failed (503 Service Unavailable):');
    });

    it('throws error on 400 Bad Request', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid payload',
      });

      await expect(writer.push([ROW])).rejects.toThrow(
        'OTLP push failed (400 Bad Request): Invalid payload',
      );
    });

    it('throws error on 404 Not Found', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Endpoint not found',
      });

      await expect(writer.push([ROW])).rejects.toThrow(
        'OTLP push failed (404 Not Found): Endpoint not found',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Response status code handling
  // ───────────────────────────────────────────────────────────────────────

  describe('push() response status handling', () => {
    it('treats status 200 as ok', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await writer.push([ROW]);
      expect(result).toBe(1);
    });

    it('treats status 201 as ok', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
      });

      const result = await writer.push([ROW]);
      expect(result).toBe(1);
    });

    it('treats status 202 as ok', async () => {
      const writer = new OtlpLogsWriter({
        otlpEndpoint: 'https://otel.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        statusText: 'Accepted',
      });

      const result = await writer.push([ROW]);
      expect(result).toBe(1);
    });
  });
});
