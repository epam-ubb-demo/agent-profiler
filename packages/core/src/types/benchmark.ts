/**
 * Benchmark domain types for F2.x features.
 *
 * A BenchRun collects multiple sessions from a benchmark execution.
 * A Variant labels a session within a multi-session comparison.
 */

/**
 * A label identifying a session variant in a comparison.
 */
export interface Variant {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sessionId: string;
}

/**
 * A collection of sessions from a single benchmark run.
 */
export interface BenchRun {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
  readonly variants: readonly Variant[];
  readonly metadata: Record<string, unknown>;
}
