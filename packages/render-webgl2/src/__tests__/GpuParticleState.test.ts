import { describe, expect, it } from 'vitest';
import { resolveGpuParticleStateSize } from '../GpuParticleState.js';

describe('resolveGpuParticleStateSize', () => {
  it('packs requested capacity into a near-square GPU texture', () => {
    expect(resolveGpuParticleStateSize({ capacity: 147_456 })).toEqual({ capacity: 147_456, width: 384, height: 384 });
    expect(resolveGpuParticleStateSize({ capacity: 1_000 })).toEqual({ capacity: 1_000, width: 32, height: 32 });
  });

  it('supports explicit texture dimensions without exposing unused cells', () => {
    expect(resolveGpuParticleStateSize({ capacity: 500, width: 16, height: 16 })).toEqual({ capacity: 256, width: 16, height: 16 });
  });

  it('rejects invalid capacities and dimensions', () => {
    expect(() => resolveGpuParticleStateSize({ capacity: 0 })).toThrow('capacity must be a positive integer');
    expect(() => resolveGpuParticleStateSize({ capacity: 32, width: -1 })).toThrow('width must be a positive integer');
  });
});
