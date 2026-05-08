/**
 * SessionAlerts — renders dismissible UUI Alert banners for session
 * parse warnings, errors, and informational notices.
 *
 * Warning derivation logic:
 * - `parseStatus.status === 'failed'`  → single error alert with the message
 * - `parseStatus.status === 'partial'` → each '; '-delimited substring is a warning
 * - `shutdown === null` with status 'ok' → info alert about estimated tokens
 * - Otherwise → render nothing
 */

import type { Session } from '@agent-profiler/core';

import { Alert } from '@epam/uui';
import { memo, useCallback, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SessionAlertsProps {
  readonly parseStatus: Session['parseStatus'];
  readonly hasShutdown: boolean;
}

interface AlertItem {
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
}

/* ------------------------------------------------------------------ */
/*  Severity ordering                                                  */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER: Record<AlertItem['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const COLOUR_MAP: Record<AlertItem['severity'], 'error' | 'warning' | 'info'> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/* ------------------------------------------------------------------ */
/*  Alert derivation                                                   */
/* ------------------------------------------------------------------ */

function deriveAlerts(parseStatus: Session['parseStatus'], hasShutdown: boolean): readonly AlertItem[] {
  const items: AlertItem[] = [];

  if (parseStatus.status === 'failed') {
    items.push({
      severity: 'error',
      message: parseStatus.error ?? 'Session parsing failed',
    });
  } else if (parseStatus.status === 'partial') {
    const parts = parseStatus.error?.split('; ') ?? [];
    for (const part of parts) {
      if (part) {
        items.push({ severity: 'warning', message: part });
      }
    }
  }

  if (!hasShutdown && parseStatus.status === 'ok') {
    items.push({
      severity: 'info',
      message: 'No shutdown event found; token counts are estimated from message content',
    });
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return items;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function SessionAlertsInner({ parseStatus, hasShutdown }: SessionAlertsProps) {
  const alerts = deriveAlerts(parseStatus, hasShutdown);
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());

  const handleDismiss = useCallback((index: number) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const visible = alerts.filter((_, i) => !dismissed.has(i));

  if (visible.length === 0) return null;

  return (
    <div
      data-testid="session-alerts"
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {alerts.map((alert, index) => {
        if (dismissed.has(index)) return null;
        return (
          <Alert
            key={index}
            color={COLOUR_MAP[alert.severity]}
            onClose={() => handleDismiss(index)}
            rawProps={{
              'data-testid': `session-alert-${alert.severity}`,
              'aria-live': 'polite',
            }}
          >
            {alert.message}
          </Alert>
        );
      })}
    </div>
  );
}

export const SessionAlerts = memo(SessionAlertsInner);
SessionAlerts.displayName = 'SessionAlerts';
