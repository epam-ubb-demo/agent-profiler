/**
 * Integration tests for the Application Insights data source.
 *
 * These tests exercise the real Azure SDK against a live Log Analytics
 * workspace. They are skipped unless the following environment variables
 * are set:
 *
 *   APPINSIGHTS_WORKSPACE_ID  – the Log Analytics workspace GUID
 *
 * Authentication uses `DefaultAzureCredential` (az login, managed identity,
 * env vars, etc.).
 *
 * Run manually:
 *   APPINSIGHTS_WORKSPACE_ID=<guid> pnpm --filter @agent-profiler/adapters-application-insights test
 */

import { describe, it, expect } from 'vitest';

import { ApplicationInsightsDataSource } from '../src/data-source';

const WORKSPACE_ID = process.env['APPINSIGHTS_WORKSPACE_ID'] ?? '';

describe.skipIf(!WORKSPACE_ID)('ApplicationInsightsDataSource — live integration', () => {
  // Use a generous timeout for real network calls
  const TIMEOUT = 30_000;

  const createDataSource = (): ApplicationInsightsDataSource =>
    new ApplicationInsightsDataSource({
      workspaceId: WORKSPACE_ID,
      // DefaultAzureCredential is used when no explicit credential is provided
    });

  it(
    'isAvailable() returns true for a valid workspace',
    async () => {
      const ds = createDataSource();
      const available = await ds.isAvailable();

      expect(available).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'listSessions() returns an array (possibly empty)',
    async () => {
      const ds = createDataSource();
      const sessions = await ds.listSessions();

      expect(Array.isArray(sessions)).toBe(true);
      // Each item should have the expected shape
      for (const s of sessions) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('path');
        expect(s).toHaveProperty('createdAt');
        expect(s).toHaveProperty('adapter', 'application-insights');
      }
    },
    TIMEOUT,
  );

  it(
    'getSession() returns a Session or null for a listed session',
    async () => {
      const ds = createDataSource();
      const sessions = await ds.listSessions();

      if (sessions.length === 0) {
        // No sessions available — just verify the method handles it gracefully
        const result = await ds.getSession('non-existent-session-id');
        expect(result).toBeNull();
        return;
      }

      const session = await ds.getSession(sessions[0]!.id);

      // The session may be null if the underlying spans are no longer available
      if (session === null) {
        return;
      }

      expect(session.sessionId).toBe(sessions[0]!.id);
      expect(session.parseStatus).toHaveProperty('status');
      expect(session.turns).toBeDefined();
      expect(session.fanoutTurns).toBeDefined();
    },
    TIMEOUT,
  );

  it(
    'isAvailable() returns false for an invalid workspace ID',
    async () => {
      const ds = new ApplicationInsightsDataSource({
        workspaceId: '00000000-0000-0000-0000-000000000000',
      });

      const available = await ds.isAvailable();

      expect(available).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'listSessions() returns empty array for an invalid workspace',
    async () => {
      const ds = new ApplicationInsightsDataSource({
        workspaceId: '00000000-0000-0000-0000-000000000000',
      });

      const sessions = await ds.listSessions();

      expect(sessions).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    'getSession() returns null for a non-existent session ID',
    async () => {
      const ds = createDataSource();
      const result = await ds.getSession('definitely-does-not-exist-12345');

      expect(result).toBeNull();
    },
    TIMEOUT,
  );
});
