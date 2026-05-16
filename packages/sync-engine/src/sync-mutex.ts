/**
 * Per-key mutex backed by a promise chain.
 *
 * Calls to `acquire()` for the same key are serialised FIFO.
 * Different keys are independent and do not block each other.
 */
export class KeyedMutex {
  private readonly locks = new Map<string, Promise<void>>();

  /**
   * Acquire the lock for `key`.
   *
   * If the key is already locked the caller awaits the existing lock; once
   * released, the caller holds the lock and the returned release function
   * must be called to unblock the next waiter.
   */
  async acquire(key: string): Promise<() => void> {
    // Chain behind the current lock (or a pre-resolved promise if none).
    const prevLock = this.locks.get(key) ?? Promise.resolve();

    let release!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Register our lock so subsequent acquires chain behind us.
    this.locks.set(key, lockPromise);

    // Wait for the predecessor to release.
    await prevLock;

    return () => {
      // Only clean up the map entry if we are still the current holder
      // (another acquire may have already installed a new promise).
      if (this.locks.get(key) === lockPromise) {
        this.locks.delete(key);
      }
      release();
    };
  }
}
