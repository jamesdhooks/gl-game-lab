import { describe, expect, it } from 'vitest';
import { PARTICLE_SPAWN_COMMAND_FLOATS_2D, planParticleSpawnCommands2D } from '../ParticleSpawnCommandPlanner2D.js';

describe('planParticleSpawnCommands2D', () => {
  it('splits wrapped commands and sorts absolute targets', () => {
    const source = new Float32Array(2 * PARTICLE_SPAWN_COMMAND_FLOATS_2D);
    source[0] = 1; source[2] = 3; source[16] = 0; source[18] = 4;
    const target = new Float32Array(4 * PARTICLE_SPAWN_COMMAND_FLOATS_2D);
    const cursors = new Int32Array([2, 7]);
    const result = planParticleSpawnCommands2D(source, 2, target, 4, new Float32Array([0, 4, 0, 0, 4, 4, 0, 0]), cursors);
    expect(result).toEqual({ commandCount: 4, droppedParticles: 0, truncatedCommands: 0 });
    expect([target[1], target[17], target[33], target[49]]).toEqual([0, 2, 4, 7]);
    expect([target[2], target[18], target[34], target[50]]).toEqual([2, 2, 2, 1]);
    expect(cursors).toEqual(new Int32Array([2, 6]));
  });

  it('reports particles excluded by the bounded command ring', () => {
    const source = new Float32Array(PARTICLE_SPAWN_COMMAND_FLOATS_2D); source[2] = 6;
    const result = planParticleSpawnCommands2D(source, 1, new Float32Array(PARTICLE_SPAWN_COMMAND_FLOATS_2D), 1, new Float32Array([0, 4, 0, 0]), new Int32Array([3]));
    expect(result).toEqual({ commandCount: 1, droppedParticles: 5, truncatedCommands: 1 });
  });
});
