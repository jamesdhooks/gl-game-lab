import type { Gpu2DCapabilities, GpuParticleGridParticleUpdateOptions2D, GpuParticleGridSeed2D } from '@hooksjam/gl-game-lab-engine';
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
