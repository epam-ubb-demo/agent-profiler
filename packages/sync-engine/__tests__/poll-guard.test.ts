import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PollGuard } from '../src/poll-guard.js';

describe('PollGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onTick at each interval', async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const guard = new PollGuard(onTick, { intervalMs: 1000 });
    guard.start();

    await vi.advanceTimersByTimeAsync(3000);

    expect(onTick).toHaveBeenCalledTimes(3);
    guard.stop();
  });

  it('does not tick before the interval elapses', async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const guard = new PollGuard(onTick, { intervalMs: 1000 });
    guard.start();

    await vi.advanceTimersByTimeAsync(500);

    expect(onTick).not.toHaveBeenCalled();
    guard.stop();
  });

  it('stops ticking after stop()', async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const guard = new PollGuard(onTick, { intervalMs: 1000 });
    guard.start();

    await vi.advanceTimersByTimeAsync(2000);
    expect(onTick).toHaveBeenCalledTimes(2);

    guard.stop();

    await vi.advanceTimersByTimeAsync(5000);

    // No more calls after stop
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — stop() before start() does not throw', () => {
    const guard = new PollGuard(vi.fn(), { intervalMs: 100 });
    expect(() => guard.stop()).not.toThrow();
  });

  it('is idempotent — calling start() twice does not double-tick', async () => {
    const onTick = vi.fn().mockResolvedValue(undefined);
    const guard = new PollGuard(onTick, { intervalMs: 1000 });
    guard.start();
    guard.start(); // second call should be a no-op

    await vi.advanceTimersByTimeAsync(3000);

    // Should still be 3 ticks, not 6
    expect(onTick).toHaveBeenCalledTimes(3);
    guard.stop();
  });

  it('swallows async errors thrown by onTick', async () => {
    const onTick = vi.fn().mockRejectedValue(new Error('tick error'));
    const guard = new PollGuard(onTick, { intervalMs: 500 });
    guard.start();

    // Should not throw even though onTick rejects
    await expect(vi.advanceTimersByTimeAsync(1500)).resolves.not.toThrow();

    // ticks still fire
    expect(onTick).toHaveBeenCalledTimes(3);
    guard.stop();
  });

  it('swallows synchronous errors thrown by onTick', async () => {
    const onTick = vi.fn().mockImplementation(() => {
      throw new Error('sync error');
    });
    const guard = new PollGuard(onTick, { intervalMs: 500 });
    guard.start();

    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();

    expect(onTick).toHaveBeenCalledTimes(2);
    guard.stop();
  });

  it('uses default interval if none provided', async () => {
    // Default intervalMs should be > 0 so ticking eventually occurs
    const onTick = vi.fn().mockResolvedValue(undefined);
    const guard = new PollGuard(onTick);
    guard.start();

    // Advance by a large amount to trigger at least one tick
    await vi.advanceTimersByTimeAsync(300_000);

    expect(onTick).toHaveBeenCalled();
    guard.stop();
  });

  it('supports sync onTick returning void', async () => {
    const onTick = vi.fn(); // returns undefined (sync)
    const guard = new PollGuard(onTick, { intervalMs: 1000 });
    guard.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(onTick).toHaveBeenCalledOnce();
    guard.stop();
  });
});
