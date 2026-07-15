import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createWaterTankConfig, WATER_TANK_DEFAULTS, WATER_TANK_STYLE_MANIFEST, WaterTankModel, waterTankDefinition } from '../index.js';
import {
  createWaterTankObstacleLayout,
  waterTankObstacleLayoutSeed,
  waterTankObstaclesOverlap,
  type WaterTankTuning,
} from '../water-tank/WaterTankModel.js';
import { selectHeldWaterTankPointer } from '../water-tank/WaterTankPlugin.js';

const BASE_TUNING: WaterTankTuning = Object.freeze({
  maxParticles: 2048,
  particleRadius: 3.1,
  gravity: 1120,
  viscosity: 1,
  viscositySigma: 0.9,
  viscosityBeta: 0.3,
  fluidity: 0.72,
  supportRadiusScale: 1.35,
  restDensity: 0.72,
  stiffness: 0.028,
  nearStiffness: 1.15,
  neighborPairBudget: 65536,
  surfaceTension: 900,
  collisionBounce: 0.04,
  maxFluidSpeed: 2400,
  substeps: 2,
});

function simulateWaterTank(overrides: Partial<WaterTankTuning>, count = 280, steps = 75) {
  const tuning = { ...BASE_TUNING, ...overrides };
  const model = new WaterTankModel();
  model.reset(400, 400, tuning, 42);
  model.seedReservoir(400, 400, count, tuning.particleRadius);
  for (let step = 0; step < steps; step++) model.step(1 / 60, 400, 400, tuning);
  let speed = 0;
  let density = 0;
  for (let index = 0; index < model.count; index++) {
    const offset = index * 2;
    speed += Math.hypot(model.world.velocities[offset] ?? 0, model.world.velocities[offset + 1] ?? 0);
    density += model.density[index] ?? 0;
  }
  return {
    density: density / Math.max(1, model.count),
    hash: model.world.stateHash(),
    model,
    speed: speed / Math.max(1, model.count),
  };
}

describe('Water Tank', () => {
  it('registers pour, splash, build, ten styles, and attribution', () => {
    const definition = new ExperienceRegistry().register(waterTankDefinition).get('water-tank');
    expect(definition.modes?.map(mode => mode.id)).toEqual([
      'pour',
      'splash',
      'build'
    ]);
    expect(WATER_TANK_STYLE_MANIFEST.styles).toHaveLength(10);
    expect(definition.attributions?.[0]?.author).toBe('Eric Arneb\u00E4ck');
  });
  it('pours particles and packs reusable obstacles', () => {
    const model = new WaterTankModel(), config = createWaterTankConfig(), tuning = {
      maxParticles: Number(config.maxParticles),
      particleRadius: Number(config.particleRadius),
      gravity: Number(config.gravity),
      viscosity: Number(config.viscosity),
      viscositySigma: Number(config.viscositySigma),
      viscosityBeta: Number(config.viscosityBeta),
      fluidity: Number(config.fluidity),
      supportRadiusScale: Number(config.supportRadiusScale),
      restDensity: Number(config.restDensity),
      stiffness: Number(config.stiffness),
      nearStiffness: Number(config.nearStiffness),
      neighborPairBudget: Number(config.neighborPairBudget),
      surfaceTension: Number(config.surfaceTension),
      collisionBounce: Number(config.collisionBounce),
      maxFluidSpeed: Number(config.maxFluidSpeed),
      substeps: Number(config.substeps)
    };
    model.reset(800, 600, tuning, 42);
    expect(model.pour(400, 50, 64, 20)).toBe(64);
    model.addCircle(200, 300, 18);
    model.addSegment(300, 300, 500, 340, 18);
    expect(model.packPegs().count).toBe(1);
    expect(model.packSegments().count).toBe(1);
  });
  it('preserves maintained settings and pair-budget bounds', () => {
    expect(createWaterTankConfig()).toEqual(WATER_TANK_DEFAULTS);
    expect(() => createWaterTankConfig({
      neighborPairBudget: 100
    })).toThrow('outside its supported range');
  });
  it('creates deterministic randomized preview obstacles without overlaps', () => {
    const first = createWaterTankObstacleLayout(384, 384, 4, 3, 18, 101);
    const repeated = createWaterTankObstacleLayout(384, 384, 4, 3, 18, 101);
    const second = createWaterTankObstacleLayout(384, 384, 4, 3, 18, 202);
    expect(first).toEqual(repeated);
    expect(second).not.toEqual(first);
    expect(waterTankObstacleLayoutSeed(101, 0)).not.toBe(waterTankObstacleLayoutSeed(101, 1));
    expect(first).toHaveLength(7);
    for (let left = 0; left < first.length; left++) {
      for (let right = left + 1; right < first.length; right++) {
        expect(waterTankObstaclesOverlap(first[left]!, first[right]!)).toBe(false);
      }
    }
  });
  it('pours continuously only from a pointer that is still held', () => {
    const hover = { id: 1, buttons: 0 };
    const held = { id: 2, buttons: 1 };
    expect(selectHeldWaterTankPointer([hover, held])).toBe(held);
    expect(selectHeldWaterTankPointer([hover])).toBeUndefined();
  });
  it('makes rest density and stiffness materially affect the fluid response', () => {
    const looseDensity = simulateWaterTank({ restDensity: 0.05 });
    const denseTarget = simulateWaterTank({ restDensity: 4 });
    expect(denseTarget.hash).not.toBe(looseDensity.hash);
    expect(Math.abs(denseTarget.speed - looseDensity.speed)).toBeGreaterThan(0.5);

    const soft = simulateWaterTank({ stiffness: 0 });
    const stiff = simulateWaterTank({ stiffness: 0.16 });
    expect(stiff.hash).not.toBe(soft.hash);
    expect(Math.abs(stiff.speed - soft.speed)).toBeGreaterThan(0.5);
  });
  it('uses neighbor radius and near stiffness in the density-relaxation solve', () => {
    const narrow = simulateWaterTank({ supportRadiusScale: 1 });
    const wide = simulateWaterTank({ supportRadiusScale: 3.8 });
    expect(wide.density).toBeGreaterThan(narrow.density * 5);
    expect(wide.hash).not.toBe(narrow.hash);

    const noNearPressure = simulateWaterTank({ nearStiffness: 0 });
    const strongNearPressure = simulateWaterTank({ nearStiffness: 5 });
    expect(strongNearPressure.hash).not.toBe(noNearPressure.hash);
    expect(Math.abs(strongNearPressure.speed - noNearPressure.speed)).toBeGreaterThan(0.5);
  });
  it('lets fluidity soften particle overlap without softening the tank boundary', () => {
    const separationAfterStep = (fluidity: number): number => {
      const tuning = {
        ...BASE_TUNING,
        fluidity,
        gravity: 0,
        nearStiffness: 0,
        stiffness: 0,
        surfaceTension: 0,
        viscosity: 0,
      };
      const model = new WaterTankModel();
      model.reset(200, 200, tuning, 42);
      model.world.addCircle(96, 100, { radius: 10, radiusNoise: 0 });
      model.world.addCircle(104, 100, { radius: 10, radiusNoise: 0 });
      model.step(1 / 60, 200, 200, tuning);
      return Math.abs((model.world.positions[2] ?? 0) - (model.world.positions[0] ?? 0));
    };
    const solidSeparation = separationAfterStep(0);
    const fluidSeparation = separationAfterStep(1);
    expect(solidSeparation).toBeGreaterThan(18);
    expect(fluidSeparation).toBeLessThan(10);
    expect(fluidSeparation).toBeLessThan(solidSeparation * 0.55);

    const tuning = { ...BASE_TUNING, fluidity: 1, gravity: 2600 };
    const bounded = new WaterTankModel();
    bounded.reset(200, 200, tuning, 42);
    bounded.seedReservoir(200, 200, 240, tuning.particleRadius);
    for (let step = 0; step < 90; step++) bounded.step(1 / 60, 200, 200, tuning);
    for (let index = 0; index < bounded.count; index++) {
      expect(bounded.world.positions[index * 2 + 1] ?? 0)
        .toBeLessThanOrEqual(200 - (bounded.world.radii[index] ?? 0) + 0.0001);
    }

    expect(bounded.world.activeSettings.contactRadiusScale).toBeCloseTo(0.35);
  });
  it('applies the neighbor-pair budget once a dense solve reaches the cap', () => {
    const constrained = simulateWaterTank({
      gravity: 0,
      neighborPairBudget: 8192,
      supportRadiusScale: 3.8,
    }, 800, 10);
    const complete = simulateWaterTank({
      gravity: 0,
      neighborPairBudget: 262144,
      supportRadiusScale: 3.8,
    }, 800, 10);
    expect(complete.hash).not.toBe(constrained.hash);
    expect(Math.abs(complete.density - constrained.density)).toBeGreaterThan(0.1);
  });
  it('applies capacity, radius, gravity, velocity-limit, and substep controls directly', () => {
    const cappedTuning = { ...BASE_TUNING, maxParticles: 512 };
    const capped = new WaterTankModel();
    capped.reset(400, 400, cappedTuning, 42);
    expect(capped.seedReservoir(400, 400, 700, cappedTuning.particleRadius)).toBe(512);

    const direct = new WaterTankModel();
    direct.reset(400, 400, BASE_TUNING, 42);
    direct.world.addCircle(200, 100, { radiusNoise: 0, velocityX: 3000 });
    direct.configure({ ...BASE_TUNING, particleRadius: 10 });
    expect(direct.world.radii[0]).toBeCloseTo(10);
    direct.step(1 / 60, 400, 400, { ...BASE_TUNING, gravity: 0, maxFluidSpeed: 300, particleRadius: 10, substeps: 5 });
    expect(Math.hypot(direct.world.velocities[0] ?? 0, direct.world.velocities[1] ?? 0)).toBeLessThanOrEqual(300.001);
    expect(direct.world.getStats().substepsExecuted).toBe(5);

    const noGravity = new WaterTankModel();
    noGravity.reset(400, 400, { ...BASE_TUNING, gravity: 0 }, 42);
    noGravity.world.addCircle(200, 100, { radiusNoise: 0 });
    noGravity.step(1 / 60, 400, 400, { ...BASE_TUNING, gravity: 0 });
    const highGravity = new WaterTankModel();
    highGravity.reset(400, 400, { ...BASE_TUNING, gravity: 2600 }, 42);
    highGravity.world.addCircle(200, 100, { radiusNoise: 0 });
    highGravity.step(1 / 60, 400, 400, { ...BASE_TUNING, gravity: 2600 });
    expect(highGravity.world.positions[1] ?? 0).toBeGreaterThan(noGravity.world.positions[1] ?? 0);
  });
  it('keeps viscosity, surface settling, and collision bounce behaviorally connected', () => {
    const lowViscosity = simulateWaterTank({ viscosity: 0, viscositySigma: 0, viscosityBeta: 0 });
    const highViscosity = simulateWaterTank({ viscosity: 12, viscositySigma: 3, viscosityBeta: 2 });
    expect(highViscosity.hash).not.toBe(lowViscosity.hash);

    const noSurfaceSettling = simulateWaterTank({ surfaceTension: 0 });
    const strongSurfaceSettling = simulateWaterTank({ surfaceTension: 9000 });
    expect(strongSurfaceSettling.hash).not.toBe(noSurfaceSettling.hash);
    expect(Math.abs(strongSurfaceSettling.speed - noSurfaceSettling.speed)).toBeGreaterThan(0.05);

    const bounce = (collisionBounce: number): number => {
      const tuning = { ...BASE_TUNING, collisionBounce, gravity: 0 };
      const model = new WaterTankModel();
      model.reset(200, 200, tuning, 42);
      model.addCircle(100, 150, 12);
      model.world.addCircle(100, 125, { radiusNoise: 0, velocityY: 900 });
      model.step(1 / 60, 200, 200, tuning);
      return model.world.velocities[1] ?? 0;
    };
    expect(bounce(0.4)).toBeLessThan(bounce(0));
  });
});
