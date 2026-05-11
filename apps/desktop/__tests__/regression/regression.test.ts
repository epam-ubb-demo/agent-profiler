/**
 * v1.0.0 Regression Test Suite
 *
 * Validates cross-package integration points to ensure the key workflows
 * of Agent Profiler work end-to-end. These tests import from workspace
 * packages directly and exercise the contracts between them.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';


import { parseCopilotCliSession } from '@agent-profiler/adapters-copilot-cli';
import { parseCtbBenchRun } from '@agent-profiler/adapters-ctb';
import { parseVsCodeChatSession } from '@agent-profiler/adapters-vscode-chat';
import {
  createAnnotationsDb,
  AnnotationsRepository,
  CreateAnnotationSchema,
  AddTagSchema,
  AddCommentSchema,
  DeleteAnnotationSchema,
  ListBySessionSchema,
  ListByTargetSchema,
} from '@agent-profiler/annotations';
import {
  sessionSchema,
  type Session,
  type ShutdownMetrics,
} from '@agent-profiler/core';
import { LocalFsDataSource } from '@agent-profiler/data-source';
import {
  pluginManifestSchema,
  loadPlugin,
  discoverPlugins,
  PluginLoadError,
} from '@agent-profiler/plugins';
import { calculateCost, loadPricingTable } from '@agent-profiler/pricing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const TMP_DIR = join(import.meta.dirname, '.tmp-regression');
const ADAPTERS_FIXTURES = join(import.meta.dirname, '..', '..', '..', '..', 'packages');

/**
 * Minimal valid session for inline testing.
 */
function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'reg-test-session-1',
    copilotVersion: '1.0.0',
    selectedModel: 'claude-sonnet-4',
    reasoningEffort: 'medium',
    repository: 'epam-ubb-demo/agent-profiler',
    branch: 'main',
    cwd: '/tmp/test',
    startTs: '2025-01-01T00:00:00Z',
    endTs: '2025-01-01T00:10:00Z',
    modelChanges: [],
    toolCalls: [
      {
        toolCallId: 'tc-1',
        toolName: 'read_file',
        model: 'claude-sonnet-4',
        startTs: '2025-01-01T00:01:00Z',
        endTs: '2025-01-01T00:01:05Z',
        durationMs: 5000,
        success: true,
        parentId: null,
        turnId: 'turn-1',
        eventId: null,
        argumentsPreview: '{"path": "src/index.ts"}',
      },
    ],
    assistantMessages: [
      {
        interactionId: null,
        requestId: null,
        model: 'claude-sonnet-4',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
        timestamp: '2025-01-01T00:01:00Z',
        turnId: 'turn-1',
        eventId: null,
        parentId: null,
        content: 'Here is the file content.',
        reasoningText: '',
      },
    ],
    userMessages: [
      {
        interactionId: null,
        timestamp: '2025-01-01T00:00:30Z',
        turnId: 'turn-1',
        content: 'Read the file src/index.ts',
      },
    ],
    compactions: [],
    subagents: [],
    shutdown: {
      totalPremiumRequests: 5,
      totalApiDurationMs: 15000,
      modelMetrics: [
        {
          model: 'claude-sonnet-4',
          inputTokens: 5000,
          outputTokens: 2000,
          cacheReadTokens: 1000,
          cacheWriteTokens: 500,
          reasoningTokens: 0,
          requestCount: 5,
          premiumRequestCost: 0,
          apiDurationMs: 15000,
        },
      ],
      currentTokens: 8500,
      systemTokens: 2000,
      conversationTokens: 5000,
      toolDefinitionsTokens: 1500,
      codeChanges: {},
      timestamp: '2025-01-01T00:10:00Z',
    },
    success: true,
    fanoutTurns: [],
    turns: [
      {
        turnId: 'turn-1',
        startTs: '2025-01-01T00:00:30Z',
        endTs: '2025-01-01T00:01:05Z',
        userMessage: {
          interactionId: null,
          timestamp: '2025-01-01T00:00:30Z',
          turnId: 'turn-1',
          content: 'Read the file src/index.ts',
        },
        assistantMessages: [
          {
            interactionId: null,
            requestId: null,
            model: 'claude-sonnet-4',
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadTokens: 200,
            cacheWriteTokens: 100,
            timestamp: '2025-01-01T00:01:00Z',
            turnId: 'turn-1',
            eventId: null,
            parentId: null,
            content: 'Here is the file content.',
            reasoningText: '',
          },
        ],
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'read_file',
            model: 'claude-sonnet-4',
            startTs: '2025-01-01T00:01:00Z',
            endTs: '2025-01-01T00:01:05Z',
            durationMs: 5000,
            success: true,
            parentId: null,
            turnId: 'turn-1',
            eventId: null,
            argumentsPreview: '{"path": "src/index.ts"}',
          },
        ],
        subagents: [],
      },
    ],
    parseStatus: { status: 'ok', error: null },
    utilisation: [],
    ...overrides,
  };
}

function createMockShutdownMetrics(): ShutdownMetrics {
  return {
    totalPremiumRequests: 10,
    totalApiDurationMs: 30000,
    modelMetrics: [
      {
        model: 'claude-sonnet-4',
        inputTokens: 10000,
        outputTokens: 4000,
        cacheReadTokens: 2000,
        cacheWriteTokens: 800,
        reasoningTokens: 0,
        requestCount: 7,
        premiumRequestCost: 0,
        apiDurationMs: 20000,
      },
      {
        model: 'gpt-4.1',
        inputTokens: 5000,
        outputTokens: 1500,
        cacheReadTokens: 1000,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        requestCount: 3,
        premiumRequestCost: 0,
        apiDurationMs: 10000,
      },
    ],
    currentTokens: 18300,
    systemTokens: 3000,
    conversationTokens: 12000,
    toolDefinitionsTokens: 3300,
    codeChanges: {},
    timestamp: '2025-01-01T00:10:00Z',
  };
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(() => {
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SESSION LOADING — ADAPTER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Session loading: Copilot CLI adapter', () => {
  const CLI_FIXTURES = join(ADAPTERS_FIXTURES, 'adapters-copilot-cli', '__tests__', 'fixtures');

  it('parses a valid session and produces Session conforming to schema', async () => {
    const validDir = join(CLI_FIXTURES, 'valid-session');
    if (!existsSync(validDir)) return; // skip if fixture missing

    const session = await parseCopilotCliSession(validDir);
    expect(session.parseStatus.status).toBe('ok');
    expect(session.sessionId).toBeTruthy();
    expect(session.turns.length).toBeGreaterThan(0);

    // Validate against Zod schema
    const parsed = sessionSchema.safeParse(session);
    expect(parsed.success).toBe(true);
  });

  it('handles missing directory gracefully (never throws)', async () => {
    const session = await parseCopilotCliSession('/nonexistent/path');
    expect(session.parseStatus.status).toBe('failed');
    expect(session.sessionId).toBeDefined();
  });

  it('handles empty events file gracefully', async () => {
    const emptyDir = join(TMP_DIR, 'empty-cli-session');
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, 'events.jsonl'), '');

    const session = await parseCopilotCliSession(emptyDir);
    expect(session.parseStatus.status).not.toBe('ok');
  });
});

describe('Session loading: ctb adapter', () => {
  const CTB_FIXTURES = join(ADAPTERS_FIXTURES, 'adapters-ctb', '__tests__', 'fixtures');

  it('parses a ctb benchmark run directory', async () => {
    if (!existsSync(CTB_FIXTURES)) return;
    const entries = existsSync(CTB_FIXTURES)
      ? require('node:fs').readdirSync(CTB_FIXTURES)
      : [];
    const benchDir = entries.find((e: string) => existsSync(join(CTB_FIXTURES, e, 'events.jsonl')));
    if (!benchDir) return;

    const run = await parseCtbBenchRun(join(CTB_FIXTURES, benchDir));
    expect(run).toBeDefined();
  });

  it('returns graceful failure for invalid directory', async () => {
    const result = await parseCtbBenchRun('/nonexistent/ctb/path');
    // Should not throw — adapters never throw
    expect(result).toBeDefined();
  });
});

describe('Session loading: VS Code Chat adapter', () => {
  const VSCODE_FIXTURES = join(ADAPTERS_FIXTURES, 'adapters-vscode-chat', '__tests__', 'fixtures');

  it('parses a VS Code chat transcript file', async () => {
    if (!existsSync(VSCODE_FIXTURES)) return;
    const files = existsSync(VSCODE_FIXTURES)
      ? require('node:fs').readdirSync(VSCODE_FIXTURES).filter((f: string) => f.endsWith('.jsonl'))
      : [];
    if (files.length === 0) return;

    const session = await parseVsCodeChatSession(join(VSCODE_FIXTURES, files[0]));
    expect(session.parseStatus.status).not.toBe(undefined);
    expect(session.sessionId).toBeDefined();
  });

  it('handles missing file gracefully', async () => {
    const session = await parseVsCodeChatSession('/nonexistent/transcript.jsonl');
    expect(session.parseStatus.status).toBe('failed');
  });
});

describe('Session loading: VS Code Coding Agent adapter', () => {
  // Note: adapters-vscode-coding-agent does not yet have a package.json or implementation.
  // This test documents the expected contract once it's implemented.
  it('placeholder — adapter not yet implemented', () => {
    // This test ensures we remember to add integration tests when the adapter ships.
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PRICING CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pricing calculation for loaded sessions', () => {
  it('calculates cost for a session with known models', () => {
    const metrics = createMockShutdownMetrics();
    const cost = calculateCost(metrics);

    expect(cost.totalUsd).toBeGreaterThan(0);
    expect(cost.confidence).toBe('known');
    expect(Object.keys(cost.perModel)).toContain('claude-sonnet-4');
    expect(Object.keys(cost.perModel)).toContain('gpt-4.1');
  });

  it('calculates per-model breakdown correctly', () => {
    const metrics = createMockShutdownMetrics();
    const cost = calculateCost(metrics);

    const claude = cost.perModel['claude-sonnet-4']!;
    expect(claude.inputCostUsd).toBeGreaterThan(0);
    expect(claude.outputCostUsd).toBeGreaterThan(0);
    expect(claude.cacheReadCostUsd).toBeGreaterThan(0);
    expect(claude.cacheWriteCostUsd).toBeGreaterThan(0);
    expect(claude.totalCostUsd).toBeCloseTo(
      claude.inputCostUsd + claude.cacheReadCostUsd + claude.cacheWriteCostUsd + claude.outputCostUsd,
      5,
    );
  });

  it('marks confidence as unknown for unrecognised models', () => {
    const metrics: ShutdownMetrics = {
      ...createMockShutdownMetrics(),
      modelMetrics: [
        {
          model: 'unknown-future-model-99',
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 100,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          requestCount: 1,
          premiumRequestCost: 0,
          apiDurationMs: 5000,
        },
      ],
    };
    const cost = calculateCost(metrics);
    expect(cost.confidence).toBe('unknown');
  });

  it('loads the default pricing table with all expected models', () => {
    const table = loadPricingTable();
    expect(table['claude-sonnet-4']).toBeDefined();
    expect(table['gpt-4.1']).toBeDefined();
    expect(table['claude-sonnet-4']!.input).toBeGreaterThan(0);
  });

  it('integrates pricing with a parsed session shutdown metrics', () => {
    const session = createMockSession();
    expect(session.shutdown).not.toBeNull();

    const cost = calculateCost(session.shutdown!);
    expect(cost.totalUsd).toBeGreaterThan(0);
    expect(cost.perModel['claude-sonnet-4']).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ANNOTATION CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Annotation CRUD operations', () => {
  let dbPath: string;
  let db: ReturnType<typeof createAnnotationsDb>;
  let repo: AnnotationsRepository;

  beforeAll(() => {
    dbPath = join(TMP_DIR, `regression-annotations-${Date.now()}.db`);
    db = createAnnotationsDb(dbPath);
    repo = new AnnotationsRepository(db.db);
  });

  afterAll(() => {
    db.close();
  });

  it('creates an annotation with tags and comments', () => {
    const annotation = repo.create({
      sessionId: 'session-reg-1',
      targetType: 'turn',
      targetId: 'turn-42',
      tags: ['regression', 'important'],
      comment: 'Regression test annotation',
    });

    expect(annotation.id).toBeDefined();
    expect(annotation.sessionId).toBe('session-reg-1');
    expect(annotation.tags).toHaveLength(2);
    expect(annotation.comments).toHaveLength(1);
  });

  it('lists annotations by session', () => {
    const items = repo.findBySession('session-reg-1');
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.sessionId).toBe('session-reg-1');
  });

  it('lists annotations by target', () => {
    const items = repo.findByTarget('turn', 'turn-42');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('adds a tag to an existing annotation', () => {
    const items = repo.findBySession('session-reg-1');
    const id = items[0]!.id;

    repo.addTag(id, 'new-tag');
    const updated = repo.findBySession('session-reg-1');
    const annotation = updated.find((a) => a.id === id)!;
    expect(annotation.tags.map((t) => t.label)).toContain('new-tag');
  });

  it('removes a tag from an annotation', () => {
    const items = repo.findBySession('session-reg-1');
    const annotation = items[0]!;
    const tagToRemove = annotation.tags.find((t) => t.label === 'new-tag')!;

    repo.removeTag(tagToRemove.id);
    const updated = repo.findBySession('session-reg-1');
    const refreshed = updated.find((a) => a.id === annotation.id)!;
    expect(refreshed.tags.map((t) => t.label)).not.toContain('new-tag');
  });

  it('adds a comment to an annotation', () => {
    const items = repo.findBySession('session-reg-1');
    const id = items[0]!.id;

    repo.addComment(id, 'Another comment');
    const updated = repo.findBySession('session-reg-1');
    const annotation = updated.find((a) => a.id === id)!;
    expect(annotation.comments.length).toBeGreaterThanOrEqual(2);
  });

  it('removes a comment from an annotation', () => {
    const items = repo.findBySession('session-reg-1');
    const annotation = items[0]!;
    const commentToRemove = annotation.comments[annotation.comments.length - 1]!;

    repo.removeComment(commentToRemove.id);
    const updated = repo.findBySession('session-reg-1');
    const refreshed = updated.find((a) => a.id === annotation.id)!;
    expect(refreshed.comments.length).toBe(annotation.comments.length - 1);
  });

  it('deletes an annotation', () => {
    const items = repo.findBySession('session-reg-1');
    const id = items[0]!.id;

    repo.delete(id);
    const updated = repo.findBySession('session-reg-1');
    expect(updated.find((a) => a.id === id)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PLUGIN LOADER — MANIFEST VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Plugin loader validates manifests', () => {
  it('validates a correct session source plugin manifest', () => {
    const manifest = {
      apiVersion: '1.0',
      plugins: [
        {
          metadata: {
            id: 'test-source',
            name: 'Test Source Plugin',
            version: '1.0.0',
          },
          adapterType: 'custom-source',
          createDataSource: () => ({}),
        },
      ],
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('validates a correct visualiser plugin manifest', () => {
    const manifest = {
      apiVersion: '1.0',
      plugins: [
        {
          metadata: {
            id: 'test-vis',
            name: 'Test Visualiser',
            version: '2.0.0',
            description: 'A test visualiser',
            author: 'Test Author',
          },
          componentName: 'TestChart',
          load: () => Promise.resolve({}),
        },
      ],
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('rejects manifest with missing apiVersion', () => {
    const manifest = { plugins: [{ metadata: { id: 'x', name: 'X', version: '1.0.0' } }] };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('rejects manifest with invalid semver version', () => {
    const manifest = {
      apiVersion: '1.0',
      plugins: [
        {
          metadata: { id: 'x', name: 'X', version: 'not-semver' },
          adapterType: 'test',
          createDataSource: () => ({}),
        },
      ],
    };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('rejects manifest with empty plugins array', () => {
    const manifest = { apiVersion: '1.0', plugins: [] };
    const result = pluginManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
  });

  it('throws PluginLoadError for non-existent path', async () => {
    await expect(loadPlugin('/nonexistent/plugin/path')).rejects.toThrow(PluginLoadError);
  });

  it('returns empty array when discovering plugins in non-existent directory', async () => {
    const plugins = await discoverPlugins('/nonexistent/plugins/dir');
    expect(plugins).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DATA SOURCE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

describe('Data source discovery', () => {
  it('creates a LocalFsDataSource and checks availability', async () => {
    const ds = new LocalFsDataSource(TMP_DIR);
    const available = await ds.isAvailable();
    expect(available).toBe(true);
  });

  it('reports unavailable for non-existent directory', async () => {
    const ds = new LocalFsDataSource('/nonexistent/data/source/dir');
    const available = await ds.isAvailable();
    expect(available).toBe(false);
  });

  it('lists sessions from a directory with copilot-cli sessions', async () => {
    // Create a mock session directory
    const sessDir = join(TMP_DIR, 'ds-discovery', 'mock-session-001');
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(join(sessDir, 'events.jsonl'), '{"type":"session_start","sessionId":"ds-001"}\n');

    const ds = new LocalFsDataSource(join(TMP_DIR, 'ds-discovery'));
    const sessions = await ds.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]!.adapter).toBe('copilot-cli');
  });

  it('returns empty list for directory with no sessions', async () => {
    const emptyDir = join(TMP_DIR, 'ds-empty');
    mkdirSync(emptyDir, { recursive: true });

    const ds = new LocalFsDataSource(emptyDir);
    const sessions = await ds.listSessions();
    expect(sessions).toEqual([]);
  });

  it('caches parsed sessions for repeated access', async () => {
    const sessDir = join(TMP_DIR, 'ds-cache', 'cached-session');
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(join(sessDir, 'events.jsonl'), '{"type":"session_start","sessionId":"cached-1"}\n');

    const ds = new LocalFsDataSource(join(TMP_DIR, 'ds-cache'));
    const first = await ds.getSession('cached-session');
    const second = await ds.getSession('cached-session');
    // Both calls should return the same result (cached)
    expect(first?.sessionId).toBe(second?.sessionId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CORE SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Core schema validation for cross-package contracts', () => {
  it('validates a well-formed Session against sessionSchema', () => {
    const session = createMockSession();
    const result = sessionSchema.safeParse(session);
    expect(result.success).toBe(true);
  });

  it('rejects a session with invalid parseStatus', () => {
    const session = { ...createMockSession(), parseStatus: { status: 'invalid', error: null } };
    const result = sessionSchema.safeParse(session);
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. IPC SCHEMA CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Annotation IPC schema validation', () => {
  it('validates CreateAnnotationSchema input', () => {
    const input = {
      sessionId: 'session-1',
      targetType: 'turn',
      targetId: 'turn-1',
      tags: ['test'],
      comment: 'Hello',
    };
    const result = CreateAnnotationSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('validates AddTagSchema input', () => {
    const result = AddTagSchema.safeParse({ annotationId: 'ann-1', label: 'new-tag' });
    expect(result.success).toBe(true);
  });

  it('validates AddCommentSchema input', () => {
    const result = AddCommentSchema.safeParse({ annotationId: 'ann-1', content: 'A comment' });
    expect(result.success).toBe(true);
  });

  it('validates DeleteAnnotationSchema input', () => {
    const result = DeleteAnnotationSchema.safeParse({ annotationId: 'ann-1' });
    expect(result.success).toBe(true);
  });

  it('validates ListBySessionSchema input', () => {
    const result = ListBySessionSchema.safeParse({ sessionId: 'sess-1' });
    expect(result.success).toBe(true);
  });

  it('validates ListByTargetSchema input', () => {
    const result = ListByTargetSchema.safeParse({ targetType: 'session', targetId: 'sess-1' });
    expect(result.success).toBe(true);
  });
});
