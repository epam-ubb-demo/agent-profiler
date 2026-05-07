/**
 * @agent-profiler/adapters-ctb — public API.
 *
 * Parses a ctb benchmark run directory into a structured CtbBenchRun.
 * Never throws — returns a CtbBenchRun with empty variants on failure.
 */

import { parseCopilotCliSession } from '@agent-profiler/adapters-copilot-cli';

import { inferMetadata } from './inference';
import { scanRunDirectory } from './scanner';
import type { CtbBenchRun, CtbVariant, ParseCtbOptions, VariantStep } from './types';

export type { CtbBenchRun, CtbVariant, ParseCtbOptions, VariantStep } from './types';

/**
 * Parse a ctb benchmark run directory into a CtbBenchRun.
 * Never throws — returns a CtbBenchRun with empty variants on failure.
 *
 * @param runDir - Path to the benchmark run output directory (containing `copilot/`)
 * @param options - Optional config (bench name, run ID override)
 */
export async function parseCtbBenchRun(
  runDir: string,
  options?: ParseCtbOptions,
): Promise<CtbBenchRun> {
  const { benchName, runId } = inferMetadata(runDir);

  const emptyRun: CtbBenchRun = {
    id: options?.runId ?? runId ?? '',
    name: options?.name ?? benchName,
    startedAt: null,
    finishedAt: null,
    variants: [],
  };

  let scanResult;
  try {
    scanResult = await scanRunDirectory(runDir);
  } catch {
    return emptyRun;
  }

  if (scanResult.steps.length === 0) {
    return emptyRun;
  }

  // Group steps by variant
  const variantMap = new Map<string, VariantStep[]>();

  for (const discovered of scanResult.steps) {
    const session = await parseCopilotCliSession(discovered.sessionPath);

    const step: VariantStep = {
      index: discovered.stepIndex,
      title: `Step ${discovered.stepIndex}`,
      session,
    };

    const existing = variantMap.get(discovered.variantId);
    if (existing) {
      existing.push(step);
    } else {
      variantMap.set(discovered.variantId, [step]);
    }
  }

  // Build variants (sorted alphabetically by ID)
  const variantIds = [...variantMap.keys()].sort();
  const variants: CtbVariant[] = variantIds.map((id) => {
    const steps = variantMap.get(id)!;
    // Sort steps numerically
    steps.sort((a, b) => a.index - b.index);
    return {
      id,
      name: id,
      steps,
    };
  });

  // Derive startedAt/finishedAt from sessions
  const allSessions = variants.flatMap((v) => v.steps.map((s) => s.session));
  const startTimes = allSessions.map((s) => s.startTs).filter((t): t is string => t !== null);
  const endTimes = allSessions.map((s) => s.endTs).filter((t): t is string => t !== null);

  const startedAt = startTimes.length > 0 ? (startTimes.sort()[0] ?? null) : null;
  const finishedAt = endTimes.length > 0 ? (endTimes.sort().at(-1) ?? null) : null;

  return {
    id: options?.runId ?? runId ?? '',
    name: options?.name ?? benchName,
    startedAt,
    finishedAt,
    variants,
  };
}
