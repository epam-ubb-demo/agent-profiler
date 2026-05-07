/**
 * Types for the ctb benchmark adapter.
 *
 * These extend the core BenchRun/Variant model to support
 * multi-step variants specific to ctb benchmark directory layouts.
 */

import type { Session } from '@agent-profiler/core';

/**
 * A single step within a variant, containing a parsed session.
 */
export interface VariantStep {
  readonly index: number;
  readonly title: string | null;
  readonly session: Session;
}

/**
 * A variant in a ctb benchmark run (model configuration with multiple steps).
 */
export interface CtbVariant {
  readonly id: string;
  readonly name: string | null;
  readonly steps: readonly VariantStep[];
}

/**
 * A ctb benchmark run containing multiple variants with their steps.
 */
export interface CtbBenchRun {
  readonly id: string;
  readonly name: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly variants: readonly CtbVariant[];
}

/**
 * Options for parsing a ctb benchmark run.
 */
export interface ParseCtbOptions {
  /** Override the bench run name (defaults to inferred from path). */
  readonly name?: string;
  /** Override the run ID (defaults to inferred from path). */
  readonly runId?: string;
}
