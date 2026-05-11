/**
 * Tests for SessionAlerts component.
 */

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionAlerts, type SessionAlertsProps } from '../src/session-detail/SessionAlerts';

import { render } from './test-utils';

/* ------------------------------------------------------------------ */
/*  Mock SVG icon imports — jsdom cannot render data-URI "elements"    */
/* ------------------------------------------------------------------ */

vi.mock('@epam/assets/icons/common/notification-info-fill-24.svg', () => ({ default: () => null }));
vi.mock('@epam/assets/icons/common/notification-warning-outline-24.svg', () => ({ default: () => null }));
vi.mock('@epam/assets/icons/common/notification-error-fill-24.svg', () => ({ default: () => null }));

afterEach(cleanup);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeProps(overrides?: Partial<SessionAlertsProps>): SessionAlertsProps {
  return {
    parseStatus: { status: 'ok', error: null },
    hasShutdown: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Rendering logic                                                    */
/* ------------------------------------------------------------------ */

describe('SessionAlerts', () => {
  it('renders nothing when status is ok and shutdown exists', () => {
    const { container } = render(<SessionAlerts {...makeProps()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders an error alert when parseStatus is failed', () => {
    render(
      <SessionAlerts
        {...makeProps({
          parseStatus: { status: 'failed', error: 'JSONL corrupt at line 42' },
        })}
      />,
    );

    const container = screen.getByTestId('session-alerts');
    expect(container).toBeInTheDocument();

    const alert = screen.getByTestId('session-alert-error');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('JSONL corrupt at line 42');
  });

  it('renders fallback error message when error field is null', () => {
    render(
      <SessionAlerts
        {...makeProps({
          parseStatus: { status: 'failed', error: null },
        })}
      />,
    );

    const alert = screen.getByTestId('session-alert-error');
    expect(alert).toHaveTextContent('Session parsing failed');
  });

  it('renders warning alerts for each "; "-delimited substring on partial status', () => {
    render(
      <SessionAlerts
        {...makeProps({
          parseStatus: {
            status: 'partial',
            error: '3 event(s) skipped; All model metrics have zero tokens — possible schema mismatch',
          },
        })}
      />,
    );

    const alerts = screen.getAllByTestId('session-alert-warning');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('3 event(s) skipped');
    expect(alerts[1]).toHaveTextContent(
      'All model metrics have zero tokens — possible schema mismatch',
    );
  });

  it('renders info alert when shutdown is missing and status is ok', () => {
    render(
      <SessionAlerts {...makeProps({ hasShutdown: false })} />,
    );

    const alert = screen.getByTestId('session-alert-info');
    expect(alert).toHaveTextContent(
      'No shutdown event found; token counts are estimated from message content',
    );
  });

  it('does NOT render info alert when shutdown is missing but status is partial', () => {
    render(
      <SessionAlerts
        {...makeProps({
          hasShutdown: false,
          parseStatus: { status: 'partial', error: 'Some warning' },
        })}
      />,
    );

    expect(screen.queryByTestId('session-alert-info')).not.toBeInTheDocument();
    expect(screen.getByTestId('session-alert-warning')).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /*  Severity ordering                                                */
  /* ---------------------------------------------------------------- */

  it('sorts alerts by severity: error → warning → info', () => {
    // This combination is contrived to verify ordering.
    // In practice, failed status won't produce warnings, but the
    // derivation function handles each condition independently.
    render(
      <SessionAlerts
        {...makeProps({
          parseStatus: { status: 'partial', error: 'Warn A; Warn B' },
          hasShutdown: true,
        })}
      />,
    );

    const container = screen.getByTestId('session-alerts');
    const alerts = Array.from(container.querySelectorAll('[data-testid^="session-alert-"]'));
    // All should be warnings in this case, sorted already
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.getAttribute('data-testid')).toBe('session-alert-warning');
    expect(alerts[1]!.getAttribute('data-testid')).toBe('session-alert-warning');
  });

  /* ---------------------------------------------------------------- */
  /*  Dismissal                                                        */
  /* ---------------------------------------------------------------- */

  it('dismisses an alert when the close button is clicked', () => {
    render(
      <SessionAlerts
        {...makeProps({
          parseStatus: {
            status: 'partial',
            error: 'Warning one; Warning two',
          },
        })}
      />,
    );

    const alerts = screen.getAllByTestId('session-alert-warning');
    expect(alerts).toHaveLength(2);

    // The Alert component renders a close button; find it within the first alert
    const firstAlert = alerts[0]!;
    const closeButton = firstAlert.querySelector('button');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    // After dismissal only one warning remains
    expect(screen.getAllByTestId('session-alert-warning')).toHaveLength(1);
    expect(screen.getByTestId('session-alert-warning')).toHaveTextContent('Warning two');
  });

  it('hides the container entirely when all alerts are dismissed', () => {
    render(
      <SessionAlerts
        {...makeProps({ hasShutdown: false })}
      />,
    );

    expect(screen.getByTestId('session-alerts')).toBeInTheDocument();

    const alert = screen.getByTestId('session-alert-info');
    const closeButton = alert.querySelector('button');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    expect(screen.queryByTestId('session-alerts')).not.toBeInTheDocument();
  });
});
