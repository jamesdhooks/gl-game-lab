import { describe, expect, it } from 'vitest';
import { authoredMetaballEdgeSoftness, validateDensityMetaballBatch } from '../DensityMetaballRenderer.js';
describe('DensityMetaballRenderer', () => {
  it('accepts renderer-ready density data', () => {
    expect(() => validateDensityMetaballBatch({
      count: 2,
      positions: new Float32Array(4),
      radii: new Float32Array(2),
      temperatures: new Float32Array(2),
      colorSeeds: new Float32Array(2),
      velocities: new Float32Array(4)
    })).not.toThrow();
  });
  it('rejects incomplete thermal data', () => {
    expect(() => validateDensityMetaballBatch({
      count: 2,
      positions: new Float32Array(4),
      radii: new Float32Array(2),
      temperatures: new Float32Array(1)
    })).toThrow('temperatures');
  });
  it('rejects incomplete optional fluid color data', () => {
    expect(() => validateDensityMetaballBatch({
      count: 2,
      positions: new Float32Array(4),
      radii: new Float32Array(2),
      temperatures: new Float32Array(2),
      colorSeeds: new Float32Array(1)
    })).toThrow('color seeds');
    expect(() => validateDensityMetaballBatch({
      count: 2,
      positions: new Float32Array(4),
      radii: new Float32Array(2),
      temperatures: new Float32Array(2),
      velocities: new Float32Array(3)
    })).toThrow('velocities');
  });
  it('passes the authored softness range through without attenuating it', () => {
    expect(authoredMetaballEdgeSoftness(0)).toBe(0.001);
    expect(authoredMetaballEdgeSoftness(0.56)).toBe(0.56);
    expect(authoredMetaballEdgeSoftness(2)).toBe(2);
  });
});
