import { z } from 'zod';

/**
 * Schema for a single row sent to the Azure Data Collection Endpoint (DCE).
 * Each row represents one enrichment event / metric sample.
 */
export const enrichmentRowSchema = z.object({
  TimeGenerated: z.string(),
  EventId: z.string(),
  SessionId: z.string(),
  Category: z.enum(['utilisation', 'compaction', 'tool_result', 'metadata', 'turn', 'assistant_message']),
  Payload: z.record(z.unknown()),
  SchemaVersion: z.number().int(),
  SourceUser: z.string(),
  SourceMachine: z.string(),
  PushedAt: z.string(),
});

export type EnrichmentRow = z.infer<typeof enrichmentRowSchema>;
