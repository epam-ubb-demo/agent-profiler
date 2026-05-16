import { describe, it, expect } from 'vitest';

import { KeyedMutex } from '../src/sync-mutex.js';

describe('KeyedMutex', () => {
  it('allows concurrent locks on different keys', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const release1 = await mutex.acquire('key-a');
    const release2 = await mutex.acquire('key-b');

    order.push('key-a held');
    order.push('key-b held');
    release1();
    release2();

    expect(order).toEqual(['key-a held', 'key-b held']);
  });

  it('serialises concurrent lock attempts on the same key', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    // Acquire first — do NOT release yet
    const release1 = await mutex.acquire('key');

    // Start second acquire (this should queue behind first)
    const secondAcquirePromise = mutex.acquire('key').then((release) => {
      order.push('second entered');
      release();
    });

    // Give the event loop a chance to run (second should NOT have entered yet)
    await Promise.resolve();
    order.push('first still holding');
    release1();

    await secondAcquirePromise;

    expect(order).toEqual(['first still holding', 'second entered']);
  });

  it('serialises three waiters in FIFO order', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const release1 = await mutex.acquire('key');

    const p2 = mutex.acquire('key').then((r) => {
      order.push('second');
      r();
    });
    const p3 = mutex.acquire('key').then((r) => {
      order.push('third');
      r();
    });

    order.push('first');
    release1();

    await Promise.all([p2, p3]);

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('releases the map entry after the last waiter finishes', async () => {
    const mutex = new KeyedMutex();

    const release1 = await mutex.acquire('key');
    release1();

    // Acquiring again should succeed immediately (no lingering lock)
    const release2 = await mutex.acquire('key');
    expect(release2).toBeTypeOf('function');
    release2();
  });

  it('is independent across keys — releasing one does not release another', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];

    const releaseA = await mutex.acquire('a');
    const releaseB = await mutex.acquire('b');

    const waitForA = mutex.acquire('a').then((r) => {
      order.push('second-a');
      r();
    });

    releaseB();
    order.push('released-b');

    // second-a should still be waiting
    await Promise.resolve();
    expect(order).toEqual(['released-b']);

    releaseA();
    await waitForA;
    expect(order).toEqual(['released-b', 'second-a']);
  });

  it('handles rapid acquire/release cycles without errors', async () => {
    const mutex = new KeyedMutex();
    const results: number[] = [];

    await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const release = await mutex.acquire('shared');
        results.push(i);
        release();
      }),
    );

    expect(results.length).toBe(20);
  });
});
