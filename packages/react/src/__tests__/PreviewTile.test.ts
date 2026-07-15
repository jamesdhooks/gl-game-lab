import { describe, expect, it, vi } from 'vitest';
import type { ExperienceDefinition, ExperiencePreviewProfile } from '@hooksjam/gl-game-lab-engine';
import { detectWebGl2, PREVIEW_CONTEXT_LIMIT, PREVIEW_RESTART_BASE_MS, PREVIEW_RESTART_JITTER_MS, previewCycleDelay, previewCycleSeed, previewRestartDelay, PreviewScheduler, resolvePreviewImageUrl, shouldAttemptLivePreview } from '../PreviewTile.js';
import { resolvePreviewCycleLaunch } from '../PreviewCycle.js';

describe('resolvePreviewImageUrl', () => {
  it('resolves captures beneath the deployment base path and cache-busts revisions', () => {
    expect(resolvePreviewImageUrl('/gl-game-lab/', 'previews/ball-pit.webp', 'revision 2')).toBe('/gl-game-lab/previews/ball-pit.webp?v=revision%202');
    expect(resolvePreviewImageUrl('/gl-game-lab', '/previews/ball-pit.webp', 'abc')).toBe('/gl-game-lab/previews/ball-pit.webp?v=abc');
  });
});

describe('preview restart sequencing', () => {
  it('stagger restarts deterministically within the supported interval', () => {
    expect(PREVIEW_RESTART_BASE_MS + PREVIEW_RESTART_JITTER_MS / 2).toBe(10_000);
    const delay = previewRestartDelay('chain-rain', 42);
    expect(delay).toBeGreaterThanOrEqual(PREVIEW_RESTART_BASE_MS);
    expect(delay).toBeLessThanOrEqual(PREVIEW_RESTART_BASE_MS + PREVIEW_RESTART_JITTER_MS);
    expect(previewRestartDelay('chain-rain', 42)).toBe(delay);
    expect(previewRestartDelay('ball-pit', 42)).not.toBe(delay);
    expect(previewCycleDelay('chain-rain', 42, 1)).not.toBe(previewCycleDelay('chain-rain', 42, 2));
  });

  it('keeps the first seed and produces deterministic new cycle seeds', () => {
    expect(previewCycleSeed(42, 0)).toBe(42);
    expect(previewCycleSeed(42, 1)).toBe(previewCycleSeed(42, 1));
    expect(previewCycleSeed(42, 1)).not.toBe(42);
    expect(previewCycleSeed(42, 2)).not.toBe(previewCycleSeed(42, 1));
  });

  it('re-resolves unlocked palettes across full preview restarts', () => {
    const definition: ExperienceDefinition = {
      id: 'palette-cycle',
      kind: 'simulation',
      name: 'Palette Cycle',
      short: 'Palette cycle test.',
      long: 'Verifies palette changes across preview restarts.',
      icon: '*',
      tags: ['test'],
      capabilities: { interactive: false, reset: true, demo: true, settings: false, qualityModes: [] },
      configDefaults: {},
      styleManifest: {
        defaultStyleId: 'cyan',
        renderLayers: [],
        passes: [],
        qualities: [],
        styles: [
          { id: 'cyan', name: 'Cyan', description: 'Cyan', palette: [0x00ffff], background: 0, passes: [] },
          { id: 'ember', name: 'Ember', description: 'Ember', palette: [0xff6600], background: 0, passes: [] },
          { id: 'violet', name: 'Violet', description: 'Violet', palette: [0xaa55ff], background: 0, passes: [] },
        ],
      },
      createPlugins: () => [],
    };
    const profile: ExperiencePreviewProfile = {
      settings: {},
      variation: { intensity: 0.25, lockedKeys: [], seed: 4242 },
      generationMode: 'varied',
      renderPolicy: 'auto',
    };

    const palettes = new Set(Array.from({ length: 12 }, (_, generation) =>
      resolvePreviewCycleLaunch(definition, profile, 17, generation).styleId));
    expect(palettes.size).toBeGreaterThan(1);

    const locked = { ...profile, variation: { ...profile.variation, lockedKeys: ['$style'] } };
    for (let generation = 0; generation < 6; generation += 1) {
      expect(resolvePreviewCycleLaunch(definition, locked, 17, generation).styleId).toBe('cyan');
    }
  });
});

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
    expect(shouldAttemptLivePreview({ ...available, policy: 'live', webGl2Available: false, sessionFailed: true })).toBe(true);
    expect(shouldAttemptLivePreview({ ...available, policy: 'live', runtimeFailed: true })).toBe(false);
  });
});

describe('detectWebGl2', () => {
  it('uses a real context probe instead of requiring the global constructor', () => {
    const loseContext = vi.fn();
    const canvas = {
      getContext: vi.fn(() => ({
        getExtension: vi.fn(() => ({ loseContext })),
      })),
    } as unknown as HTMLCanvasElement;

    expect(detectWebGl2(() => canvas)).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('reports unavailable and thrown context creation safely', () => {
    const unavailable = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;
    expect(detectWebGl2(() => unavailable)).toBe(false);
    expect(detectWebGl2(() => { throw new Error('context failure'); })).toBe(false);
  });
});

describe('PreviewScheduler', () => {
  it('admits a full sixteen-tile gallery page', () => {
    const scheduler = new PreviewScheduler(() => PREVIEW_CONTEXT_LIMIT);
    const grants = Array.from({ length: PREVIEW_CONTEXT_LIMIT + 1 }, () => vi.fn());
    grants.forEach((grant, index) => {
      scheduler.request({ token: {}, priority: () => index, grant });
    });

    expect(grants.slice(0, PREVIEW_CONTEXT_LIMIT).every((grant) => grant.mock.calls.length === 1)).toBe(true);
    expect(grants[PREVIEW_CONTEXT_LIMIT]).not.toHaveBeenCalled();
  });

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
