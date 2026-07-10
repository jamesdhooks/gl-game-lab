import { describe, expect, it } from 'vitest';
import { normalizePaletteBackdropOptions } from '../index.js';

describe('normalizePaletteBackdropOptions', () => {
  it('resolves the shared enhanced side-view palette', () => {
    const options = normalizePaletteBackdropOptions({
      base: [0, 0, 0, 1],
      palette: [[1, 0, 0, 1], [0, 0, 1, 1], [0, 1, 0, 1], [1, 1, 0, 1]],
    });
    expect(options.base).toEqual([0.066, 0, 0.054]);
    expect(options.primary).toEqual([1, 0, 0]);
    expect(options.secondary).toEqual([0, 0, 1]);
    expect(options.accent).toEqual([1, 1, 0]);
    expect(options.tier).toBe(0.55);
  });

  it('rejects missing palettes and invalid tiers', () => {
    expect(() => normalizePaletteBackdropOptions({ base: [0, 0, 0, 1], palette: [] })).toThrow('at least one');
    expect(() => normalizePaletteBackdropOptions({ base: [0, 0, 0, 1], palette: [[1, 1, 1, 1]], tier: 2 })).toThrow('Backdrop tier');
  });
});
