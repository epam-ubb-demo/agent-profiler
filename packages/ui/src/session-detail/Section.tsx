/**
 * Section — reusable sub-heading wrapper used by tab panel components
 * and the main session detail view.
 */

import { Text } from '@epam/uui';
import { memo } from 'react';

import styles from './session-detail.module.css';

/** Props for the {@link Section} component. */
export interface SectionProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function SectionInner({ title, children }: SectionProps) {
  return (
    <section>
      <Text cx={styles['sectionHeading']} size="24" fontWeight="600">
        {title}
      </Text>
      {children}
    </section>
  );
}

/** Consistent sub-heading wrapper for session detail sections. */
export const Section = memo(SectionInner);
Section.displayName = 'Section';
