import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionDataSource, SessionListItem } from '@agent-profiler/data-source';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@agent-profiler/data-source', () => ({
  LocalFsDataSource: vi.fn(),
}));

vi.mock('@agent-profiler/adapters-application-insights', () => ({
  ApplicationInsightsDataSource: vi.fn(),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

import { LocalFsDataSource } from '@agent-profiler/data-source';
import { ApplicationInsightsDataSource } from '@agent-profiler/adapters-application-insights';

import { DataSourceManager } from '../data-source-manager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSessionItem(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: 'session-1',
    name: 'session-1',
    path: '/path/session-1',
    createdAt: new Date('2024-12-01T10:00:00Z'),
    adapter: 'copilot-cli',
    ...overrides,
  };
}

function makeMockDataSource(overrides: Partial<SessionDataSource> = {}): SessionDataSource {
  return {
    listSessions: vi.fn<() => Promise<SessionListItem[]>>().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    isAvailable: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DataSourceManager', () => {
  let mockLocalSource: SessionDataSource;

  beforeEach(() => {
    mockLocalSource = makeMockDataSource();

    // LocalFsDataSource constructor returns our mock instance
    vi.mocked(LocalFsDataSource).mockImplementation(() => mockLocalSource as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── listSessions ──────────────────────────────────────────────────────────

  describe('listSessions', () => {
    it('returns local sessions only when AppInsights is not configured', async () => {
      const localItems = [makeSessionItem({ id: 'local-1' }), makeSessionItem({ id: 'local-2' })];
      vi.mocked(mockLocalSource.listSessions).mockResolvedValue(localItems);

      const manager = new DataSourceManager('/root');
      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s: SessionListItem) => s.id)).toEqual(['local-1', 'local-2']);
    });

    it('merges sessions from both sources when AppInsights is configured', async () => {
      const localItems = [makeSessionItem({ id: 'local-1' })];
      vi.mocked(mockLocalSource.listSessions).mockResolvedValue(localItems);

      const mockAiSource = makeMockDataSource({
        listSessions: vi.fn<() => Promise<SessionListItem[]>>().mockResolvedValue([
          makeSessionItem({ id: 'ai-1', adapter: 'application-insights' }),
        ]),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s: SessionListItem) => s.id)).toContain('local-1');
      expect(sessions.map((s: SessionListItem) => s.id)).toContain('ai-1');
    });

    it('returns local sessions when AppInsights listSessions rejects (graceful degradation)', async () => {
      const localItems = [makeSessionItem({ id: 'local-1' })];
      vi.mocked(mockLocalSource.listSessions).mockResolvedValue(localItems);

      const mockAiSource = makeMockDataSource({
        listSessions: vi.fn().mockRejectedValue(new Error('network error')),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe('local-1');
    });

    it('deduplicates sessions by ID — first source wins', async () => {
      const duplicateId = 'dup-session';
      const localItem = makeSessionItem({ id: duplicateId, adapter: 'copilot-cli' });
      const aiItem = makeSessionItem({ id: duplicateId, adapter: 'application-insights' });

      vi.mocked(mockLocalSource.listSessions).mockResolvedValue([localItem]);

      const mockAiSource = makeMockDataSource({
        listSessions: vi.fn<() => Promise<SessionListItem[]>>().mockResolvedValue([aiItem]),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      const sessions = await manager.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.adapter).toBe('copilot-cli');
    });
  });

  // ── getSession ────────────────────────────────────────────────────────────

  describe('getSession', () => {
    it('returns local session when found', async () => {
      const mockSession = { sessionId: 'found' };
      vi.mocked(mockLocalSource.getSession).mockResolvedValue(mockSession as never);

      const manager = new DataSourceManager('/root');
      const result = await manager.getSession('found');

      expect(result).toEqual(mockSession);
      expect(mockLocalSource.getSession).toHaveBeenCalledWith('found');
    });

    it('falls through to AppInsights when local returns null', async () => {
      vi.mocked(mockLocalSource.getSession).mockResolvedValue(null);

      const mockSession = { sessionId: 'ai-only' };
      const mockAiSource = makeMockDataSource({
        getSession: vi.fn().mockResolvedValue(mockSession),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      const result = await manager.getSession('ai-only');

      expect(result).toEqual(mockSession);
      expect(mockLocalSource.getSession).toHaveBeenCalledWith('ai-only');
      expect(mockAiSource.getSession).toHaveBeenCalledWith('ai-only');
    });

    it('returns null when both sources fail', async () => {
      vi.mocked(mockLocalSource.getSession).mockResolvedValue(null);

      const mockAiSource = makeMockDataSource({
        getSession: vi.fn().mockResolvedValue(null),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      const result = await manager.getSession('unknown');

      expect(result).toBeNull();
    });
  });

  // ── testConnection ────────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('returns failure when AppInsights is not configured', async () => {
      const manager = new DataSourceManager('/root');
      const result = await manager.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success with session count when configured', async () => {
      const mockAiSource = makeMockDataSource({
        isAvailable: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
        listSessions: vi.fn<() => Promise<SessionListItem[]>>().mockResolvedValue([
          makeSessionItem({ id: 'ai-1' }),
          makeSessionItem({ id: 'ai-2' }),
          makeSessionItem({ id: 'ai-3' }),
        ]),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      const result = await manager.testConnection();

      expect(result.success).toBe(true);
      expect(result.sessionCount).toBe(3);
    });
  });

  // ── configureAppInsights ──────────────────────────────────────────────────

  describe('configureAppInsights', () => {
    it('disables AppInsights when workspaceId is empty', async () => {
      const mockAiSource = makeMockDataSource({
        listSessions: vi.fn<() => Promise<SessionListItem[]>>().mockResolvedValue([
          makeSessionItem({ id: 'ai-1' }),
        ]),
      });
      vi.mocked(ApplicationInsightsDataSource).mockImplementation(() => mockAiSource as never);

      const manager = new DataSourceManager('/root');
      // First enable
      manager.configureAppInsights({ workspaceId: 'ws-123' });
      // Then disable with empty workspaceId
      manager.configureAppInsights({ workspaceId: '' });

      vi.mocked(mockLocalSource.listSessions).mockResolvedValue([
        makeSessionItem({ id: 'local-1' }),
      ]);
      const sessions = await manager.listSessions();

      // Should only have local sessions — AppInsights source was cleared
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe('local-1');
    });
  });
});
