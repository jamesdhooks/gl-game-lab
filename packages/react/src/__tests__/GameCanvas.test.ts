import { describe, expect, it, vi } from 'vitest';
import { createEngineDestroyHandle, destroyEngineAfterBoot, normalizeFixedFrameCapture } from '../GameCanvas.js';

describe('normalizeFixedFrameCapture', () => {
  it('provides a deterministic sixty-hertz default', () => {
    expect(normalizeFixedFrameCapture({ frameNumber: 120 })).toEqual({
      frameNumber: 120,
      fixedDeltaSeconds: 1 / 60,
      inputEvents: [],
    });
  });

  it('rejects unsafe capture bounds', () => {
    expect(() => normalizeFixedFrameCapture({ frameNumber: 0 })).toThrow('between 1 and 10000');
    expect(() => normalizeFixedFrameCapture({ frameNumber: 1, fixedDeltaSeconds: 0.5 })).toThrow('at most 0.25');
    expect(() => normalizeFixedFrameCapture({
      frameNumber: 2,
      inputEvents: [
        { frameNumber: 1, event: { kind: 'pointer', phase: 'down', id: 1, x: 1, y: 1, buttons: 1 } },
        { frameNumber: 0, event: { kind: 'pointer', phase: 'up', id: 1, x: 1, y: 1, buttons: 0 } },
      ],
    })).toThrow('ordered by frame');
  });

  it('destroys an engine exactly once and shares asynchronous failure', async () => {
    const failure = new Error('destroy failed');
    const destroy = vi.fn().mockRejectedValue(failure);
    const handle = createEngineDestroyHandle({ destroy });

    const first = handle.destroy();
    const second = handle.destroy();

    expect(handle.started).toBe(true);
    expect(first).toBe(second);
    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('defers unmount destruction until an in-flight boot transition settles', async () => {
    let finishBoot: (() => void) | undefined;
    const boot = new Promise<void>((resolve) => { finishBoot = resolve; });
    const destroy = vi.fn().mockResolvedValue(undefined);
    const handle = createEngineDestroyHandle({ destroy });

    const cleanup = destroyEngineAfterBoot(boot, handle);
    await Promise.resolve();
    expect(destroy).not.toHaveBeenCalled();

    finishBoot?.();
    await cleanup;
    expect(destroy).toHaveBeenCalledOnce();
  });
});
