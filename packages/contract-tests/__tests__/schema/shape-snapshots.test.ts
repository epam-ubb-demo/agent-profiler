/**
 * T12.1.5 — Schema shape snapshot tests.
 *
 * Pins the key-set of {@link EnrichmentEvent} and {@link DcrRow} so that
 * accidental field additions or removals produce a visible diff rather than a
 * silent regression. Timestamps that vary per-run are replaced with a fixed
 * sentinel before snapshotting.
 */

import { mapEventToDcrRow } from '@agent-profiler/sink-dcr';
import { expectedCopilotCliEvents } from '@agent-profiler/test-fixtures';
import { describe, expect, it } from 'vitest';

const PUSH_TS = '2025-01-01T00:00:00.000Z';

describe('EnrichmentEvent shape snapshots', () => {
  // Use the first golden copilot-cli event (metadata) as the representative shape.
  const metadataEvent = expectedCopilotCliEvents[0]!;

  it('EnrichmentEvent field names are stable (sorted)', () => {
    expect(Object.keys(metadataEvent).sort()).toMatchSnapshot();
  });

  it('full metadata EnrichmentEvent snapshot', () => {
    expect(metadataEvent).toMatchSnapshot();
  });
});

describe('DcrRow shape snapshots', () => {
  const metadataEvent = expectedCopilotCliEvents[0]!;

  /** Produce a deterministic row by replacing variable timestamps. */
  function stableRow() {
    const row = mapEventToDcrRow(metadataEvent, PUSH_TS);
    return {
      ...row,
      TimeGenerated: PUSH_TS,
      PushedAt: PUSH_TS,
    };
  }

  it('DcrRow field names are stable (sorted)', () => {
    expect(Object.keys(stableRow()).sort()).toMatchSnapshot();
  });

  it('full metadata DcrRow snapshot (timestamps fixed)', () => {
    expect(stableRow()).toMatchSnapshot();
  });
});
