/**
 * Tests for the directory scanner module.
 */

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanRunDirectory } from '../src/scanner';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const SAMPLE_RUN = join(FIXTURES, 'sample-run');

describe('scanRunDirectory', () => {
  it('discovers all steps from a valid run directory', async () => {
    const result = await scanRunDirectory(SAMPLE_RUN);

    expect(result.steps).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
  });

  it('discovers correct variants sorted alphabetically', async () => {
    const result = await scanRunDirectory(SAMPLE_RUN);
    const variantIds = [...new Set(result.steps.map((s) => s.variantId))];

    expect(variantIds).toEqual(['model-a', 'model-b']);
  });

  it('discovers correct step indices per variant', async () => {
    const result = await scanRunDirectory(SAMPLE_RUN);

    const modelASteps = result.steps
      .filter((s) => s.variantId === 'model-a')
      .map((s) => s.stepIndex);
    const modelBSteps = result.steps
      .filter((s) => s.variantId === 'model-b')
      .map((s) => s.stepIndex);

    expect(modelASteps).toEqual([0, 1]);
    expect(modelBSteps).toEqual([0]);
  });

  it('returns session paths pointing to uuid directories', async () => {
    const result = await scanRunDirectory(SAMPLE_RUN);

    for (const step of result.steps) {
      expect(step.sessionPath).toContain('session-state');
      expect(step.sessionPath).toMatch(/uuid-\d+$/);
    }
  });

  it('handles missing copilot/ directory gracefully', async () => {
    const result = await scanRunDirectory('/nonexistent/path');

    expect(result.steps).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('No copilot/ directory');
  });

  it('handles empty variant directory gracefully', async () => {
    // Use a fixture path that exists but has no step directories
    const result = await scanRunDirectory(join(FIXTURES, 'sample-run', 'copilot', 'model-a'));

    expect(result.steps).toHaveLength(0);
    expect(result.warnings[0]).toContain('No copilot/ directory');
  });
});
