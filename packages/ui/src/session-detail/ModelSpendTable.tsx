/**
 * Per-model spend table — displays token usage and estimated cost
 * for each model, with colour-coded dots and aggregated totals.
 */

import { Text } from '@epam/uui';
import { memo } from 'react';

import { formatCost, formatTokenCount } from '../comparative/format';

import type { ModelSpendResult } from './model-spend';
import styles from './session-detail.module.css';
import { SortableHeader } from './SortableHeader';
import { TableFilter } from './TableFilter';
import { useFilterableData } from './useFilterableData';
import { useSortableData } from './useSortableData';

export interface ModelSpendTableProps {
  readonly result: ModelSpendResult;
  readonly modelColours: Record<string, string>;
  readonly isLive?: boolean;
}

const FILTER_KEYS = ['model'] as const;

const DEFAULT_SORT = { key: 'estimatedUsd' as const, direction: 'desc' as const };

export const ModelSpendTable = memo(function ModelSpendTable({ result, modelColours, isLive }: ModelSpendTableProps) {
  const { rows, totals, confidence } = result;

  const { filteredData, filterText, setFilterText } = useFilterableData(rows, FILTER_KEYS as unknown as string[]);
  const { sortedData, requestSort, getSortDirection } = useSortableData(filteredData, DEFAULT_SORT);

  return (
    <>
      <p className={styles.sectionDescription}>
        Per-model token usage and estimated cost. Token rates use overlapping-input
        billing. Premium Request cost is $0.04 per premium request.
      </p>
      <p className={styles.sectionDescription}>
        Confidence: {confidence}
      </p>

      <TableFilter value={filterText} onChange={setFilterText} placeholder="Filter models\u2026" />

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <SortableHeader label="Model" sortKey="model" direction={getSortDirection('model')} onSort={requestSort} />
            <SortableHeader label="API Requests" sortKey="requestCount" direction={getSortDirection('requestCount')} onSort={requestSort} numeric />
            <SortableHeader label="Premium Requests" sortKey="premiumRequests" direction={getSortDirection('premiumRequests')} onSort={requestSort} numeric />
            <SortableHeader label="Input tok" sortKey="inputTokens" direction={getSortDirection('inputTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Output tok" sortKey="outputTokens" direction={getSortDirection('outputTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Cache read" sortKey="cacheReadTokens" direction={getSortDirection('cacheReadTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Cache write" sortKey="cacheWriteTokens" direction={getSortDirection('cacheWriteTokens')} onSort={requestSort} numeric />
            <SortableHeader label="Premium Request cost" sortKey="premiumRequestCostUsd" direction={getSortDirection('premiumRequestCostUsd')} onSort={requestSort} numeric />
            <SortableHeader label="Token USD" sortKey="estimatedUsd" direction={getSortDirection('estimatedUsd')} onSort={requestSort} numeric />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row) => (
            <tr key={row.model}>
              <td>
                <span
                  className={styles.modelDot}
                  style={{
                    background:
                      modelColours[row.model] ?? 'var(--uui-neutral-50)',
                  }}
                />
                <span className={styles.modelName}>{row.model}</span>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{row.requestCount}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{row.premiumRequests === null ? '—' : row.premiumRequests}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{formatTokenCount(row.inputTokens)}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{formatTokenCount(row.outputTokens)}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{formatTokenCount(row.cacheReadTokens)}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{formatTokenCount(row.cacheWriteTokens)}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{formatCost(row.premiumRequestCostUsd)}</Text>
              </td>
              <td className={styles.numericCell}>
                <Text size="18">{formatCost(row.estimatedUsd)}</Text>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalsRow}>
            <td>
              <Text size="18" fontWeight="600">Total</Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">{totals.requestCount}</Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">{totals.premiumRequests}</Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">
                {formatTokenCount(totals.inputTokens)}
              </Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">
                {formatTokenCount(totals.outputTokens)}
              </Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">
                {formatTokenCount(totals.cacheReadTokens)}
              </Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">
                {formatTokenCount(totals.cacheWriteTokens)}
              </Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">
                {formatCost(totals.premiumRequestCostUsd)}
              </Text>
            </td>
            <td className={styles.numericCell}>
              <Text size="18" fontWeight="600">
                {formatCost(totals.estimatedUsd)}
              </Text>
            </td>
          </tr>
        </tfoot>
        {isLive && (
          <tfoot>
            <tr className={styles.liveNoticeRow} data-testid="model-spend-live-notice">
              <td colSpan={9}>
                <Text size="18">ℹ Totals are partial — session is still generating events.</Text>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </>
  );
});
ModelSpendTable.displayName = 'ModelSpendTable';
