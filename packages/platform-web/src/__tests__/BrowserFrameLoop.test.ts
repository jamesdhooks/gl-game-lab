import { describe, expect, it } from 'vitest';
import { BrowserFrameLoop, type AnimationFrameDriver } from '../index.js';

describe('BrowserFrameLoop', () => {
  it('converts animation-frame timestamps to seconds and stops cleanly', () => {
    let callback: FrameRequestCallback | undefined;
    const cancelled: number[] = [];
    const driver: AnimationFrameDriver = {
      request: (next) => {
        callback = next;
        return 7;
      },
      cancel: (handle) => { cancelled.push(handle); },
    };
    const frames: number[] = [];
    const loop = new BrowserFrameLoop({ frame: (delta: number) => { frames.push(delta); } } as never, driver);

    loop.start();
    callback?.(1000);
    callback?.(1016);
    loop.stop();

    expect(frames).toEqual([0, 0.016]);
    expect(cancelled).toEqual([7]);
    expect(loop.isRunning).toBe(false);
  });

  it('stops and reports runtime frame failures', () => {
    let callback: FrameRequestCallback | undefined;
    const driver: AnimationFrameDriver = { request: (next) => { callback = next; return 9; }, cancel: () => undefined };
    const failures: unknown[] = [];
    const loop = new BrowserFrameLoop({ frame: () => { throw new Error('shader failed'); } } as never, driver, (error) => { failures.push(error); });
    loop.start();
    callback?.(1000);
    expect(loop.isRunning).toBe(false);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(Error);
  });

  it('caps engine frames while retaining accumulated delta time', () => {
    let callback: FrameRequestCallback | undefined;
    const driver: AnimationFrameDriver = { request: (next) => { callback = next; return 10; }, cancel: () => undefined };
    const frames: number[] = [];
    const afterFrames: number[] = [];
    const loop = new BrowserFrameLoop(
      { frame: (delta: number) => { frames.push(delta); } } as never,
      driver,
      undefined,
      { maxFps: 30, onAfterFrame: (timestamp) => { afterFrames.push(timestamp); } },
    );
    loop.start();
    callback?.(1_000);
    callback?.(1_016);
    callback?.(1_034);
    callback?.(1_050);
    callback?.(1_068);
    loop.stop();
    expect(frames).toEqual([0, 0.034, 0.034]);
    expect(afterFrames).toEqual([1_000, 1_034, 1_068]);
  });
});
