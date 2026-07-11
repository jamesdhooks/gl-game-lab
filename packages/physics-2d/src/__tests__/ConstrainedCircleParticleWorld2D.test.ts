import { describe, expect, it } from 'vitest';
import { ConstrainedCircleParticleWorld2D } from '../ConstrainedCircleParticleWorld2D.js';

describe('ConstrainedCircleParticleWorld2D', () => {
  it('keeps linked circles near their rest distance', () => {
    const world = new ConstrainedCircleParticleWorld2D(8, 8, { gravity: 0, solverIterations: 1, substeps: 1 });
    world.setBounds(500, 500);
    const a = world.addCircle(100, 100), b = world.addCircle(200, 100);
    world.addDistanceConstraint(a, b, { restLength: 30, stiffness: 1 });
    for (let i = 0; i < 5; i += 1) world.step(1 / 60);
    expect(Math.hypot((world.positions[2] ?? 0) - (world.positions[0] ?? 0), (world.positions[3] ?? 0) - (world.positions[1] ?? 0))).toBeLessThan(40);
  });

  it('packs active links for instanced GPU rendering', () => {
    const world = new ConstrainedCircleParticleWorld2D(4, 4, { gravity: 0 });
    world.addCircle(10, 20); world.addCircle(30, 40); world.addDistanceConstraint(0, 1);
    expect(world.packSegments()).toMatchObject({ count: 1 });
  });
});
