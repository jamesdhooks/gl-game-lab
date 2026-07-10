import { describe, expect, it } from 'vitest';
import { PhysicsWorld2D } from '../index.js';

describe('PhysicsWorld2D', () => {
  it('integrates gravity and resolves configured world bounds', () => {
    const world = new PhysicsWorld2D({
      gravityY: 100,
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
      boundaryRestitution: 0.5,
    });
    const body = world.createCircle({ x: 50, y: 90, radius: 10, velocityY: 20 });

    world.step(0.2);

    expect(body.y).toBe(90);
    expect(body.velocityY).toBeLessThan(0);
  });

  it('separates overlapping circles deterministically through the grid broadphase', () => {
    const world = new PhysicsWorld2D({ gravityY: 0, solverIterations: 4, cellSize: 16 });
    const first = world.createCircle({ x: 0, y: 0, radius: 10 });
    const second = world.createCircle({ x: 5, y: 0, radius: 10 });

    world.step(1 / 60);

    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThan(19);
    expect(world.values().map(({ id }) => id)).toEqual([first.id, second.id]);
  });

  it('rejects malformed body and bounds input', () => {
    expect(() => new PhysicsWorld2D({ bounds: { left: 1, top: 0, right: 1, bottom: 1 } })).toThrow('positive area');
    const world = new PhysicsWorld2D();
    expect(() => world.createCircle({ x: 0, y: 0, radius: 0 })).toThrow('radius');
  });
});
