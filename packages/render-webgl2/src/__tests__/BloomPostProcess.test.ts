import { describe, expect, it } from 'vitest';
import { normalizeBloomOptions } from '../index.js';

describe('normalizeBloomOptions', () => {
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
