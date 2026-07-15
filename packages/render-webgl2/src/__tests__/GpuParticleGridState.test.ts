import { describe, expect, it } from 'vitest';
import { gpuParticleGridBytes, resolveGpuParticleGridStateSize } from '../GpuParticleGridState.js';

describe('resolveGpuParticleGridStateSize', () => {
  it('packs particle capacity while preserving authored grid dimensions', () => {
    expect(resolveGpuParticleGridStateSize({
      capacity: 1_000,
      gridWidth: 64,
      gridHeight: 48,
    })).toEqual({
      capacity: 1_000,
      width: 32,
      height: 32,
      gridWidth: 64,
      gridHeight: 48,
    });
    expect(resolveGpuParticleGridStateSize({
      capacity: 500,
      width: 16,
      height: 16,
      gridWidth: 32,
      gridHeight: 24,
    })).toEqual({
      capacity: 256,
      width: 16,
      height: 16,
      gridWidth: 32,
      gridHeight: 24,
    });
  });

  it('accounts for three ping-ponged particle textures and four ping-ponged grid textures', () => {
    expect(gpuParticleGridBytes({
      capacity: 16,
      width: 4,
      height: 4,
      gridWidth: 8,
      gridHeight: 4,
    })).toBe((4 * 4 * 16 * 3 * 2) + (8 * 4 * 16 * 4 * 2));
  });

  it('rejects invalid dimensions before allocating GPU resources', () => {
    expect(() => resolveGpuParticleGridStateSize({ capacity: 0, gridWidth: 8, gridHeight: 8 })).toThrow('capacity');
    expect(() => resolveGpuParticleGridStateSize({ capacity: 16, gridWidth: 0, gridHeight: 8 })).toThrow('grid width');
    expect(() => resolveGpuParticleGridStateSize({ capacity: 16, gridWidth: 8, gridHeight: 0 })).toThrow('grid height');
  });
});
