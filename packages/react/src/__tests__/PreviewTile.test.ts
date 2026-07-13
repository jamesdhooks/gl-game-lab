import { describe, expect, it, vi } from 'vitest';
import { PreviewScheduler, shouldAttemptLivePreview } from '../PreviewTile.js';

describe('shouldAttemptLivePreview', () => {
  const available = {
    enabled: true,
    visible: true,
    reducedMotion: false,
    webGl2Available: true,
    sessionFailed: false,
    runtimeFailed: false,
  } as const;

  it('never schedules a static or offscreen preview', () => {
    expect(shouldAttemptLivePreview({ ...available, policy: 'static' })).toBe(false);
    expect(shouldAttemptLivePreview({ ...available, policy: 'auto', visible: false })).toBe(false);
  });

  it('uses soft fallbacks only for Auto while retaining hard runtime failure handling', () => {
    expect(shouldAttemptLivePreview({ ...available, policy: 'auto', reducedMotion: true })).toBe(false);
    expect(shouldAttemptLivePreview({ ...available, policy: 'auto', webGl2Available: false })).toBe(false);
    expect(shouldAttemptLivePreview({ ...available, policy: 'auto', sessionFailed: true })).toBe(false);
    expect(shouldAttemptLivePreview({ ...available, policy: 'live', reducedMotion: true })).toBe(true);
    expect(shouldAttemptLivePreview({ ...available, policy: 'live', runtimeFailed: true })).toBe(false);
  });
});

describe('PreviewScheduler', () => {
  it('enforces the context limit and grants the nearest waiting tile next', () => {
    const scheduler = new PreviewScheduler(() => 2);
    const grants = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const tokens = [{}, {}, {}, {}];
    const releases = tokens.map((token, index) => scheduler.request({
      token,
      priority: () => [20, 10, 40, 5][index] ?? 100,
      grant: grants[index] ?? vi.fn(),
    }));

    expect(grants[0]).toHaveBeenCalledOnce();
    expect(grants[1]).toHaveBeenCalledOnce();
    expect(grants[2]).not.toHaveBeenCalled();
    expect(grants[3]).not.toHaveBeenCalled();

    releases[0]?.();
    expect(grants[3]).toHaveBeenCalledOnce();
    expect(grants[2]).not.toHaveBeenCalled();
  });
});
