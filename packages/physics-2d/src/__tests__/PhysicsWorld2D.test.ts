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

  it('adapts bounds to a resized render viewport', () => {
    const world = new PhysicsWorld2D({ gravityY: 0 });
    const body = world.createCircle({ x: 90, y: 50, radius: 10, velocityX: 20 });

    world.setBounds({ left: 0, top: 0, right: 80, bottom: 100 });
    world.step(1 / 60);

    expect(body.x).toBe(70);
    expect(body.velocityX).toBeLessThanOrEqual(0);
  });

  it('reconfigures solver behavior without replacing the world', () => {
    const world = new PhysicsWorld2D({ gravityY: 100, substeps: 1 });
    const body = world.createCircle({ x: 10, y: 10, radius: 2, friction: 1.5 });
    world.configure({ gravityY: 0, substeps: 2, solverIterations: 2, collisionSoftness: 1.05, maxPairPush: 0.75, impactBounceThreshold: 150 });

    world.step(0.25);

    expect(body.y).toBe(10);
    expect(body.friction).toBe(1.5);
  });

  it('supports open-top worlds for falling-particle simulations', () => {
    const world = new PhysicsWorld2D({
      gravityY: 0,
      openTop: true,
      bounds: { left: 0, top: 0, right: 100, bottom: 100 },
    });
    const body = world.createCircle({ x: 50, y: -10, radius: 2, velocityY: 1 });

    world.step(0.1);

    expect(body.y).toBeLessThan(0);
  });

  it('separates overlapping circles deterministically through the grid broadphase', () => {
    const world = new PhysicsWorld2D({ gravityY: 0, solverIterations: 4, cellSize: 16 });
    const first = world.createCircle({ x: 0, y: 0, radius: 10 });
    const second = world.createCircle({ x: 5, y: 0, radius: 10 });

    const stats = world.step(1 / 60);

    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThan(19);
    expect(world.values().map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(stats.broadPhaseBuilds).toBe(1);
    expect(stats.solverPasses).toBe(4);
    expect(stats.pairTests).toBe(stats.candidatePairs * stats.solverPasses);
    expect(stats.contacts).toBeGreaterThan(0);
    expect(world.stateHash()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('rejects malformed body and bounds input', () => {
    expect(() => new PhysicsWorld2D({ bounds: { left: 1, top: 0, right: 1, bottom: 1 } })).toThrow('positive area');
    const world = new PhysicsWorld2D();
    expect(() => world.createCircle({ x: 0, y: 0, radius: 0 })).toThrow('radius');
    expect(() => world.setBounds({ left: 1, top: 0, right: 1, bottom: 1 })).toThrow('positive area');
  });
});
