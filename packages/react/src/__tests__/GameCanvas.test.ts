import { describe, expect, it, vi } from 'vitest';
import { captureCanvasFrame, captureCompletedFrame, createEngineDestroyHandle, destroyEngineAfterBoot, normalizeFixedFrameCapture, resolvePixelRatio } from '../GameCanvas.js';
import {
  applyPreviewSelectionToController,
  resolvePreviewToggleState,
  resolveSettingResetValue,
  updatePreviewProfileLock,
  updatePreviewProfileSetting,
  waitForPreviewCaptureReady,
} from '../ExperienceRuntime.js';

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

describe('resolveSettingResetValue', () => {
  it('resets preview fields to Scene values while normal fields use their initial values', () => {
    expect(resolveSettingResetValue(true, 12, 8, 5)).toBe(12);
    expect(resolveSettingResetValue(false, 12, 8, 5)).toBe(8);
    expect(resolveSettingResetValue(true, undefined, 8, 5)).toBe(5);
  });
});

describe('resolvePixelRatio', () => {
  it('matches the working runtime two-times DPR ceiling before applying a pixel budget', () => {
    expect(resolvePixelRatio(400, 300, 2)).toBe(2);
    expect(resolvePixelRatio(400, 300, 3)).toBe(2);
    expect(resolvePixelRatio(400, 300, 2, 120_000)).toBe(1);
    expect(() => resolvePixelRatio(400, 300, 2, 0)).toThrow('maxPixels');
  });
});

describe('captureCompletedFrame', () => {
  it('invalidates and renders immediately before reading the WebGL framebuffer', () => {
    const calls: string[] = [];
    const rgba = new Uint8Array(4 * 3 * 4).fill(127);
    const capture = captureCompletedFrame(
      { frame: (delta) => { calls.push(`frame:${delta}`); } },
      { captureRgba: (presentFrame) => { calls.push('capture'); presentFrame(); calls.push('read'); return rgba; } },
      4,
      3,
    );

    expect(calls).toEqual(['capture', 'frame:0', 'read']);
    expect(capture).toEqual({ width: 4, height: 3, rgba });
  });

  it('rejects a renderer readback with the wrong byte length', () => {
    expect(() => captureCompletedFrame(
      { frame: () => undefined },
      { captureRgba: (presentFrame) => { presentFrame(); return new Uint8Array(3); } },
      2,
      2,
    )).toThrow('invalid dimensions');
  });

  it('temporarily supersamples a capture and restores the live framebuffer', () => {
    const frames: number[] = [];
    const resizes: Array<readonly [number, number, number]> = [];
    let pixelRatio = 1;
    const renderer = {
      get viewport() { return { width: 100, height: 50, pixelRatio }; },
      resize: (width: number, height: number, nextPixelRatio = 1) => {
        resizes.push([width, height, nextPixelRatio]);
        pixelRatio = nextPixelRatio;
      },
      requestRender: vi.fn(),
      captureRgba: (presentFrame: () => void) => {
        presentFrame();
        return new Uint8Array(Math.round(100 * pixelRatio) * Math.round(50 * pixelRatio) * 4);
      },
    };

    const capture = captureCanvasFrame({ frame: (delta) => { frames.push(delta); } }, renderer, { pixelRatio: 2 });

    expect(capture).toMatchObject({ width: 200, height: 100 });
    expect(resizes).toEqual([[100, 50, 2], [100, 50, 1]]);
    expect(renderer.requestRender).toHaveBeenCalledOnce();
    expect(frames).toEqual([0, 0]);
  });
});

describe('preview authoring state', () => {
  it('waits for automated scene content before capturing', async () => {
    const controller = { captureReady: false };
    let frames = 0;
    const ready = await waitForPreviewCaptureReady(controller, async () => {
      frames += 1;
      if (frames === 3) controller.captureReady = true;
    }, 10);
    expect(ready).toBe(true);
    expect(frames).toBe(3);
  });

  it('keeps engine-owned settings out of experience-specific controllers', () => {
    const controller = {
      modeId: 'old-mode',
      styleId: 'old-style',
      settings: {},
      setMode: vi.fn(),
      setStyle: vi.fn(),
      setSetting: vi.fn(),
      reset: vi.fn(),
    };
    applyPreviewSelectionToController(controller, {
      profile: 'preview',
      modeId: 'new-mode',
      styleId: 'new-style',
      settings: { timeScale: 0.5, radius: 18 },
      seed: 3,
      hash: '12345678',
    });

    expect(controller.setMode).toHaveBeenCalledWith('new-mode');
    expect(controller.setStyle).toHaveBeenCalledWith('new-style');
    expect(controller.setSetting).toHaveBeenCalledOnce();
    expect(controller.setSetting).toHaveBeenCalledWith('radius', 18);
  });

  it('preserves and restores the exact play selection across Preview mode', () => {
    const play = { modeId: 'draw', styleId: 'neon', settings: { amount: 73, ambient: false } };
    const preview = { modeId: 'add', styleId: 'glass', settings: { amount: 12, ambient: true } };
    const entered = resolvePreviewToggleState(false, true, play, { modeId: 'default', styleId: 'default', settings: {} }, preview);
    expect(entered.active).toBe(preview);
    expect(entered.savedPlay).toBe(play);

    const editedPreview = { ...preview, settings: { amount: 18, ambient: true } };
    const left = resolvePreviewToggleState(true, false, editedPreview, entered.savedPlay, editedPreview);
    expect(left.active).toBe(play);
    expect(left.savedPlay).toBe(play);
  });

  it('keeps the latest authored setting when that setting is subsequently locked', () => {
    const initial = {
      settings: { radius: 10, gravity: 0.5 },
      variation: { intensity: 0.25, lockedKeys: [] as readonly string[], seed: 7 },
      generationMode: 'varied' as const,
      renderPolicy: 'auto' as const,
    };

    const changed = updatePreviewProfileSetting(initial, 'radius', 18);
    const locked = updatePreviewProfileLock(changed, 'radius', true);

    expect(locked.settings).toEqual({ radius: 18, gravity: 0.5 });
    expect(locked.variation.lockedKeys).toEqual(['radius']);
    expect(initial.settings.radius).toBe(10);
  });

  it('removes a preview setting override when it returns to the scene baseline', () => {
    const initial = {
      settings: { radius: 18, gravity: 0.5 },
      variation: { intensity: 0.25, lockedKeys: [] as readonly string[], seed: 7 },
      generationMode: 'varied' as const,
      renderPolicy: 'auto' as const,
    };

    const changed = updatePreviewProfileSetting(initial, 'radius', 10, 10);
    expect(changed.settings).toEqual({ gravity: 0.5 });
  });
});
