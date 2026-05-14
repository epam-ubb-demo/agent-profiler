/**
 * Formatting utilities for comparative table display.
 */

/**
 * Format a token count with K/M suffix.
 * e.g. 1234 → "1.2K", 1_500_000 → "1.5M"
 */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const val = n / 1_000;
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}K`;
  }
  return String(n);
}

/**
 * Format a cost value. Returns "—" for null values.
 * e.g. 1.234 → "$1.23"
 */
export function formatCost(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

/**
 * Format a token-billing cost with enough precision for small amounts.
 * e.g. 0.000023 → "<$0.0001", 0.0023 → "$0.0023", 1.23 → "$1.23"
 */
export function formatTokenCost(usd: number): string {
  if (usd <= 0) return '$0.00';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Format a duration in ms to human-readable string.
 * e.g. 150 → "150ms", 2500 → "2.5s", 150000 → "2m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    const s = ms / 1000;
    return `${s % 1 === 0 ? s.toFixed(0) : s.toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Format wall time in ms to mm:ss format.
 * e.g. 330000 → "05:30"
 */
export function formatWallTime(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
