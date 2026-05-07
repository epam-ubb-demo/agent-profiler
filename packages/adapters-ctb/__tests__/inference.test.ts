/**
 * Tests for the inference module.
 */

import { describe, expect, it } from 'vitest';

import { inferMetadata, inferStepIndex, inferVariantId } from '../src/inference';

describe('inferMetadata', () => {
  it('infers bench name and run ID from timestamp directory', () => {
    const result = inferMetadata('/some/path/.ctb/runs/fix-bug/2024-01-15T10-30-00');

    expect(result.benchName).toBe('fix-bug');
    expect(result.runId).toBe('2024-01-15T10-30-00');
  });

  it('handles path with only timestamp directory', () => {
    const result = inferMetadata('/2024-01-15T10-30-00');

    expect(result.runId).toBe('2024-01-15T10-30-00');
    // dirname('/2024-01-15T10-30-00') is '/', basename('/') is ''
    expect(result.benchName).toBeNull();
  });

  it('returns directory name as run ID when not a timestamp', () => {
    const result = inferMetadata('/some/path/my-run');

    expect(result.runId).toBe('my-run');
    expect(result.benchName).toBeNull();
  });

  it('handles empty path gracefully', () => {
    const result = inferMetadata('');

    // basename('') and dirname('') are both '.'
    expect(result.runId).toBeNull();
    expect(result.benchName).toBeNull();
  });
});

describe('inferVariantId', () => {
  it('returns directory name as variant ID', () => {
    expect(inferVariantId('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-20250514');
    expect(inferVariantId('gpt-4.1')).toBe('gpt-4.1');
  });
});

describe('inferStepIndex', () => {
  it('extracts step index from valid pattern', () => {
    expect(inferStepIndex('step-0')).toBe(0);
    expect(inferStepIndex('step-1')).toBe(1);
    expect(inferStepIndex('step-12')).toBe(12);
  });

  it('returns null for malformed step names', () => {
    expect(inferStepIndex('step-')).toBeNull();
    expect(inferStepIndex('step')).toBeNull();
    expect(inferStepIndex('step-abc')).toBeNull();
    expect(inferStepIndex('not-a-step')).toBeNull();
    expect(inferStepIndex('')).toBeNull();
  });
});
