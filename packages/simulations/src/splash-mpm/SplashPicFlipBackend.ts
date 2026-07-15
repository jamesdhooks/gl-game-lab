import type {
  Gpu2DCapabilities,
  Gpu2DService,
  GpuParticleGridEmit2D,
  GpuParticleGridMetaballOptions2D,
  GpuParticleGridObstacles2D,
  GpuParticleGridParticleUpdateOptions2D,
  GpuParticleGridSystem2D,
  GpuParticleGridSeed2D,
  GpuRenderTarget2D,
} from '@hooksjam/gl-game-lab-engine';
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

export interface SplashPicFlipGpuRuntimeOptions {
  readonly particleToGridMode?: 'debug-gather' | 'instanced-splat';
}

export class SplashPicFlipGpuRuntime {
  private particleGrid: GpuParticleGridSystem2D | undefined;
  private gridColumns = 0;
  private gridRows = 0;
  private particleCapacity = 0;
  private stateWidth = 0;
  private stateHeight = 0;
  private cell = 1;
  private foamFrame = 0;
  private obstacleRevision = -1;
  private readonly pendingImpulses: Float32Array[] = [];

  constructor(
    private readonly gpu2D: Gpu2DService,
    private readonly id: string,
    private readonly options: SplashPicFlipGpuRuntimeOptions = {},
  ) {}

  get count(): number {
    return this.particleGrid?.count ?? 0;
  }

  get available(): boolean {
    return this.particleGrid !== undefined;
  }

  resetFromSnapshot(snapshot: SplashPicFlipStateSnapshot, tuning: SplashMpmTuning): void {
    this.cell = snapshot.grid.cell;
    this.foamFrame = 0;
    this.pendingImpulses.length = 0;
    this.ensureParticleGrid(Math.floor(tuning.maxParticles), snapshot.grid.columns, snapshot.grid.rows);
    const particleGrid = this.requireParticleGrid();
    particleGrid.uploadSeed(splashSnapshotToGpuParticleGridSeed(snapshot));
    this.setObstacles(snapshot.obstacles, 0);
  }

  pour(
    x: number,
    y: number,
    count: number,
    radius: number,
    particleRadius: number,
    dx = 0,
    dy = 0,
  ): number {
    const particleGrid = this.requireParticleGrid();
    return particleGrid.emit(createSplashGpuPourBatch(particleGrid.count, particleRadius, x, y, count, radius, dx, dy));
  }

  splash(x: number, y: number, radius: number, force: number, dx: number, dy: number): void {
    this.pendingImpulses.push(createSplashGpuImpulse(x, y, radius, force, dx, dy));
  }

  setObstacles(obstacles: readonly WaterObstacle[], revision: number): void {
    if (revision === this.obstacleRevision) return;
    this.requireParticleGrid().setObstacles(createSplashGpuObstacles(obstacles, revision));
    this.obstacleRevision = revision;
  }

  step(dt: number, tuning: SplashMpmTuning, width: number, height: number): void {
    const particleGrid = this.requireParticleGrid();
    const impulses = packImpulses(this.pendingImpulses);
    this.pendingImpulses.length = 0;
    particleGrid.step(Object.freeze({
      cell: this.cell,
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
      foamFrame: this.foamFrame,
      particleToGridMode: this.options.particleToGridMode ?? 'instanced-splat',
      ...(impulses.length > 0 ? { impulses } : {}),
    }));
    this.foamFrame += 1;
  }

  renderMetaballs(target: GpuRenderTarget2D, options: GpuParticleGridMetaballOptions2D): void {
    this.requireParticleGrid().renderMetaballs(target, options);
  }

  dispose(): void {
    this.particleGrid?.dispose();
    this.particleGrid = undefined;
    this.pendingImpulses.length = 0;
  }

  private ensureParticleGrid(capacity: number, gridColumns: number, gridRows: number): void {
    const stateWidth = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, capacity))));
    const stateHeight = Math.max(1, Math.ceil(Math.max(1, capacity) / stateWidth));
    if (this.particleGrid && this.particleCapacity === capacity && this.gridColumns === gridColumns
      && this.gridRows === gridRows && this.stateWidth === stateWidth && this.stateHeight === stateHeight) {
      return;
    }
    this.particleGrid?.dispose();
    this.particleGrid = this.gpu2D.createParticleGridSystem(this.id, {
      capacity,
      width: stateWidth,
      height: stateHeight,
      gridWidth: gridColumns,
      gridHeight: gridRows,
    });
    this.particleCapacity = capacity;
    this.gridColumns = gridColumns;
    this.gridRows = gridRows;
    this.stateWidth = stateWidth;
    this.stateHeight = stateHeight;
    this.obstacleRevision = -1;
  }

  private requireParticleGrid(): GpuParticleGridSystem2D {
    if (!this.particleGrid) throw new Error('Splash GPU runtime has not been reset');
    return this.particleGrid;
  }
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

function packImpulses(impulses: readonly Float32Array[]): Float32Array {
  if (impulses.length === 0) return new Float32Array(0);
  const output = new Float32Array(impulses.length * 8);
  impulses.forEach((impulse, index) => {
    output.set(impulse.subarray(0, 8), index * 8);
  });
  return output;
}
