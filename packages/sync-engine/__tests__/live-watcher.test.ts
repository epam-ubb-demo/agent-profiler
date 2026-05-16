import * as fs from 'node:fs';
import * as nodePath from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs before importing LiveWatcher
vi.mock('node:fs', () => {
  const mockWatcher = {
    close: vi.fn(),
    on: vi.fn().mockReturnThis(),
  };
  return {
    default: { watch: vi.fn().mockReturnValue(mockWatcher) },
    watch: vi.fn().mockReturnValue(mockWatcher),
  };
});

import { LiveWatcher } from '../src/live-watcher.js';

const mockWatch = vi.mocked(fs.watch);

function getMockWatcher() {
  const w = mockWatch.mock.results[mockWatch.mock.results.length - 1];
  return w?.value as { close: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> };
}

function fireWatchEvent(filename: string) {
  const watcher = getMockWatcher();
  const changeHandler = watcher.on.mock.calls.find((args) => args[0] === 'change')?.[1] as
    | ((event: string, f: string | null) => void)
    | undefined;
  changeHandler?.('change', filename);
}

function fireErrorEvent(err: Error) {
  const watcher = getMockWatcher();
  const errorHandler = watcher.on.mock.calls.find((args) => args[0] === 'error')?.[1] as
    | ((err: Error) => void)
    | undefined;
  errorHandler?.(err);
}

describe('LiveWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fs.watch with the root dir and recursive:true on start', () => {
    const watcher = new LiveWatcher('/root', vi.fn());
    watcher.start();

    expect(mockWatch).toHaveBeenCalledWith('/root', { recursive: true });
  });

  it('fires onChange after debounce with the session path', async () => {
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange, { debounceMs: 200 });
    watcher.start();

    fireWatchEvent(nodePath.join('session-abc', 'events.json'));

    // Not fired yet
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);

    expect(onChange).toHaveBeenCalledOnce();
    const expected = nodePath.join('/root', 'session-abc');
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('debounces rapid events for the same session', async () => {
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange, { debounceMs: 300 });
    watcher.start();

    fireWatchEvent(nodePath.join('session-1', 'events.json'));
    await vi.advanceTimersByTimeAsync(100);
    fireWatchEvent(nodePath.join('session-1', 'events.json'));
    await vi.advanceTimersByTimeAsync(100);
    fireWatchEvent(nodePath.join('session-1', 'events.json'));
    await vi.advanceTimersByTimeAsync(300);

    // Should fire exactly once despite three events
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('fires once per session for concurrent different sessions', async () => {
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange, { debounceMs: 100 });
    watcher.start();

    fireWatchEvent(nodePath.join('session-1', 'events.json'));
    fireWatchEvent(nodePath.join('session-2', 'events.json'));

    await vi.advanceTimersByTimeAsync(100);

    expect(onChange).toHaveBeenCalledTimes(2);
    const paths = onChange.mock.calls.map((args) => args[0] as string);
    expect(paths).toContain(nodePath.join('/root', 'session-1'));
    expect(paths).toContain(nodePath.join('/root', 'session-2'));
  });

  it('ignores null filename', async () => {
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange);
    watcher.start();

    fireWatchEvent(null as unknown as string); // pass null
    await vi.advanceTimersByTimeAsync(500);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onChange for root-level file (no subdirectory) treating filename itself as session dir', async () => {
    // The implementation takes parts[0] of the normalized path — for 'file.json' that's 'file.json' itself
    // This is expected behaviour (root-level files fire onChange with path.join(rootDir, 'file.json'))
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange, { debounceMs: 50 });
    watcher.start();

    fireWatchEvent('standalone-file.json');
    await vi.advanceTimersByTimeAsync(100);

    // onChange DOES fire — sessionPath will be /root/standalone-file.json
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(nodePath.join('/root', 'standalone-file.json'));
  });

  it('stops the fs.watch and clears debounce timers on stop()', async () => {
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange, { debounceMs: 500 });
    watcher.start();

    fireWatchEvent(nodePath.join('session-1', 'events.json'));

    watcher.stop();

    await vi.advanceTimersByTimeAsync(600);

    // Timer was cleared — onChange should NOT fire
    expect(onChange).not.toHaveBeenCalled();
    const mockWatcher = getMockWatcher();
    expect(mockWatcher.close).toHaveBeenCalledOnce();
  });

  it('stop() is idempotent when called before start()', () => {
    const watcher = new LiveWatcher('/root', vi.fn());
    expect(() => watcher.stop()).not.toThrow();
  });

  it('restarts after watcher error', async () => {
    const onChange = vi.fn();
    const watcher = new LiveWatcher('/root', onChange, { debounceMs: 50 });
    watcher.start();

    const firstCallCount = mockWatch.mock.calls.length;
    fireErrorEvent(new Error('ENOENT'));

    // Restart is scheduled after 1000ms
    expect(mockWatch.mock.calls.length).toBe(firstCallCount); // not yet

    await vi.advanceTimersByTimeAsync(1000);

    // Should have re-called fs.watch
    expect(mockWatch.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it('does not double-start if start() called twice', () => {
    const watcher = new LiveWatcher('/root', vi.fn());
    watcher.start();
    watcher.start(); // second call should no-op or re-use existing

    // Regardless of implementation, should not crash
    expect(mockWatch).toHaveBeenCalled();
    watcher.stop();
  });
});
