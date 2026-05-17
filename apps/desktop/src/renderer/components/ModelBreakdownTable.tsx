import { Text } from '@epam/uui';
import { memo, useMemo } from 'react';

import type { SessionListMetricsIpc } from '../../preload/api';

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTokensPerCost(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M/$`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K/$`;
  return `${value}/$`;
}

function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/* ─── Colours — matches CombinedAnalyticsChart palette ───────────────────────── */

const MODEL_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f59e0b', '#6366f1', '#d946ef',
];

function modelColour(model: string): string {
  let hash = 0;
  for (let i = 0; i < model.length; i++) hash = ((hash << 5) - hash + model.charCodeAt(i)) | 0;
  return MODEL_PALETTE[Math.abs(hash) % MODEL_PALETTE.length]!;
}

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface ModelRow {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number | null;
  readonly avgTokensPerCost: number | null;
  readonly sessionCount: number;
}

export interface ModelBreakdownTableProps {
  /** All filtered sessions (each with optional metrics.modelUsage). */
  readonly sessions: ReadonlyArray<{
    readonly metrics: SessionListMetricsIpc | null;
  }>;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export const ModelBreakdownTable = memo(function ModelBreakdownTable({
  sessions,
}: ModelBreakdownTableProps) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      costUsd: number | null;
      sessionCount: number;
    }>();

    for (const s of sessions) {
      if (!s.metrics) continue;
      const modelsInSession = new Set<string>();
      for (const mu of s.metrics.modelUsage ?? []) {
        const prev = map.get(mu.model) ?? {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUsd: null,
          sessionCount: 0,
        };
        prev.inputTokens += mu.inputTokens;
        prev.outputTokens += mu.outputTokens;
        prev.cacheReadTokens += mu.cacheReadTokens;
        prev.cacheWriteTokens += mu.cacheWriteTokens;
        modelsInSession.add(mu.model);
        map.set(mu.model, prev);
      }
      // Count session once per model it uses
      for (const model of modelsInSession) {
        map.get(model)!.sessionCount++;
      }
      // Distribute cost proportionally if available
      if (s.metrics.totalCostUsd != null) {
        const totalTokens = s.metrics.totalInputTokens + s.metrics.totalOutputTokens;
        for (const mu of s.metrics.modelUsage ?? []) {
          const entry = map.get(mu.model)!;
          const modelTokens = mu.inputTokens + mu.outputTokens;
          const proportion = totalTokens > 0 ? modelTokens / totalTokens : 0;
          entry.costUsd = (entry.costUsd ?? 0) + s.metrics.totalCostUsd * proportion;
        }
      }
    }

    const result: ModelRow[] = Array.from(map.entries())
      .map(([model, d]) => {
        const totalTokens = d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheWriteTokens;
        const avgTokensPerCost =
          d.costUsd != null && d.costUsd > 0
            ? Math.round(totalTokens / d.costUsd)
            : null;
        return {
          model,
          inputTokens: d.inputTokens,
          outputTokens: d.outputTokens,
          totalTokens,
          cacheReadTokens: d.cacheReadTokens,
          cacheWriteTokens: d.cacheWriteTokens,
          costUsd: d.costUsd,
          avgTokensPerCost,
          sessionCount: d.sessionCount,
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return result;
  }, [sessions]);

  if (rows.length === 0) return null;

  const grandTotal = rows.reduce((s, r) => s + r.totalTokens, 0);

  return (
    <div>
      <Text
        cx="block"
        fontSize="14"
        fontWeight="600"
        rawProps={{ style: { marginBottom: 8 } }}
      >
        Model cost breakdown
      </Text>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '1px solid var(--uui-divider)',
              textAlign: 'left',
            }}
          >
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>Model</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Sessions</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Tokens</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Share</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Est. cost</th>
            <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Avg tk/$</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const share = grandTotal > 0
              ? ((row.totalTokens / grandTotal) * 100).toFixed(1)
              : '0.0';
            return (
              <tr
                key={row.model}
                style={{ borderBottom: '1px solid var(--uui-divider-light, #f3f4f6)' }}
              >
                <td style={{ padding: '6px 8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: modelColour(row.model),
                        flexShrink: 0,
                      }}
                    />
                    {row.model}
                  </span>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.sessionCount}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTokens(row.totalTokens)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {share}%
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.costUsd != null ? formatUsd(row.costUsd) : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {row.avgTokensPerCost != null ? formatTokensPerCost(row.avgTokensPerCost) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
