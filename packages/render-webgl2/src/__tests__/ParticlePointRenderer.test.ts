import { describe, expect, it } from 'vitest';
import { ParticlePointRenderQueue, buildParticlePointDrawPlan } from '../index.js';

const palette = [[1, 0, 0, 1], [0, 1, 0, 1]] as const;

describe('ParticlePointRenderQueue', () => {
  it('accepts typed-array batches without creating per-particle objects', () => {
    const queue = new ParticlePointRenderQueue();
    queue.submit({
      id: 'dense-particles',
      count: 3,
      positions: new Float32Array([0, 0, 1, 1, 2, 2, 99, 99]),
      radii: new Float32Array([2, 3, 4, 99]),
      colorSeeds: new Float32Array([0, 1, 2, 99]),
      palette,
    });

    expect(queue.count).toBe(3);
    expect(queue.buildPlan()).toMatchObject({ particleCount: 3, drawCalls: 1 });
    queue.clear();
    expect(queue.count).toBe(0);
  });

  it('rejects incomplete buffers and invalid palettes at extraction time', () => {
    expect(() => buildParticlePointDrawPlan([{
      id: 'broken',
      count: 2,
      positions: new Float32Array(2),
      radii: new Float32Array(2),
      colorSeeds: new Float32Array(2),
      palette,
    }])).toThrow('positions');
    expect(() => buildParticlePointDrawPlan([{
      id: 'broken-palette',
      count: 0,
      positions: new Float32Array(0),
      radii: new Float32Array(0),
      colorSeeds: new Float32Array(0),
      palette: [],
    }])).toThrow('palette');
  });
});
