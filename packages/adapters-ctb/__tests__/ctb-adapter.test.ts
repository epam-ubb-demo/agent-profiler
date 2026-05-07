/**
 * Integration tests for the ctb adapter.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCtbBenchRun } from '../src/index';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const SAMPLE_RUN = join(FIXTURES, 'sample-run');

describe('parseCtbBenchRun', () => {
  it('parses a valid bench run directory', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    expect(run.variants).toHaveLength(2);
    expect(run.id).not.toBe('');
  });

  it('discovers correct number of variants', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    expect(run.variants).toHaveLength(2);
    expect(run.variants.map((v) => v.id)).toEqual(['model-a', 'model-b']);
  });

  it('discovers correct number of steps per variant', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    const modelA = run.variants.find((v) => v.id === 'model-a');
    const modelB = run.variants.find((v) => v.id === 'model-b');

    expect(modelA?.steps).toHaveLength(2);
    expect(modelB?.steps).toHaveLength(1);
  });

  it('infers variant ID from directory name', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    expect(run.variants[0]?.id).toBe('model-a');
    expect(run.variants[1]?.id).toBe('model-b');
  });

  it('infers step index from step-N pattern', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    const modelA = run.variants.find((v) => v.id === 'model-a')!;
    expect(modelA.steps[0]?.index).toBe(0);
    expect(modelA.steps[1]?.index).toBe(1);
  });

  it('parses sessions within steps', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    const modelA = run.variants.find((v) => v.id === 'model-a')!;
    expect(modelA.steps[0]?.session.sessionId).toBe('sess-uuid-1');
    expect(modelA.steps[0]?.session.parseStatus.status).toBe('ok');
  });

  it('handles missing copilot/ directory gracefully', async () => {
    const run = await parseCtbBenchRun('/nonexistent/path');

    expect(run.variants).toHaveLength(0);
    // 'path' is inferred from basename('/nonexistent/path')
    expect(run.id).toBe('path');
    expect(run.name).toBeNull();
  });

  it('handles empty variant directory gracefully', async () => {
    const run = await parseCtbBenchRun(
      join(FIXTURES, 'sample-run', 'copilot', 'model-a'),
    );

    expect(run.variants).toHaveLength(0);
  });

  it('infers bench name and run ID from path', async () => {
    // Simulate a realistic path structure
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    // sample-run doesn't match timestamp pattern, so it becomes runId
    expect(run.id).toBe('sample-run');
  });

  it('respects name and runId options', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN, {
      name: 'My Benchmark',
      runId: 'custom-id',
    });

    expect(run.name).toBe('My Benchmark');
    expect(run.id).toBe('custom-id');
  });

  it('derives startedAt and finishedAt from sessions', async () => {
    const run = await parseCtbBenchRun(SAMPLE_RUN);

    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
  });
});
