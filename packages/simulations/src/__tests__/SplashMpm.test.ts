import { describe, expect, it, vi } from 'vitest';
import type { Gpu2DService, GpuFieldSystem2DOptions, GpuParticleGridSystem2DOptions, GpuParticleSystem2DOptions } from '@hooksjam/gl-game-lab-engine';
import { computeSplashPicFlipGridUpdate, computeSplashPicFlipParticleToGrid, computeSplashPicFlipParticleUpdate, createSplashMpmConfig, SPLASH_MPM_DEFAULTS, SPLASH_MPM_SETTINGS, splashMpmDefinition, SPLASH_MPM_STYLE_MANIFEST, SplashMpmModel, validateSplashPicFlipGpuParity } from '../index.js';
import { resolveSplashPicFlipBackend, splashObstaclesToGpuArrays, splashSnapshotToGpuParticleGridSeed, splashSnapshotToGpuParticleGridStep } from '../splash-mpm/SplashPicFlipBackend.js';
import { resolveSplashSurfaceParameters, selectHeldSplashPointer } from '../splash-mpm/SplashMpmPlugin.js';
import { compareSplashPicFlipMetrics, type SplashMpmTuning } from '../splash-mpm/SplashMpmModel.js';

const BASE_TUNING: SplashMpmTuning = Object.freeze({
  maxParticles: 2048,
  resolution: 64,
  stiffness: 86,
  restDensity: 3.2,
  separation: 0.7,
  viscosity: 0.18,
  flipness: 0.88,
  gravity: 920,
  radius: 4.2,
});

function simulatedHash(overrides: Partial<SplashMpmTuning>): string {
  const tuning = { ...BASE_TUNING, ...overrides };
  const model = new SplashMpmModel();
  model.reset(320, 240, tuning);
  model.seed(320, 240, tuning);
  for (let step = 0; step < 6; step++) model.step(1 / 60, 320, 240, tuning);
  return model.world.stateHash();
}

function sum(values: Float32Array): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function sumAbs(values: Float32Array): number {
  let total = 0;
  for (const value of values) total += Math.abs(value);
  return total;
}

function maxDiff(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  let maximum = 0;
  for (let index = 0; index < a.length; index += 1) maximum = Math.max(maximum, Math.abs((a[index] ?? 0) - (b[index] ?? 0)));
  return maximum;
}

describe('Splash MPM', () => {
  it('retains modes, styles, and attribution', () => {
    expect(splashMpmDefinition.modes?.map(x => x.id)).toEqual([
      'splash',
      'pour',
      'build'
    ]);
    expect(SPLASH_MPM_STYLE_MANIFEST.styles).toHaveLength(10);
    expect(splashMpmDefinition.attributions?.[0]?.label).toBe('Splash');
  });
  it('runs a particle-grid fluid step', () => {
    const model = new SplashMpmModel(), t = BASE_TUNING;
    model.reset(800, 600, t);
    model.seed(800, 600, t);
    const before = model.count;
    model.pour(400, 80, 12, 20);
    model.splash(400, 300, 80, 17, 200, 0);
    model.step(1 / 60, 800, 600, t);
    expect(model.count).toBeGreaterThanOrEqual(before);
    expect(model.count).toBeLessThanOrEqual(t.maxParticles);
    expect(Number.isFinite(model.world.positions[0])).toBe(true);
  });
  it('does not reconfigure the particle world when capacity and radius are unchanged', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    const configure = vi.spyOn(model.world, 'configure');
    model.configure(BASE_TUNING);
    model.step(1 / 60, 320, 240, BASE_TUNING);
    expect(configure).not.toHaveBeenCalled();
    model.configure({ ...BASE_TUNING, radius: BASE_TUNING.radius + 1 });
    expect(configure).toHaveBeenCalledTimes(1);
  });
  it('round-trips deterministic state snapshots for CPU fallback and parity comparisons', () => {
    const original = new SplashMpmModel();
    original.reset(320, 240, BASE_TUNING);
    original.seed(320, 240, BASE_TUNING);
    original.addCircle(160, 150, 14);
    original.addSegment(80, 190, 220, 170, 9);
    original.splash(160, 120, 48, 12, 18, -5);
    for (let step = 0; step < 4; step += 1) original.step(1 / 60, 320, 240, BASE_TUNING);

    const restored = new SplashMpmModel();
    restored.restore(original.snapshot(), 320, 240, BASE_TUNING);
    const delta = compareSplashPicFlipMetrics(original.metrics(), restored.metrics());
    expect(delta.countEqual).toBe(true);
    expect(delta.finite).toBe(true);
    expect(delta.centerDistance).toBeLessThan(0.0001);
    expect(delta.momentumRelativeError).toBeLessThan(0.0001);
    expect(delta.kineticEnergyRelativeError).toBeLessThan(0.0001);
    expect(delta.foamCoverageError).toBe(0);
    expect(restored.obstacles).toEqual(original.obstacles);
  });
  it('converts CPU snapshots into GPU particle-grid seeds without changing particle data', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    model.seed(320, 240, BASE_TUNING);
    model.step(1 / 60, 320, 240, BASE_TUNING);
    const snapshot = model.snapshot();
    const seed = splashSnapshotToGpuParticleGridSeed(snapshot);
    expect(seed.count).toBe(snapshot.count);
    expect(seed.positions).toEqual(snapshot.positions);
    expect(seed.velocities).toEqual(snapshot.velocities);
    expect(seed.radii).toEqual(snapshot.radii);
    expect(seed.colorSeeds).toEqual(snapshot.colorSeeds);
    expect(seed.foam).toEqual(snapshot.foam);
    expect(seed.affine).toEqual(snapshot.affine);
    expect(seed.positions).not.toBe(snapshot.positions);
  });
  it('converts CPU snapshots and obstacles into GPU particle-grid step options', () => {
    const model = new SplashMpmModel();
    const t = BASE_TUNING;
    model.reset(128, 96, t);
    model.seed(128, 96, t);
    model.addCircle(20, 30, 6);
    model.addSegment(30, 40, 70, 60, 5);
    model.step(1 / 60, 128, 96, t);
    const snapshot = model.snapshot();
    const obstacles = splashObstaclesToGpuArrays(snapshot.obstacles);
    expect(Array.from(obstacles.circleObstacles)).toEqual([20, 30, 6, 0]);
    expect(Array.from(obstacles.segmentObstacles)).toEqual([30, 40, 70, 60, 5, 0, 0, 0]);

    const options = splashSnapshotToGpuParticleGridStep(snapshot, t, 1 / 60, 128, 96, 7);
    expect(options).toMatchObject({
      cell: snapshot.grid.cell,
      radius: t.radius,
      stiffness: t.stiffness,
      restDensity: t.restDensity,
      separation: t.separation,
      viscosity: t.viscosity,
      gravity: t.gravity,
      width: 128,
      height: 96,
      flipness: t.flipness,
      foamFrame: 7,
    });
    expect(options.circleObstacles).toEqual(obstacles.circleObstacles);
    expect(options.segmentObstacles).toEqual(obstacles.segmentObstacles);
  });
  it('computes the reusable CPU particle-to-grid transfer without per-frame allocations', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    model.seed(320, 240, BASE_TUNING);
    const snapshot = model.snapshot();
    const cellCount = snapshot.grid.columns * snapshot.grid.rows;
    const mass = new Float32Array(cellCount);
    const momentumX = new Float32Array(cellCount);
    const momentumY = new Float32Array(cellCount);
    const transfer = computeSplashPicFlipParticleToGrid({
      count: snapshot.count,
      positions: snapshot.positions,
      velocities: snapshot.velocities,
      affine: snapshot.affine,
      columns: snapshot.grid.columns,
      rows: snapshot.grid.rows,
      cell: snapshot.grid.cell,
      radius: BASE_TUNING.radius,
      output: { mass, momentumX, momentumY },
    });
    expect(transfer.mass).toBe(mass);
    expect(transfer.momentumX).toBe(momentumX);
    expect(transfer.momentumY).toBe(momentumY);
    expect(transfer.support).toBeGreaterThan(0);
    expect(sum(transfer.mass)).toBeGreaterThan(snapshot.count);
    expect(sumAbs(transfer.momentumX)).toBeGreaterThan(0);
    expect(sumAbs(transfer.momentumY)).toBeGreaterThan(0);
  });
  it('computes the reusable CPU grid update as the model grid reference', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    model.seed(320, 240, BASE_TUNING);
    const before = model.snapshot();
    const cell = 320 / Math.max(24, Math.floor(BASE_TUNING.resolution));
    const columns = Math.max(8, Math.ceil(320 / cell));
    const rows = Math.max(8, Math.ceil(240 / cell));
    const cellCount = columns * rows;
    const mass = new Float32Array(cellCount);
    const momentumX = new Float32Array(cellCount);
    const momentumY = new Float32Array(cellCount);
    const transfer = computeSplashPicFlipParticleToGrid({
      count: before.count,
      positions: before.positions,
      velocities: before.velocities,
      affine: before.affine,
      columns,
      rows,
      cell,
      radius: BASE_TUNING.radius,
      output: { mass, momentumX, momentumY },
    });
    const velocityX = new Float32Array(cellCount);
    const velocityY = new Float32Array(cellCount);
    const previousVelocityX = new Float32Array(cellCount);
    const previousVelocityY = new Float32Array(cellCount);
    const pressure = new Float32Array(cellCount);
    const scratchVelocityX = new Float32Array(cellCount);
    const scratchVelocityY = new Float32Array(cellCount);
    const grid = computeSplashPicFlipGridUpdate({
      columns,
      rows,
      cell,
      support: transfer.support,
      mass,
      momentumX,
      momentumY,
      dt: 1 / 60,
      stiffness: BASE_TUNING.stiffness,
      restDensity: BASE_TUNING.restDensity,
      separation: BASE_TUNING.separation,
      viscosity: BASE_TUNING.viscosity,
      gravity: BASE_TUNING.gravity,
      output: {
        velocityX,
        velocityY,
        previousVelocityX,
        previousVelocityY,
        pressure,
        scratchVelocityX,
        scratchVelocityY,
      },
    });
    expect(grid.velocityX).toBe(velocityX);
    expect(grid.velocityY).toBe(velocityY);
    expect(grid.previousVelocityX).toBe(previousVelocityX);
    expect(grid.previousVelocityY).toBe(previousVelocityY);
    expect(grid.pressure).toBe(pressure);
    model.step(1 / 60, 320, 240, BASE_TUNING);
    const after = model.snapshot();
    expect(maxDiff(after.grid.mass, mass)).toBeLessThan(0.0001);
    expect(maxDiff(after.grid.velocityX, velocityX)).toBeLessThan(0.0001);
    expect(maxDiff(after.grid.velocityY, velocityY)).toBeLessThan(0.0001);
    expect(maxDiff(after.grid.previousVelocityX, previousVelocityX)).toBeLessThan(0.0001);
    expect(maxDiff(after.grid.previousVelocityY, previousVelocityY)).toBeLessThan(0.0001);
    expect(maxDiff(after.grid.pressure, pressure)).toBeLessThan(0.0001);
  });
  it('computes the reusable CPU particle update as the model particle reference', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    model.seed(320, 240, BASE_TUNING);
    model.addCircle(180, 150, 12);
    model.addSegment(70, 190, 240, 170, 8);
    const before = model.snapshot();
    const cell = 320 / Math.max(24, Math.floor(BASE_TUNING.resolution));
    const columns = Math.max(8, Math.ceil(320 / cell));
    const rows = Math.max(8, Math.ceil(240 / cell));
    const cellCount = columns * rows;
    const mass = new Float32Array(cellCount);
    const momentumX = new Float32Array(cellCount);
    const momentumY = new Float32Array(cellCount);
    const transfer = computeSplashPicFlipParticleToGrid({
      count: before.count,
      positions: before.positions,
      velocities: before.velocities,
      affine: before.affine,
      columns,
      rows,
      cell,
      radius: BASE_TUNING.radius,
      output: { mass, momentumX, momentumY },
    });
    const velocityX = new Float32Array(cellCount);
    const velocityY = new Float32Array(cellCount);
    const previousVelocityX = new Float32Array(cellCount);
    const previousVelocityY = new Float32Array(cellCount);
    const pressure = new Float32Array(cellCount);
    const scratchVelocityX = new Float32Array(cellCount);
    const scratchVelocityY = new Float32Array(cellCount);
    computeSplashPicFlipGridUpdate({
      columns,
      rows,
      cell,
      support: transfer.support,
      mass,
      momentumX,
      momentumY,
      dt: 1 / 60,
      stiffness: BASE_TUNING.stiffness,
      restDensity: BASE_TUNING.restDensity,
      separation: BASE_TUNING.separation,
      viscosity: BASE_TUNING.viscosity,
      gravity: BASE_TUNING.gravity,
      output: {
        velocityX,
        velocityY,
        previousVelocityX,
        previousVelocityY,
        pressure,
        scratchVelocityX,
        scratchVelocityY,
      },
    });
    const positions = before.positions.slice();
    const velocities = before.velocities.slice();
    const foam = before.foam.slice();
    const affine = before.affine.slice();
    const update = computeSplashPicFlipParticleUpdate({
      count: before.count,
      positions,
      velocities,
      radii: before.radii,
      foam,
      affine,
      obstacles: before.obstacles,
      columns,
      rows,
      cell,
      mass,
      velocityX,
      velocityY,
      previousVelocityX,
      previousVelocityY,
      dt: 1 / 60,
      width: 320,
      height: 240,
      flipness: BASE_TUNING.flipness,
      foamFrame: 0,
    });
    expect(update.positions).toBe(positions);
    expect(update.velocities).toBe(velocities);
    expect(update.foam).toBe(foam);
    expect(update.affine).toBe(affine);
    model.step(1 / 60, 320, 240, BASE_TUNING);
    const after = model.snapshot();
    expect(maxDiff(after.positions, positions)).toBeLessThan(0.0001);
    expect(maxDiff(after.velocities, velocities)).toBeLessThan(0.0001);
    expect(maxDiff(after.foam, foam)).toBeLessThan(0.0001);
    expect(maxDiff(after.affine, affine)).toBeLessThan(0.0001);
  });
  it('reports divergent trajectories through parity metrics', () => {
    const reference = new SplashMpmModel();
    reference.reset(320, 240, BASE_TUNING);
    reference.pour(120, 80, 12, 18, 2, 4);
    const candidate = new SplashMpmModel();
    candidate.restore(reference.snapshot(), 320, 240, BASE_TUNING);
    candidate.splash(120, 80, 60, 20, 30, 0);
    const delta = compareSplashPicFlipMetrics(reference.metrics(), candidate.metrics());
    expect(delta.countEqual).toBe(true);
    expect(delta.momentumRelativeError).toBeGreaterThan(0.1);
  });
  it('keeps GPU PIC/FLIP behind capability, implementation, and parity gates', () => {
    const eligible = {
      particleGrid: {
        supported: true,
        floatRenderTargets: true,
        floatBlend: true,
        multipleRenderTargets: true,
        vertexTextureFetch: true,
        maxDrawBuffers: 4,
        maxColorAttachments: 4,
        maxVertexTextureImageUnits: 8,
      },
    };
    expect(resolveSplashPicFlipBackend(eligible).backend).toBe('cpu');
    expect(resolveSplashPicFlipBackend(eligible, { gpuImplemented: true }).backend).toBe('cpu');
    expect(resolveSplashPicFlipBackend(eligible, { gpuImplemented: true, parityValidated: true }).backend).toBe('gpu');
    expect(resolveSplashPicFlipBackend({
      particleGrid: {
        ...eligible.particleGrid,
        supported: false,
        floatBlend: false,
      },
    }, { request: 'gpu', gpuImplemented: true, parityValidated: true })).toMatchObject({
      backend: 'cpu',
      gpuEligible: false,
    });
  });
  it('reports GPU parity validation as unsupported when particle-grid support is unavailable', () => {
    const unsupportedGpu: Gpu2DService = {
      capabilities: {
        particleGrid: {
          supported: false,
          floatRenderTargets: false,
          floatBlend: false,
          multipleRenderTargets: false,
          vertexTextureFetch: false,
          maxDrawBuffers: 0,
          maxColorAttachments: 0,
          maxVertexTextureImageUnits: 0,
        },
      },
      validateParticleGridSupport: () => ({ supported: false, reason: 'test unavailable' }),
      createFieldSystem: (_id: string, _options: GpuFieldSystem2DOptions) => { throw new Error('unexpected field system creation'); },
      createParticleSystem: (_id: string, _options: GpuParticleSystem2DOptions) => { throw new Error('unexpected particle system creation'); },
      createParticleGridSystem: (_id: string, _options: GpuParticleGridSystem2DOptions) => { throw new Error('unexpected particle-grid system creation'); },
      submit: () => undefined,
    };
    const result = validateSplashPicFlipGpuParity(unsupportedGpu);
    expect(result.supported).toBe(false);
    expect(result.seedRoundTrip).toBe(false);
    expect(result.particleToGrid).toBe(false);
    expect(result.gridUpdate).toBe(false);
    expect(result.particleUpdate).toBe(false);
    expect(result.reasons).toEqual(['test unavailable']);
  });
  it('validates maintained defaults', () => {
    expect(SPLASH_MPM_SETTINGS.length).toBeGreaterThan(25);
    expect(createSplashMpmConfig()).toEqual(SPLASH_MPM_DEFAULTS);
    expect(() => createSplashMpmConfig({
      resolution: 8
    })).toThrow();
  });
  it('restores legacy initial motion, foam, and segment-based splash input', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    model.seed(320, 240, BASE_TUNING);
    expect(model.world.velocities[0]).toBeGreaterThanOrEqual(28);
    expect(model.world.velocities[0]).toBeLessThanOrEqual(62);
    expect(model.world.velocities[1]).toBe(8);
    expect(model.foam[0]).toBeGreaterThanOrEqual(0.08);
    expect(model.foam[0]).toBeLessThanOrEqual(0.24);

    model.reset(320, 240, BASE_TUNING);
    model.world.addCircle(100, 105, { radius: BASE_TUNING.radius, radiusNoise: 0 });
    model.world.addCircle(220, 180, { radius: BASE_TUNING.radius, radiusNoise: 0 });
    model.splash(120, 100, 30, 17, 40, 0);
    expect(Math.hypot(model.world.velocities[0] ?? 0, model.world.velocities[1] ?? 0)).toBeGreaterThan(0);
    expect(model.foam[0]).toBeGreaterThan(0);
    expect(model.world.velocities[2]).toBe(0);
    expect(model.world.velocities[3]).toBe(0);
  });
  it('uses pointer motion and pour radius when emitting a foamy jet', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    expect(model.pour(120, 40, 24, 34, 8, 4)).toBe(24);
    expect(model.world.velocities[0]).toBeGreaterThan(100);
    expect(model.world.velocities[1]).toBeGreaterThan(40);
    expect(model.foam[0]).toBeGreaterThanOrEqual(0.72);
    const xs = Array.from({ length: model.count }, (_, index) => model.world.positions[index * 2] ?? 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(BASE_TUNING.radius);
  });
  it('makes every particle-grid physics control alter deterministic behavior', () => {
    const variants: readonly [keyof SplashMpmTuning, number, number][] = [
      ['resolution', 32, 256],
      ['stiffness', 18, 180],
      ['restDensity', 1.8, 8],
      ['separation', 0, 10],
      ['viscosity', 0, 0.7],
      ['flipness', 0, 1],
      ['gravity', 80, 1900],
      ['radius', 2, 16],
    ];
    for (const [key, low, high] of variants) {
      expect(simulatedHash({ [key]: low })).not.toBe(simulatedHash({ [key]: high }));
    }
    const capped = new SplashMpmModel();
    capped.reset(320, 240, { ...BASE_TUNING, maxParticles: 512 });
    capped.seed(320, 240, { ...BASE_TUNING, maxParticles: 512 });
    expect(capped.count).toBe(512);
  });
  it('maps every visible surface control to the renderer parameters', () => {
    const baseline = resolveSplashSurfaceParameters(createSplashMpmConfig());
    const variants: Readonly<Record<string, number>> = {
      surfaceSmoothing: 0,
      enhancedQuality: 2,
      enhancedSplatSize: 0.65,
      enhancedDepth: 0,
      enhancedEdge: 0,
      liquidFieldScale: 1,
      liquidSurfaceThreshold: 0.04,
      liquidEdgeTightness: 0.15,
      liquidEdgeSoftness: 0,
      liquidSplatDensity: 0.45,
      liquidParticleRadius: 0.7,
      liquidRefraction: 0,
      liquidGloss: 0,
      liquidFoamStrength: 0,
      liquidBloomStrength: 0,
      liquidHeatShimmer: 0,
      liquidDepthDiffusion: 0,
      opacity: 0.18,
    };
    for (const [key, value] of Object.entries(variants)) {
      expect(resolveSplashSurfaceParameters(createSplashMpmConfig({ [key]: value }))).not.toEqual(baseline);
    }
  });
  it('only treats held pointers as active pour input', () => {
    const hover = { id: 1, buttons: 0 };
    const held = { id: 2, buttons: 1 };
    expect(selectHeldSplashPointer([hover, held])).toBe(held);
    expect(selectHeldSplashPointer([hover])).toBeUndefined();
  });
});
