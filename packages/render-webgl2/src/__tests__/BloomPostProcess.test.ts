import { describe, expect, it } from 'vitest';
import { bloomBlurPassDirections, normalizeBloomOptions, normalizeEmissiveLightingOptions } from '../index.js';
import { BLOOM_FILTER_FRAGMENT_SHADER } from '../BloomPostProcess.js';

describe('normalizeBloomOptions', () => {
  it('retains saturated highlights at the maximum threshold through a soft extraction knee', () => {
    expect(BLOOM_FILTER_FRAGMENT_SHADER).toContain('u_threshold - 0.18');
    expect(BLOOM_FILTER_FRAGMENT_SHADER).toContain('smoothstep(kneeStart, kneeEnd, brightness)');
    expect(BLOOM_FILTER_FRAGMENT_SHADER).not.toContain('u_threshold + 0.18');
  });
  it('provides an idle-by-default post-process profile', () => {
    expect(normalizeBloomOptions()).toEqual({
      enabled: false,
      threshold: 0.68,
      intensity: 0.9,
      radius: 1,
      iterations: 4,
      resolutionScale: 0.5,
    });
  });

  it('normalizes a complete reusable bloom profile', () => {
    expect(normalizeBloomOptions({
      enabled: true,
      threshold: 0.4,
      intensity: 1.5,
      radius: 2,
      iterations: 6,
      resolutionScale: 0.25,
    })).toEqual({
      enabled: true,
      threshold: 0.4,
      intensity: 1.5,
      radius: 2,
      iterations: 6,
      resolutionScale: 0.25,
    });
  });

  it('supports wide-kernel bloom used by liquid surfaces', () => {
    expect(normalizeBloomOptions({ enabled: true, radius: 8 }).radius).toBe(8);
  });

  it('decorrelates wide full-resolution blur passes without increasing total radius per sample', () => {
    const passes = Array.from({ length: 8 }, (_, index) => bloomBlurPassDirections(8, 8, index));
    const lengths = passes.map(({ horizontal }) => Math.hypot(...horizontal));
    expect(Math.max(...lengths)).toBeLessThanOrEqual(4);
    expect(new Set(passes.map(({ horizontal }) => horizontal.map((value) => value.toFixed(5)).join(','))).size).toBe(8);
    expect(passes.some(({ horizontal }) => Math.abs(horizontal[1]) > 0.01)).toBe(true);
    for (const { horizontal, vertical } of passes) {
      expect(horizontal[0] * vertical[0] + horizontal[1] * vertical[1]).toBeCloseTo(0, 10);
    }
  });

  it.each([
    [{ threshold: -0.1 }, 'Bloom threshold'],
    [{ intensity: 9 }, 'Bloom intensity'],
    [{ radius: 0 }, 'Bloom radius'],
    [{ iterations: 0 }, 'Bloom iterations'],
    [{ resolutionScale: 2 }, 'Bloom resolution scale'],
  ] as const)('rejects invalid options', (options, message) => {
    expect(() => normalizeBloomOptions(options)).toThrow(message);
  });
});

describe('normalizeEmissiveLightingOptions', () => {
  it('keeps emissive lighting idle until a scene enables it', () => {
    expect(normalizeEmissiveLightingOptions()).toMatchObject({
      enabled: false, environmentStrength: 0, shaftStrength: 0, heatDistortion: 0, resolutionScale: 0.25,
    });
  });

  it('normalizes a reusable dominant-light profile', () => {
    expect(normalizeEmissiveLightingOptions({
      enabled: true, source: [0.25, 0.75], radius: 0.3, color: [1, 0.5, 0.1], sourceIntensity: 1.2,
      environmentStrength: 0.6, shaftStrength: 0.2, shaftLength: 0.7, heatDistortion: 0.15,
    })).toMatchObject({
      enabled: true, source: [0.25, 0.75], radius: 0.3, color: [1, 0.5, 0.1], sourceIntensity: 1.2,
      environmentStrength: 0.6, shaftStrength: 0.2, shaftLength: 0.7, heatDistortion: 0.15,
    });
  });

  it('rejects invalid normalized sources and effect ranges', () => {
    expect(() => normalizeEmissiveLightingOptions({ source: [1.1, 0.5] })).toThrow('normalized');
    expect(() => normalizeEmissiveLightingOptions({ heatDistortion: 3 })).toThrow('Heat distortion');
  });
});
