import type { Gpu2DCapabilities, GpuParticleGridEmit2D, GpuParticleGridObstacles2D, GpuParticleGridParticleUpdateOptions2D, GpuParticleGridSeed2D } from '@hooksjam/gl-game-lab-engine';
import type { WaterObstacle } from '../water-tank/WaterTankModel.js';
import type { SplashMpmTuning, SplashPicFlipStateSnapshot } from './SplashMpmModel.js';

export type SplashPicFlipBackendKind = 'cpu' | 'gpu';
export type SplashPicFlipBackendRequest = 'auto' | 'cpu' | 'gpu';

export interface SplashPicFlipBackendDecision {
  readonly backend: SplashPicFlipBackendKind;
  readonly gpuEligible: boolean;
  readonly gpuImplemented: boolean;
  readonly reasons: readonly string[];
}

export interface SplashPicFlipBackendOptions {
  readonly request?: SplashPicFlipBackendRequest;
  readonly gpuImplemented?: boolean;
  readonly parityValidated?: boolean;
}

export function resolveSplashPicFlipBackend(
  capabilities: Gpu2DCapabilities | undefined,
  options: SplashPicFlipBackendOptions = {},
): SplashPicFlipBackendDecision {
  const request = options.request ?? 'auto';
  const particleGrid = capabilities?.particleGrid;
  const reasons: string[] = [];

  if (request === 'cpu') {
    return Object.freeze({
      backend: 'cpu',
      gpuEligible: particleGrid?.supported ?? false,
      gpuImplemented: options.gpuImplemented === true,
      reasons: Object.freeze(['CPU backend requested']),
    });
  }

  if (!particleGrid?.floatRenderTargets) reasons.push('EXT_color_buffer_float is unavailable');
  if (!particleGrid?.floatBlend) reasons.push('EXT_float_blend is unavailable');
  if (!particleGrid?.multipleRenderTargets) reasons.push('multiple render targets are unavailable');
  if (!particleGrid?.vertexTextureFetch) reasons.push('vertex texture fetch is unavailable');

  const gpuEligible = reasons.length === 0;
  if (!gpuEligible) {
    return Object.freeze({
      backend: 'cpu',
      gpuEligible,
      gpuImplemented: options.gpuImplemented === true,
      reasons: Object.freeze(reasons),
    });
  }

  if (options.gpuImplemented !== true) reasons.push('GPU PIC/FLIP backend is not implemented');
  if (options.parityValidated !== true) reasons.push('GPU PIC/FLIP parity has not been validated');

  const backend = reasons.length === 0 ? 'gpu' : 'cpu';
  if (request === 'gpu' && backend === 'cpu') reasons.unshift('GPU backend requested but cannot be selected safely');

  return Object.freeze({
    backend,
    gpuEligible,
    gpuImplemented: options.gpuImplemented === true,
    reasons: Object.freeze(reasons),
  });
}

export function splashSnapshotToGpuParticleGridSeed(snapshot: SplashPicFlipStateSnapshot): GpuParticleGridSeed2D {
  return Object.freeze({
    count: snapshot.count,
    positions: snapshot.positions.slice(),
    velocities: snapshot.velocities.slice(),
    radii: snapshot.radii.slice(),
    colorSeeds: snapshot.colorSeeds.slice(),
    foam: snapshot.foam.slice(),
    affine: snapshot.affine.slice(),
  });
}

export function splashObstaclesToGpuArrays(obstacles: readonly WaterObstacle[]): {
  readonly circleObstacles: Float32Array;
  readonly segmentObstacles: Float32Array;
} {
  const circles = obstacles.filter(obstacle => obstacle.kind === 'circle');
  const segments = obstacles.filter(obstacle => obstacle.kind === 'segment');
  const circleObstacles = new Float32Array(circles.length * 4);
  const segmentObstacles = new Float32Array(segments.length * 8);
  circles.forEach((obstacle, index) => {
    circleObstacles.set([obstacle.ax, obstacle.ay, obstacle.radius, 0], index * 4);
  });
  segments.forEach((obstacle, index) => {
    segmentObstacles.set([obstacle.ax, obstacle.ay, obstacle.bx, obstacle.by, obstacle.radius, 0, 0, 0], index * 8);
  });
  return Object.freeze({ circleObstacles, segmentObstacles });
}

export function createSplashGpuObstacles(obstacles: readonly WaterObstacle[], revision: number): GpuParticleGridObstacles2D {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Splash GPU obstacle revision must be a non-negative integer');
  const packed = splashObstaclesToGpuArrays(obstacles);
  return Object.freeze({
    revision,
    circleObstacles: packed.circleObstacles,
    segmentObstacles: packed.segmentObstacles,
  });
}

export function splashSnapshotToGpuParticleGridStep(
  snapshot: SplashPicFlipStateSnapshot,
  tuning: SplashMpmTuning,
  dt: number,
  width: number,
  height: number,
  foamFrame: number,
): GpuParticleGridParticleUpdateOptions2D {
  const obstacles = splashObstaclesToGpuArrays(snapshot.obstacles);
  return Object.freeze({
    cell: snapshot.grid.cell,
    radius: tuning.radius,
    dt,
    stiffness: tuning.stiffness,
    restDensity: tuning.restDensity,
    separation: tuning.separation,
    viscosity: tuning.viscosity,
    gravity: tuning.gravity,
    width,
    height,
    flipness: tuning.flipness,
    foamFrame,
    circleObstacles: obstacles.circleObstacles,
    segmentObstacles: obstacles.segmentObstacles,
  });
}

export function createSplashGpuImpulse(
  x: number,
  y: number,
  radius: number,
  force: number,
  dx: number,
  dy: number,
): Float32Array {
  return new Float32Array([x - dx, y - dy, x, y, radius, force, dx, dy]);
}

export function createSplashGpuPourBatch(
  activeCount: number,
  particleRadius: number,
  x: number,
  y: number,
  count: number,
  radius: number,
  dx = 0,
  dy = 0,
): GpuParticleGridEmit2D {
  const safeCount = Math.max(0, Math.floor(count));
  const positions = new Float32Array(safeCount * 2);
  const velocities = new Float32Array(safeCount * 2);
  const radii = new Float32Array(safeCount);
  const colorSeeds = new Float32Array(safeCount);
  const foam = new Float32Array(safeCount);
  const affine = new Float32Array(safeCount * 4);
  const speed = Math.hypot(dx, dy);
  const inverseSpeed = speed > 0.001 ? 1 / speed : 0;
  const velocityX = dx * 16;
  const velocityY = dy * 16;
  const spread = Math.max(particleRadius * 0.25, Math.min(radius, Math.max(particleRadius * 1.6, speed * 0.035)));
  for (let index = 0; index < safeCount; index += 1) {
    const authoredCountBeforeAdd = activeCount + index;
    const angle = splashHash(authoredCountBeforeAdd + index * 19) * Math.PI * 2;
    const distance = index === 0 ? 0 : Math.sqrt(splashHash(authoredCountBeforeAdd + index * 37 + 17)) * spread;
    const jitter = (splashHash(authoredCountBeforeAdd + index * 53 + 29) - 0.5) * 22;
    const vectorOffset = index * 2;
    positions[vectorOffset] = x + Math.cos(angle) * distance;
    positions[vectorOffset + 1] = y + Math.sin(angle) * distance;
    velocities[vectorOffset] = velocityX + Math.cos(angle) * jitter + dx * inverseSpeed * 45;
    velocities[vectorOffset + 1] = velocityY + Math.sin(angle) * jitter + dy * inverseSpeed * 45;
    radii[index] = particleRadius;
    colorSeeds[index] = authoredCountBeforeAdd;
    foam[index] = 0.72 + splashHash(activeCount + index + 1 + index * 59 + 41) * 0.28;
  }
  return Object.freeze({ count: safeCount, positions, velocities, radii, colorSeeds, foam, affine });
}

function splashHash(v: number) {
  return Math.abs(Math.sin(v * 12.9898) * 43758.5453) % 1;
}
