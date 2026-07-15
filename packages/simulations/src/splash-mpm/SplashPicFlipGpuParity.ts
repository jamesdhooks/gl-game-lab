import type { Gpu2DService } from '@hooksjam/gl-game-lab-engine';
import {
  computeSplashPicFlipGridUpdate,
  computeSplashPicFlipParticleToGrid,
  computeSplashPicFlipParticleUpdate,
} from './SplashMpmModel.js';
import { createSplashGpuImpulse } from './SplashPicFlipBackend.js';

export interface SplashPicFlipGpuParityResult {
  readonly supported: boolean;
  readonly seedRoundTrip: boolean;
  readonly particleToGrid: boolean;
  readonly instancedParticleToGrid: boolean;
  readonly gridUpdate: boolean;
  readonly particleUpdate: boolean;
  readonly maxParticleToGridError: number | undefined;
  readonly maxInstancedParticleToGridError: number | undefined;
  readonly maxGridUpdateError: number | undefined;
  readonly maxParticleUpdateError: number | undefined;
  readonly maxParticlePositionError: number | undefined;
  readonly maxParticleVelocityError: number | undefined;
  readonly maxParticleFoamError: number | undefined;
  readonly maxParticleAffineError: number | undefined;
  readonly reasons: readonly string[];
}

export function validateSplashPicFlipGpuParity(gpu2D: Gpu2DService): SplashPicFlipGpuParityResult {
  const validation = gpu2D.validateParticleGridSupport();
  if (!validation.supported) {
    return Object.freeze({
      supported: false,
      seedRoundTrip: false,
      particleToGrid: false,
      instancedParticleToGrid: false,
      gridUpdate: false,
      particleUpdate: false,
      maxParticleToGridError: undefined,
      maxInstancedParticleToGridError: undefined,
      maxGridUpdateError: undefined,
      maxParticleUpdateError: undefined,
      maxParticlePositionError: undefined,
      maxParticleVelocityError: undefined,
      maxParticleFoamError: undefined,
      maxParticleAffineError: undefined,
      reasons: Object.freeze([validation.reason ?? 'GPU particle-grid support is unavailable']),
    });
  }

  const particleGrid = gpu2D.createParticleGridSystem('splash-pic-flip-parity', {
    capacity: 2,
    width: 2,
    height: 1,
    gridWidth: 2,
    gridHeight: 2,
  });
  try {
    const seed = {
      count: 2,
      positions: new Float32Array([4, 4, 10, 11]),
      velocities: new Float32Array([1.5, -2.5, 3.5, -4.5]),
      radii: new Float32Array([5, 6]),
      colorSeeds: new Float32Array([7, 8]),
      foam: new Float32Array([0.25, 0.75]),
      affine: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
    };
    particleGrid.uploadSeed(seed);
    const snapshot = particleGrid.debugReadback();
    const seedRoundTrip = snapshot.count === 2
      && nearly(snapshot.positions[0], 4) && nearly(snapshot.positions[3], 11)
      && nearly(snapshot.velocities[0], 1.5) && nearly(snapshot.velocities[3], -4.5)
      && nearly(snapshot.radii[1], 6)
      && nearly(snapshot.colorSeeds[1], 8)
      && nearly(snapshot.foam[0], 0.25) && nearly(snapshot.foam[1], 0.75)
      && nearly(snapshot.affine[7], 8);
    const cell = 8;
    const radius = 4;
    const gpuTransfer = particleGrid.debugComputeParticleToGrid({ cell, radius });
    const cpuTransfer = computeSplashPicFlipParticleToGrid({
      count: seed.count,
      positions: seed.positions,
      velocities: seed.velocities,
      affine: seed.affine,
      columns: particleGrid.gridWidth,
      rows: particleGrid.gridHeight,
      cell,
      radius,
    });
    const maxParticleToGridError = Math.max(
      maxAbsDifference(gpuTransfer.mass, cpuTransfer.mass),
      maxAbsDifference(gpuTransfer.momentumX, cpuTransfer.momentumX),
      maxAbsDifference(gpuTransfer.momentumY, cpuTransfer.momentumY),
    );
    const gpuInstancedTransfer = particleGrid.debugComputeParticleToGrid({ cell, radius, particleToGridMode: 'instanced-splat' });
    const maxInstancedParticleToGridError = Math.max(
      maxAbsDifference(gpuInstancedTransfer.mass, cpuTransfer.mass),
      maxAbsDifference(gpuInstancedTransfer.momentumX, cpuTransfer.momentumX),
      maxAbsDifference(gpuInstancedTransfer.momentumY, cpuTransfer.momentumY),
    );
    const updateOptions = {
      cell,
      radius,
      dt: 1 / 60,
      stiffness: 86,
      restDensity: 3.2,
      separation: 0.7,
      viscosity: 0.18,
      gravity: 920,
    };
    const gpuUpdate = particleGrid.debugComputeGridUpdate(updateOptions);
    const cpuUpdate = computeSplashPicFlipGridUpdate({
      columns: particleGrid.gridWidth,
      rows: particleGrid.gridHeight,
      support: Math.max(0.65, Math.min(8, radius / cell)),
      mass: cpuTransfer.mass,
      momentumX: cpuTransfer.momentumX,
      momentumY: cpuTransfer.momentumY,
      ...updateOptions,
    });
    const maxGridUpdateError = Math.max(
      maxAbsDifference(gpuUpdate.velocityX, cpuUpdate.velocityX),
      maxAbsDifference(gpuUpdate.velocityY, cpuUpdate.velocityY),
      maxAbsDifference(gpuUpdate.previousVelocityX, cpuUpdate.previousVelocityX),
      maxAbsDifference(gpuUpdate.previousVelocityY, cpuUpdate.previousVelocityY),
      maxAbsDifference(gpuUpdate.pressure, cpuUpdate.pressure),
    );
    const diagnosticObstacles = [
      Object.freeze({ kind: 'circle' as const, ax: 15, ay: 11, bx: 15, by: 11, radius: 5 }),
      Object.freeze({ kind: 'segment' as const, ax: 2, ay: 24, bx: 22, by: 24, radius: 4 }),
    ];
    const cpuParticlePositions = seed.positions.slice();
    const cpuParticleVelocities = seed.velocities.slice();
    const cpuParticleFoam = seed.foam.slice();
    const diagnosticImpulse = createSplashGpuImpulse(10, 8, 7, 1.5, 2, 1);
    applyPackedImpulse(cpuParticlePositions, cpuParticleVelocities, cpuParticleFoam, seed.count, diagnosticImpulse);
    const cpuParticle = computeSplashPicFlipParticleUpdate({
      count: seed.count,
      positions: cpuParticlePositions,
      velocities: cpuParticleVelocities,
      radii: seed.radii,
      foam: cpuParticleFoam,
      affine: seed.affine.slice(),
      obstacles: diagnosticObstacles,
      columns: particleGrid.gridWidth,
      rows: particleGrid.gridHeight,
      cell,
      mass: cpuTransfer.mass,
      velocityX: cpuUpdate.velocityX,
      velocityY: cpuUpdate.velocityY,
      previousVelocityX: cpuUpdate.previousVelocityX,
      previousVelocityY: cpuUpdate.previousVelocityY,
      dt: updateOptions.dt,
      width: 64,
      height: 64,
      flipness: 0.88,
      foamFrame: 0,
    });
    const gpuParticle = particleGrid.debugComputeParticleUpdate({
      ...updateOptions,
      width: 64,
      height: 64,
      flipness: 0.88,
      foamFrame: 0,
      impulses: diagnosticImpulse,
      circleObstacles: new Float32Array([15, 11, 5, 0]),
      segmentObstacles: new Float32Array([2, 24, 22, 24, 4, 0, 0, 0]),
    });
    const maxParticlePositionError = maxAbsDifference(gpuParticle.positions, cpuParticle.positions);
    const maxParticleVelocityError = maxAbsDifference(gpuParticle.velocities, cpuParticle.velocities);
    const maxParticleFoamError = maxAbsDifference(gpuParticle.foam, cpuParticle.foam);
    const maxParticleAffineError = maxAbsDifference(gpuParticle.affine, cpuParticle.affine);
    const maxParticleUpdateError = Math.max(maxParticlePositionError, maxParticleVelocityError, maxParticleFoamError, maxParticleAffineError);
    const particleToGrid = Number.isFinite(maxParticleToGridError) && maxParticleToGridError <= 0.002;
    const instancedParticleToGrid = Number.isFinite(maxInstancedParticleToGridError) && maxInstancedParticleToGridError <= 0.002;
    const gridUpdate = Number.isFinite(maxGridUpdateError) && maxGridUpdateError <= 0.004;
    const particleUpdate = Number.isFinite(maxParticleUpdateError) && maxParticleUpdateError <= 0.006;
    const reasons: string[] = [];
    if (!seedRoundTrip) reasons.push('GPU particle seed round trip failed');
    if (!particleToGrid) reasons.push(`GPU particle-to-grid parity failed: ${maxParticleToGridError}`);
    if (!instancedParticleToGrid) reasons.push(`GPU instanced particle-to-grid parity failed: ${maxInstancedParticleToGridError}`);
    if (!gridUpdate) reasons.push(`GPU grid update parity failed: ${maxGridUpdateError}`);
    if (!particleUpdate) reasons.push(`GPU particle update parity failed: ${maxParticleUpdateError}`);
    return Object.freeze({
      supported: true,
      seedRoundTrip,
      particleToGrid,
      instancedParticleToGrid,
      gridUpdate,
      particleUpdate,
      maxParticleToGridError,
      maxInstancedParticleToGridError,
      maxGridUpdateError,
      maxParticleUpdateError,
      maxParticlePositionError,
      maxParticleVelocityError,
      maxParticleFoamError,
      maxParticleAffineError,
      reasons: Object.freeze(reasons),
    });
  } catch (error) {
    return Object.freeze({
      supported: false,
      seedRoundTrip: false,
      particleToGrid: false,
      instancedParticleToGrid: false,
      gridUpdate: false,
      particleUpdate: false,
      maxParticleToGridError: undefined,
      maxInstancedParticleToGridError: undefined,
      maxGridUpdateError: undefined,
      maxParticleUpdateError: undefined,
      maxParticlePositionError: undefined,
      maxParticleVelocityError: undefined,
      maxParticleFoamError: undefined,
      maxParticleAffineError: undefined,
      reasons: Object.freeze([error instanceof Error ? error.message : String(error)]),
    });
  } finally {
    particleGrid.dispose();
  }
}

function nearly(value: number | undefined, expected: number): boolean {
  return Math.abs((value ?? Number.NaN) - expected) <= 0.001;
}

function maxAbsDifference(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let index = 0; index < a.length; index += 1) maximum = Math.max(maximum, Math.abs((a[index] ?? 0) - (b[index] ?? 0)));
  return maximum;
}

function applyPackedImpulse(
  positions: Float32Array,
  velocities: Float32Array,
  foam: Float32Array,
  count: number,
  impulse: Float32Array,
): void {
  const startX = impulse[0] ?? 0;
  const startY = impulse[1] ?? 0;
  const x = impulse[2] ?? 0;
  const y = impulse[3] ?? 0;
  const radius = impulse[4] ?? 0;
  const force = impulse[5] ?? 0;
  const dx = impulse[6] ?? 0;
  const dy = impulse[7] ?? 0;
  const radiusSquared = radius * radius;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 2;
    const [distance, nearestX, nearestY] = distanceToSegment(
      positions[offset] ?? 0,
      positions[offset + 1] ?? 0,
      startX,
      startY,
      x,
      y,
    );
    if (distance > radius) continue;
    const falloff = (1 - distance * distance / radiusSquared) ** 2;
    const offsetX = (positions[offset] ?? 0) - nearestX;
    const offsetY = (positions[offset + 1] ?? 0) - nearestY;
    const inverseDistance = 1 / Math.max(1, Math.hypot(offsetX, offsetY));
    velocities[offset] = (velocities[offset] ?? 0) + (dx * force * 4.8 - offsetY * inverseDistance * force * 12) * falloff;
    velocities[offset + 1] = (velocities[offset + 1] ?? 0) + (dy * force * 4.8 + offsetX * inverseDistance * force * 12) * falloff;
    foam[index] = Math.min(1, (foam[index] ?? 0) + falloff * 0.34);
  }
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): readonly [number, number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0.0001 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 1;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return [Math.hypot(px - x, py - y), x, y];
}
