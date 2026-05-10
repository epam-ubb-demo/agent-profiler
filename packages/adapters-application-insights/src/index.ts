export { QueryClient } from './query-client';
export type { OTelSpan } from './schemas';
export { parseKustoDuration, parseSpanRow, parseSpanRows, safeInt } from './schemas';
export { assembleSession } from './session-assembler';
export type { SpanGroup } from './span-grouper';
export { deduplicateSpans, groupSpansBySession } from './span-grouper';
export type { AppInsightsConfig, QueryResult, TimeRange } from './types';
export {
  AppInsightsError,
  AuthenticationError,
  QueryTimeoutError,
  WorkspaceNotFoundError,
} from './types';
