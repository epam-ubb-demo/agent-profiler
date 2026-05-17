import { describe, it, expect } from 'vitest';

import {
  buildScopedSessionListKql,
  buildTeamViewFilter,
  buildUserViewFilter,
  escapeKqlString,
  AGENT_SESSION_EVENTS_TABLE,
} from '@agent-profiler/enrichment-core';

describe('escapeKqlString', () => {
  it('leaves a plain string unchanged', () => {
    expect(escapeKqlString('acme-corp')).toBe('acme-corp');
  });

  it('escapes double quotes', () => {
    expect(escapeKqlString('acme"corp')).toBe('acme\\"corp');
  });

  it('escapes single quotes', () => {
    expect(escapeKqlString("alice's org")).toBe("alice\\'s org");
  });

  it('escapes backslashes', () => {
    expect(escapeKqlString('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes newlines', () => {
    expect(escapeKqlString('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes carriage returns', () => {
    expect(escapeKqlString('line1\rline2')).toBe('line1\\rline2');
  });

  it('escapes multiple special characters in one value', () => {
    expect(escapeKqlString('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
  });
});

describe('buildTeamViewFilter', () => {
  it('returns a KQL where clause for TenantId', () => {
    expect(buildTeamViewFilter('acme-corp')).toBe('| where TenantId == "acme-corp"');
  });

  it('escapes special characters in tenantId', () => {
    expect(buildTeamViewFilter('org"name')).toBe('| where TenantId == "org\\"name"');
  });

  it('uses the AGENT_SESSION_EVENTS_TABLE constant in the right context', () => {
    expect(AGENT_SESSION_EVENTS_TABLE).toBe('AgentSessionEvents_CL');
  });
});

describe('buildUserViewFilter', () => {
  it('returns a KQL where clause for SourceUser', () => {
    expect(buildUserViewFilter('alice@example.com')).toBe(
      '| where SourceUser == "alice@example.com"',
    );
  });

  it('escapes special characters in userId', () => {
    expect(buildUserViewFilter('user"name')).toBe('| where SourceUser == "user\\"name"');
  });
});

describe('buildScopedSessionListKql', () => {
  it('produces the correct query with both tenantId and userId', () => {
    const kql = buildScopedSessionListKql({
      tenantId: 'acme-corp',
      userId: 'alice@example.com',
    });

    expect(kql).toContain('AgentSessionEvents_CL');
    expect(kql).toContain('| where TenantId == "acme-corp"');
    expect(kql).toContain('| where SourceUser == "alice@example.com"');
    expect(kql).toContain('| summarize ');
    expect(kql).toContain('Tool = take_any(Tool)');
    expect(kql).toContain('EventCount = count()');
    expect(kql).toContain('by SessionId');
    expect(kql).toContain('| order by LastEventTs desc');
    expect(kql).toContain('| take 200');
  });

  it('produces the correct query with only tenantId (team view)', () => {
    const kql = buildScopedSessionListKql({ tenantId: 'acme-corp' });

    expect(kql).toContain('| where TenantId == "acme-corp"');
    expect(kql).not.toContain('SourceUser');
    expect(kql).toContain('| take 200');
  });

  it('produces the correct query with only userId (personal view)', () => {
    const kql = buildScopedSessionListKql({ userId: 'alice@example.com' });

    expect(kql).toContain('| where SourceUser == "alice@example.com"');
    expect(kql).not.toContain('TenantId ==');
    expect(kql).toContain('| take 200');
  });

  it('produces a query with no where clauses when scope is empty', () => {
    const kql = buildScopedSessionListKql({});

    expect(kql).not.toContain('| where');
    expect(kql).toContain('AgentSessionEvents_CL');
    expect(kql).toContain('| summarize ');
    expect(kql).toContain('| take 200');
  });

  it('respects a custom limit', () => {
    const kql = buildScopedSessionListKql({ limit: 50 });
    expect(kql).toContain('| take 50');
    expect(kql).not.toContain('| take 200');
  });

  it('defaults to limit 200', () => {
    const kql = buildScopedSessionListKql({});
    expect(kql).toContain('| take 200');
  });

  it('starts with the table name on its own line', () => {
    const kql = buildScopedSessionListKql({ tenantId: 'acme' });
    expect(kql.startsWith('AgentSessionEvents_CL\n')).toBe(true);
  });

  it('escapes special characters in tenantId and userId', () => {
    const kql = buildScopedSessionListKql({
      tenantId: 'org"name',
      userId: 'user\\id',
    });
    expect(kql).toContain('| where TenantId == "org\\"name"');
    expect(kql).toContain('| where SourceUser == "user\\\\id"');
  });

  it('includes all summarise aggregation columns', () => {
    const kql = buildScopedSessionListKql({});

    expect(kql).toContain('Tool = take_any(Tool)');
    expect(kql).toContain('EventCount = count()');
    expect(kql).toContain('FirstEventTs = min(EventTs)');
    expect(kql).toContain('LastEventTs = max(EventTs)');
    expect(kql).toContain('SourceMachine = take_any(SourceMachine)');
  });
});
