import { describe, expect, it } from 'vitest';
import {
  GPU_PARTICLE_COMMAND_CAPACITY,
  GPU_PARTICLE_COMMAND_FLOATS,
  normalizeGpuParticleCommandBatch,
} from '../GpuParticleCommandBuffer.js';

describe('GPU particle command batches', () => {
  it('accepts one packed 16-float command and caps batches at 64 commands', () => {
    expect(normalizeGpuParticleCommandBatch(1, GPU_PARTICLE_COMMAND_FLOATS)).toEqual({ count: 1, dropped: 0, requiredFloats: 16 });
    expect(normalizeGpuParticleCommandBatch(70, 70 * GPU_PARTICLE_COMMAND_FLOATS)).toEqual({
      count: GPU_PARTICLE_COMMAND_CAPACITY,
      dropped: 6,
      requiredFloats: GPU_PARTICLE_COMMAND_CAPACITY * GPU_PARTICLE_COMMAND_FLOATS,
    });
  });

  it('rejects undersized command data and invalid counts', () => {
    expect(() => normalizeGpuParticleCommandBatch(2, 16)).toThrow('requires at least 32 floats');
    expect(() => normalizeGpuParticleCommandBatch(-1, 0)).toThrow('non-negative integer');
  });
});
