/**
 * Tests for ErrorBoundary component.
 */

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { ErrorBoundary } from '../src/ErrorBoundary';

import { render } from './test-utils';

/* ------------------------------------------------------------------ */
/*  Mock SVG icon imports — jsdom cannot render data-URI "elements"    */
/* ------------------------------------------------------------------ */

vi.mock('@epam/assets/icons/common/notification-error-fill-24.svg', () => ({ default: () => null }));

/* ------------------------------------------------------------------ */
/*  Suppress React error-boundary console noise                        */
/* ------------------------------------------------------------------ */

let originalConsoleError: typeof console.error;

beforeEach(() => {
  originalConsoleError = console.error;
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  cleanup();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Component that throws during render. */
function ThrowingChild({ message }: { message?: string }): never {
  throw new Error(message ?? 'Test render error');
}

/** Harmless child component. */
function GoodChild() {
  return <span data-testid="good-child">All fine</span>;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ErrorBoundary', () => {
  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('good-child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('shows fallback UI when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('good-child')).not.toBeInTheDocument();
  });

  it('displays the error message in the fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="Something broke badly" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something broke badly')).toBeInTheDocument();
  });

  it('calls onReset when the "Try again" button is clicked', () => {
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    const tryAgainButton = screen.getByText('Try again');
    fireEvent.click(tryAgainButton);

    expect(onReset).toHaveBeenCalledOnce();
  });

  it('uses custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error view</div>}>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom error view')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('logs the error via console.error', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="Logged error" />
      </ErrorBoundary>,
    );

    const calls = (console.error as Mock).mock.calls;
    const boundaryLog = calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('[ErrorBoundary]'),
    );
    expect(boundaryLog).toBeDefined();
  });

  describe('fallbackRender', () => {
    it('receives the error and reset function and renders custom output', () => {
      const fallbackRender = vi.fn(({ error, reset }: { error: Error; reset: () => void }) => (
        <div data-testid="render-fallback">
          <span data-testid="render-fallback-message">{error.message}</span>
          <button data-testid="render-fallback-reset" onClick={reset}>Reset</button>
        </div>
      ));

      render(
        <ErrorBoundary fallbackRender={fallbackRender}>
          <ThrowingChild message="fallbackRender error" />
        </ErrorBoundary>,
      );

      // Verify fallbackRender was called with correct args.
      expect(fallbackRender).toHaveBeenCalled();
      expect(fallbackRender).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error), reset: expect.any(Function) }),
      );

      // Verify the rendered output is displayed.
      expect(screen.getByTestId('render-fallback')).toBeInTheDocument();
      expect(screen.getByTestId('render-fallback-message')).toHaveTextContent('fallbackRender error');

      // Verify the default fallback is NOT shown.
      expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
    });

    it('reset function clears the error state', () => {
      let shouldThrow = true;

      function ConditionalChild() {
        if (shouldThrow) throw new Error('conditional throw');
        return <span data-testid="recovered-child">Recovered</span>;
      }

      render(
        <ErrorBoundary
          fallbackRender={({ reset }) => (
            <button data-testid="reset-btn" onClick={reset}>Reset</button>
          )}
        >
          <ConditionalChild />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId('reset-btn')).toBeInTheDocument();

      // Stop throwing and reset.
      shouldThrow = false;
      fireEvent.click(screen.getByTestId('reset-btn'));

      expect(screen.getByTestId('recovered-child')).toBeInTheDocument();
    });

    it('takes priority over static fallback prop', () => {
      render(
        <ErrorBoundary
          fallbackRender={({ error }) => <div data-testid="render-wins">{error.message}</div>}
          fallback={<div data-testid="static-fallback">Static</div>}
        >
          <ThrowingChild message="priority test" />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId('render-wins')).toBeInTheDocument();
      expect(screen.queryByTestId('static-fallback')).not.toBeInTheDocument();
    });
  });
});
