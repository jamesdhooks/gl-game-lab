import { describe, expect, it } from 'vitest';
import { normalizeTextureDescriptor } from '../index.js';

describe('normalizeTextureDescriptor', () => {
  it('applies explicit GPU-safe defaults', () => {
    expect(normalizeTextureDescriptor({ width: 320, height: 180 })).toEqual({
      width: 320,
      height: 180,
      format: 'rgba8',
      filter: 'linear',
      wrap: 'clamp',
      renderTarget: false,
    });
  });

  it('rejects invalid render-target dimensions before WebGL allocation', () => {
    expect(() => normalizeTextureDescriptor({ width: 0, height: 1 })).toThrow('Texture width');
    expect(() => normalizeTextureDescriptor({ width: 1.5, height: 1 })).toThrow('Texture width');
  });
});
