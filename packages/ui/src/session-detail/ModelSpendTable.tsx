/**
 * Per-model spend table — displays token usage and estimated cost
 * for each model, with colour-coded dots and aggregated totals.
 */

import { Text } from '@epam/uui';
import { memo } from 'react';

import { formatCost, formatTokenCount } from '../comparative/format';

import type { ModelSpendResult } from './model-spend';
import styles from './session-detail.module.css';

export interface ModelSpendTableProps {
  readonly result: ModelSpendResult;
  readonly modelColours: Record<string, string>;
}

function ModelSpendTableInner({ result, modelColours }: ModelSpendTableProps) {
  const { rows, totals, confidence } = result;

  return (
    <>
      <p className={styles.sectionDescription}>
        Per-model token usage and estimated cost. Rates are per million tokens
        using disjoint billing.
      </p>
      <p className={styles.sectionDescription}>
        Confidence: {confidence}
      </p>

      <table className={styles.dataTable} role="grid">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col" className={styles.numericCell}>Requests</th>
            <th scope="col" className={styles.numericCell}>Premium cost</th>
            <th scope="col" className={styles.numericCell}>Input tok</th>
            <th scope="col" className={styles.numericCell}>Output tok</th>
            <th scope="col" className={styles.numericCell}>Cache read</th>
            <th scope="col" className={styles.numericCell}>Cache write</th>
            <th scope="col" className={styles.numericCell}>Est. USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
                <Text size="18">{formatCost(row.premiumCostUsd)}</Text>
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
              <Text size="18" fontWeight="600">
                {formatCost(totals.premiumCostUsd)}
              </Text>
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
                {formatCost(totals.estimatedUsd)}
              </Text>
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

export const ModelSpendTable = memo(ModelSpendTableInner);
ModelSpendTable.displayName = 'ModelSpendTable';
