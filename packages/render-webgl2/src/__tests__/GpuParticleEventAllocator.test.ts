import { describe, expect, it } from 'vitest';
import {
  accumulateGpuParticleEventCounters,
  type GpuParticleEventCounterSnapshot,
} from '../GpuParticleEventAllocator.js';

const EMPTY: GpuParticleEventCounterSnapshot = {
  attempts: 0,
  winners: 0,
  admissions: 0,
  contentionLosses: 0,
  occupiedLosses: 0,
  capacityLosses: 0,
  generationLosses: 0,
  attemptsByTrigger: [0, 0, 0, 0],
  attemptsByPriority: [0, 0, 0],
  accuracy: 'estimated',
};

describe('GPU particle event counter reduction', () => {
  it('decodes the compact counter texture and derives contention loss', () => {
    const values = new Float32Array([
      10, 6, 5, 0,
      1, 1, 1, 0,
      2, 3, 4, 1,
      4, 3, 1, 0,
    ]);

    expect(accumulateGpuParticleEventCounters(EMPTY, values, false)).toEqual({
      attempts: 10,
      winners: 6,
      admissions: 5,
      contentionLosses: 2,
      occupiedLosses: 1,
      capacityLosses: 1,
      generationLosses: 1,
      attemptsByTrigger: [2, 3, 4, 1],
      attemptsByPriority: [4, 3, 1],
      accuracy: 'delayed',
    });
  });

  it('accumulates samples and reports estimated accuracy after a missed fence slot', () => {
    const first = accumulateGpuParticleEventCounters(
      EMPTY,
      new Float32Array([4, 3, 3, 0, 0, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0]),
      false,
    );
    const second = accumulateGpuParticleEventCounters(
      first,
      new Float32Array([5, 2, 1, 0, 1, 1, 0, 0, 0, 5, 0, 0, 0, 3, 1, 0]),
      true,
    );

    expect(second).toMatchObject({
      attempts: 9,
      winners: 5,
      admissions: 4,
      contentionLosses: 3,
      occupiedLosses: 1,
      capacityLosses: 1,
      attemptsByTrigger: [4, 5, 0, 0],
      attemptsByPriority: [4, 3, 1],
      accuracy: 'estimated',
    });
  });
});
