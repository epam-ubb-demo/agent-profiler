/**
 * ErrorPanel — reusable error fallback component.
 *
 * Renders a centred card with an error icon, title, description,
 * optional expandable stack trace, and configurable action buttons.
 * Used as a fallback for ErrorBoundary or as standalone error state.
 */

import { Button, FlexRow, Panel, Text } from '@epam/uui';
import type { ReactNode } from 'react';
import { useState } from 'react';

import styles from './ErrorPanel.module.css';

export interface ErrorPanelAction {
  readonly caption: string;
  readonly onClick: () => void;
  readonly icon?: ReactNode;
  readonly fill?: 'solid' | 'outline' | 'ghost';
  readonly color?: 'primary' | 'secondary' | 'accent';
}

export interface ErrorPanelProps {
  /** Main heading — defaults to "Something went wrong". */
  readonly title?: string;
  /** Descriptive text shown below the heading. */
  readonly description?: string;
  /** The error object — used for message and stack trace. */
  readonly error?: Error | null;
  /** Action buttons rendered below the description. */
  readonly actions?: readonly ErrorPanelAction[];
  /** Additional metadata rows shown above the stack trace. */
  readonly details?: readonly { label: string; value: string }[];
  /** data-testid applied to the outermost container. */
  readonly testId?: string;
}

export function ErrorPanel({
  title = 'Something went wrong',
  description,
  error,
  actions,
  details,
  testId = 'error-panel',
}: ErrorPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  const hasExpandable = !!error?.stack || (details && details.length > 0);

  return (
    <FlexRow
      justifyContent="center"
      padding="24"
      rawProps={{ 'data-testid': testId, 'role': 'alert', 'aria-live': 'assertive' }}
    >
      <Panel shadow cx={styles.errorPanel}>
        <div className={styles.errorContent}>
          {/* Error icon */}
          <div className={styles.errorIconContainer}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>

          {/* Heading */}
          <Text size="30" fontWeight="600" cx={styles.errorTitle}>
            {title}
          </Text>

          {/* Description */}
          {(description ?? error?.message) && (
            <Text size="18" color="secondary" cx={styles.errorDesc}>
              {description ?? error?.message}
            </Text>
          )}

          {/* Actions */}
          {actions && actions.length > 0 && (
            <FlexRow spacing="12" justifyContent="center" cx={styles.errorActions}>
              {actions.map((a) => (
                <Button
                  key={a.caption}
                  fill={a.fill ?? 'outline'}
                  size="36"
                  color={a.color ?? 'primary'}
                  caption={a.caption}
                  onClick={a.onClick}
                  icon={a.icon as React.FC<React.SVGProps<SVGSVGElement>> | undefined}
                />
              ))}
            </FlexRow>
          )}

          {/* Show/hide details toggle */}
          {hasExpandable && (
            <Button
              fill="ghost"
              size="30"
              caption={showDetails ? 'Hide details' : 'Show details'}
              onClick={() => setShowDetails(!showDetails)}
              rawProps={{ 'aria-expanded': showDetails }}
            />
          )}

          {/* Expandable detail section */}
          {showDetails && hasExpandable && (
            <div className={styles.errorDetails} role="region" aria-label="Error details">
              {details?.map((d) => (
                <div key={d.label}>
                  <Text size="18" color="secondary">{d.label}</Text>{' '}
                  <code style={{ fontFamily: 'var(--uui-font-mono, monospace)', fontSize: '13px' }}>
                    {d.value}
                  </code>
                </div>
              ))}
              {error?.message && (
                <Text size="18" fontWeight="600">
                  {error.message}
                </Text>
              )}
              {error?.stack && (
                <pre className={styles.errorStack}>
                  {error.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      </Panel>
    </FlexRow>
  );
}
