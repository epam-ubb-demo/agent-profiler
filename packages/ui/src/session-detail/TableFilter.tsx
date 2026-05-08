/**
 * Filter input component for data tables.
 *
 * Renders a compact UUI TextInput with search placeholder and clear button.
 */

import { TextInput } from '@epam/uui';
import { memo } from 'react';

import styles from './session-detail.module.css';

export interface TableFilterProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
}

function TableFilterInner({ value, onChange, placeholder, className }: TableFilterProps) {
  const wrapperClassName = [styles.tableFilter, className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName}>
      <TextInput
        value={value}
        onValueChange={onChange}
        placeholder={placeholder ?? 'Filter…'}
        size="24"
        onCancel={value ? () => onChange('') : undefined}
        rawProps={{ 'aria-label': 'Filter table' }}
      />
    </div>
  );
}

export const TableFilter = memo(TableFilterInner);
