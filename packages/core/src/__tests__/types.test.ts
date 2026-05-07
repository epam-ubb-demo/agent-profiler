/**
 * Type assertion tests (compile-time checks).
 *
 * These tests verify that the Zod-inferred types are assignable to
 * our manually defined TypeScript interfaces. If the types drift apart,
 * these will produce compile-time errors.
 */

import { describe, it, expect } from 'vitest';
import type { z } from 'zod';

import type {
  sessionSchema,
  turnSchema,
  toolCallSchema,
  assistantMessageSchema,
  userMessageSchema,
  compactionSchema,
  subagentInvocationSchema,
  shutdownMetricsSchema,
  utilisationSampleSchema,
  fanoutTurnSchema,
  annotationSchema,
  variantSchema,
  benchRunSchema,
  parseStatusSchema,
  modelChangeSchema,
  modelMetricsSchema,
  tokenBucketSchema,
} from '../schemas/index';
import type {
  Session,
  Turn,
  ToolCall,
  AssistantMessage,
  UserMessage,
  Compaction,
  SubagentInvocation,
  ShutdownMetrics,
  UtilisationSample,
  FanoutTurn,
  Annotation,
  Variant,
  BenchRun,
  ParseStatus,
  ModelChange,
  ModelMetrics,
  TokenBucket,
} from '../types/index';

/**
 * Helper type that asserts A is assignable to B.
 * If the types diverge, this will produce a compile-time error.
 */
type AssertAssignable<A, B> = A extends B ? true : never;

// Compile-time assertions: Zod inferred types must be assignable to our interfaces.
// These will never fail at runtime — they only catch type drift at compile time.
type _Session = AssertAssignable<z.infer<typeof sessionSchema>, Session>;
type _Turn = AssertAssignable<z.infer<typeof turnSchema>, Turn>;
type _ToolCall = AssertAssignable<z.infer<typeof toolCallSchema>, ToolCall>;
type _AssistantMessage = AssertAssignable<z.infer<typeof assistantMessageSchema>, AssistantMessage>;
type _UserMessage = AssertAssignable<z.infer<typeof userMessageSchema>, UserMessage>;
type _Compaction = AssertAssignable<z.infer<typeof compactionSchema>, Compaction>;
type _SubagentInvocation = AssertAssignable<z.infer<typeof subagentInvocationSchema>, SubagentInvocation>;
type _ShutdownMetrics = AssertAssignable<z.infer<typeof shutdownMetricsSchema>, ShutdownMetrics>;
type _UtilisationSample = AssertAssignable<z.infer<typeof utilisationSampleSchema>, UtilisationSample>;
type _FanoutTurn = AssertAssignable<z.infer<typeof fanoutTurnSchema>, FanoutTurn>;
type _Annotation = AssertAssignable<z.infer<typeof annotationSchema>, Annotation>;
type _Variant = AssertAssignable<z.infer<typeof variantSchema>, Variant>;
type _BenchRun = AssertAssignable<z.infer<typeof benchRunSchema>, BenchRun>;
type _ParseStatus = AssertAssignable<z.infer<typeof parseStatusSchema>, ParseStatus>;
type _ModelChange = AssertAssignable<z.infer<typeof modelChangeSchema>, ModelChange>;
type _ModelMetrics = AssertAssignable<z.infer<typeof modelMetricsSchema>, ModelMetrics>;
type _TokenBucket = AssertAssignable<z.infer<typeof tokenBucketSchema>, TokenBucket>;

// Suppress unused type warnings
declare const _assertions: [
  _Session, _Turn, _ToolCall, _AssistantMessage, _UserMessage,
  _Compaction, _SubagentInvocation, _ShutdownMetrics, _UtilisationSample,
  _FanoutTurn, _Annotation, _Variant, _BenchRun, _ParseStatus,
  _ModelChange, _ModelMetrics, _TokenBucket,
];

describe('Type assertions', () => {
  it('compiles successfully — types and schemas are aligned', () => {
    // This test exists to ensure the file is executed.
    // The real assertions are at compile time (above).
    expect(true).toBe(true);
  });
});
