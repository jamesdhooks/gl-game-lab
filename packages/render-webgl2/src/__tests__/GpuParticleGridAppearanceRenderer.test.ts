import { describe, expect, it } from 'vitest';
import type { GpuExternalParticleRenderOptions2D } from '@hooksjam/gl-game-lab-engine';
import {
  resolveGpuExternalParticleRenderWork2D,
  validateGpuExternalParticleRenderOptions2D,
} from '../GpuParticleGridAppearanceRenderer.js';

const BASE_OPTIONS: GpuExternalParticleRenderOptions2D = Object.freeze({
  tier: 'enhanced',
  worldWidth: 384,
  worldHeight: 384,
  radiusScale: 1,
  palette: Object.freeze([[1, 0.2, 0.1, 1] as const, [0.1, 0.6, 1, 1] as const]),
  paletteMode: 'continuous',
  appearanceSource: 'speed',
  appearanceRange: [0, 1200] as const,
  sizeCurve: { keys: [{ at: 0, value: 0.7 }, { at: 1, value: 1.4 }] },
  alphaCurve: { keys: [{ at: 0, value: 0.4 }, { at: 1, value: 1 }] },
  streakLength: 0.02,
});

describe('GpuParticleGridAppearanceRenderer', () => {
  it('resolves tier passes and LOD without changing active simulation state', () => {
    expect(resolveGpuExternalParticleRenderWork2D(10_000, { ...BASE_OPTIONS, renderStride: 4, maxParticles: 6000 })).toEqual({
      particleLimit: 6000,
      renderedParticles: 1500,
      useStreaks: true,
      useTrails: false,
      passCount: 2,
    });
    expect(resolveGpuExternalParticleRenderWork2D(10_000, { ...BASE_OPTIONS, tier: 'ultra', trailPersistence: 0.94 })).toMatchObject({
      renderedParticles: 10_000,
      useStreaks: true,
      useTrails: true,
      passCount: 4,
    });
  });

  it('rejects invalid curves and appearance ranges before touching WebGL', () => {
    expect(() => validateGpuExternalParticleRenderOptions2D({ ...BASE_OPTIONS, appearanceRange: [2, 2] })).toThrow('appearance range');
    expect(() => validateGpuExternalParticleRenderOptions2D({
      ...BASE_OPTIONS,
      sizeCurve: { keys: [{ at: 0.8, value: 1 }, { at: 0.4, value: 2 }] },
    })).toThrow('ordered');
  });
});
