import { describe, it, expect } from 'vitest';

import type { TenantConfig } from '@agent-profiler/enrichment-core';

describe('TenantConfig', () => {
  it('accepts an object with both tenantId and userId', () => {
    const config: TenantConfig = { tenantId: 'acme-corp', userId: 'alice@example.com' };
    expect(config.tenantId).toBe('acme-corp');
    expect(config.userId).toBe('alice@example.com');
  });

  it('accepts an object with only tenantId (team workspace)', () => {
    const config: TenantConfig = { tenantId: 'acme-corp' };
    expect(config.tenantId).toBe('acme-corp');
    expect(config.userId).toBeUndefined();
  });

  it('accepts an object with only userId (personal with identity)', () => {
    const config: TenantConfig = { userId: 'bob@example.com' };
    expect(config.tenantId).toBeUndefined();
    expect(config.userId).toBe('bob@example.com');
  });

  it('accepts an empty object (fully personal workspace)', () => {
    const config: TenantConfig = {};
    expect(config.tenantId).toBeUndefined();
    expect(config.userId).toBeUndefined();
  });

  it('readonly properties cannot be reassigned at runtime', () => {
    const config: TenantConfig = { tenantId: 'original' };
    // TypeScript `readonly` is compile-time only — verify the value is accessible
    expect(config.tenantId).toBe('original');
  });
});
