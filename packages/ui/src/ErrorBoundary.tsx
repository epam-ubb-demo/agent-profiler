/**
 * ErrorBoundary — catches render errors in child components and displays
 * a graceful fallback UI instead of unmounting the entire React tree.
 *
 * Must be a class component because React hooks cannot catch render errors.
 */

import { Button, FlexRow, Panel, Text } from '@epam/uui';
import type { ErrorInfo, ReactNode, SVGProps } from 'react';
import { Component } from 'react';

import styles from './ErrorBoundary.module.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ErrorBoundaryProps {
  /** Optional render function invoked with error details when an error is caught. */
  readonly fallbackRender?: (props: { error: Error; reset: () => void }) => ReactNode;
  /** Optional custom fallback to render when an error is caught (static). */
  readonly fallback?: ReactNode;
  /** Called when the user triggers a reset (e.g. "Try again" or navigation). */
  readonly onReset?: () => void;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly expanded: boolean;
}

/* ------------------------------------------------------------------ */
/*  Icon helper                                                        */
/* ------------------------------------------------------------------ */

/** Inline error icon — avoids relying on @epam/assets SVG type declarations. */
function ErrorIcon({ width = 24, height = 24 }: SVGProps<SVGSVGElement>): ReactNode {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, expanded: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log the error for debugging; production logging can be added here.
     
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, expanded: false });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Use fallbackRender if provided — allows access to error details.
    if (this.props.fallbackRender) {
      return this.props.fallbackRender({ error: this.state.error!, reset: this.handleReset });
    }

    // Use static fallback if provided.
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const { error, expanded } = this.state;

    return (
      <div
        className={styles['error-boundary-fallback']}
        data-testid="error-boundary-fallback"
        role="alert"
        aria-live="assertive"
      >
        <Panel shadow cx={styles['error-boundary-panel']}>
          <div className={styles['error-boundary-content']}>
            {/* Header: icon + messaging */}
            <FlexRow spacing="12" alignItems="top" cx={styles['error-boundary-header']}>
              <div className={styles['error-boundary-icon-container']}>
                <ErrorIcon width={24} height={24} />
              </div>
              <div className={styles['error-boundary-text']}>
                <Text size="24" fontWeight="600">
                  Something went wrong
                </Text>
                <Text size="18" color="secondary">
                  {error?.message ?? 'An unexpected error occurred.'}
                </Text>
              </div>
            </FlexRow>

            {/* Expandable stack trace */}
            {error?.stack && (
              <div className={styles['error-boundary-details']}>
                <Button
                  fill="ghost"
                  size="30"
                  caption={expanded ? 'Hide stack trace' : 'Show stack trace'}
                  onClick={() => this.setState({ expanded: !expanded })}
                  rawProps={{ 'aria-expanded': expanded }}
                />
                {expanded && (
                  <div className={styles['error-boundary-stack-panel']}>
                    <pre
                      className={styles['error-boundary-stack-trace']}
                      data-testid="error-boundary-stack"
                    >
                      {error.stack}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <FlexRow spacing="12" cx={styles['error-boundary-actions']}>
              <Button
                caption="Try again"
                onClick={this.handleReset}
                size="36"
                fill="outline"
                color="primary"
              />
            </FlexRow>
          </div>
        </Panel>
      </div>
    );
  }
}
