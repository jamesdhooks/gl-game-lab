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
});
