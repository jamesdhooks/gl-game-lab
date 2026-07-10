import { describe, expect, it } from 'vitest';
import { DenseCircleParticleWorld2D } from '../index.js';

describe('DenseCircleParticleWorld2D', () => {
  it('stores active particles in renderer-ready typed-array prefixes', () => {
    const world = new DenseCircleParticleWorld2D(65_536, { maxParticles: 65_536 }, 7);
    world.setBounds(800, 600);
    world.spawnStream(128, 400, 20);

    expect(world.count).toBe(128);
    expect(world.positions).toBeInstanceOf(Float32Array);
    expect(world.positions.length).toBe(65_536 * 2);
    expect(world.radii.length).toBe(65_536);
    expect(world.colorSeeds.length).toBe(65_536);
  });

  it('replays identical seeded spawn and solver state', () => {
    const first = new DenseCircleParticleWorld2D(1024, { maxParticles: 1024 }, 19);
    const second = new DenseCircleParticleWorld2D(1024, { maxParticles: 1024 }, 19);
    first.setBounds(320, 240);
    second.setBounds(320, 240);
    first.spawnStream(64, 160, 10);
    second.spawnStream(64, 160, 10);
    first.step(1 / 60);
    second.step(1 / 60);

    expect(first.positions.slice(0, first.count * 2)).toEqual(second.positions.slice(0, second.count * 2));
    expect(first.velocities.slice(0, first.count * 2)).toEqual(second.velocities.slice(0, second.count * 2));
    expect(first.getStats()).toEqual(second.getStats());
  });

  it('supports runtime configuration, picking, dragging, and explosion forces', () => {
    const world = new DenseCircleParticleWorld2D(16, { maxParticles: 16, gravity: 0 }, 3);
    world.setBounds(200, 200);
    world.addCircle(100, 100, { velocityX: 0, velocityY: 0, radiusNoise: 0 });
    const picked = new Int32Array(4);
    const pickedCount = world.pickNearby(100, 100, 20, picked);
    world.dragPicked(picked, pickedCount, 120, 100, 1 / 60);
    world.applyExplosion(80, 100, 80, 100);
    world.step(1 / 60);

    expect(pickedCount).toBe(1);
    expect(world.positions[0]).toBeGreaterThan(100);
    world.configure({ radius: 20, radiusVariation: 0, maxParticles: 1 });
    expect(world.radii[0]).toBe(20);
    expect(world.addCircle(0, 0)).toBe(-1);
  });

  it('resolves dense overlaps through a deterministic uniform grid', () => {
    const world = new DenseCircleParticleWorld2D(8, {
      maxParticles: 8,
      gravity: 0,
      radius: 10,
      radiusVariation: 0,
      solverIterations: 4,
      substeps: 1,
    }, 5);
    world.setBounds(100, 100);
    world.addCircle(40, 50, { radiusNoise: 0 });
    world.addCircle(45, 50, { radiusNoise: 0 });
    const stats = world.step(1 / 60);

    expect(Math.abs((world.positions[2] ?? 0) - (world.positions[0] ?? 0))).toBeGreaterThan(18);
    expect(stats.collisionHits).toBeGreaterThan(0);
  });
});
