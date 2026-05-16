export interface PollGuardOptions {
  /** Poll interval in milliseconds. Default 30000 (30 s). */
  readonly intervalMs?: number | undefined;
}

/**
 * Timer-based polling safety net.
 *
 * Fires `onTick` on a fixed interval. If `onTick` returns a promise, any
 * rejection is caught and logged so the timer keeps running.
 */
export class PollGuard {
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly onTick: () => void | Promise<void>,
    private readonly options?: PollGuardOptions,
  ) {}

  /** Start the periodic timer. Idempotent. */
  start(): void {
    if (this.interval !== undefined) return;
    const intervalMs = this.options?.intervalMs ?? 30_000;
    this.interval = setInterval(() => {
      void (async () => {
        try {
          await this.onTick();
        } catch (err) {
          console.error('[PollGuard] onTick error:', err);
        }
      })();
    }, intervalMs);
  }

  /** Stop the periodic timer. Idempotent. */
  stop(): void {
    if (this.interval === undefined) return;
    clearInterval(this.interval);
    this.interval = undefined;
  }

  /** Whether the guard is currently active. */
  get active(): boolean {
    return this.interval !== undefined;
  }
}
