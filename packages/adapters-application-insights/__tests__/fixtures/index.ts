/**
 * Barrel re-export for all OTel span fixture data.
 *
 * TypeScript modules are used instead of JSON files for richer type
 * safety, IDE support, and the ability to compute derived values.
 * This deviation from the original acceptance criteria (#274) was
 * deliberate — see the fixture files for per-scenario documentation.
 */

export { validSessionRows } from './valid-session';
export { minimalSessionRows } from './minimal-session';
export { partialOrphanRows } from './partial-orphans';
export { multiSessionRows } from './multi-session';
export {
  rowMissingId,
  rowNonStringOperationId,
  rowInvalidTimestamp,
  rowMalformedDimensions,
  rowEmptyStrings,
  rowKustoDuration,
  allMalformedRows,
} from './malformed-spans';
