/**
 * ErrorBoundary — catches render errors in child components and displays
 * a graceful fallback UI instead of unmounting the entire React tree.
 *
 * Must be a class component because React hooks cannot catch render errors.
 */

import type { ErrorInfo, ReactNode } from 'react';

import { Alert, Button } from '@epam/uui';
import errorIcon from '@epam/assets/icons/common/notification-error-fill-24.svg';
import { Component } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ErrorBoundaryProps {
  /** Optional custom fallback to render when an error is caught. */
  readonly fallback?: ReactNode;
  /** Called when the user triggers a reset (e.g. "Try again" or navigation). */
  readonly onReset?: () => void;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log the error for debugging; production logging can be added here.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Use custom fallback if provided.
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const { error } = this.state;

    return (
      <div data-testid="error-boundary-fallback" style={{ padding: 24 }}>
        <Alert
          color="error"
          icon={errorIcon}
          rawProps={{ 'aria-live': 'assertive' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>Something went wrong</strong>
            <span>{error?.message ?? 'An unexpected error occurred.'}</span>

            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer' }}>Stack trace</summary>
              <pre
                data-testid="error-boundary-stack"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                  marginTop: 8,
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {error?.stack ?? 'No stack trace available.'}
              </pre>
            </details>

            <div>
              <Button
                caption="Try again"
                onClick={this.handleReset}
                size="30"
                fill="outline"
              />
            </div>
          </div>
        </Alert>
      </div>
    );
  }
}
