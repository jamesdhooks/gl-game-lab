import { DenseCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import type { WaterObstacle } from '../water-tank/WaterTankModel.js';
export interface SplashMpmTuning {
  readonly maxParticles: number;
  readonly resolution: number;
  readonly stiffness: number;
  readonly restDensity: number;
  readonly separation: number;
  readonly viscosity: number;
  readonly flipness: number;
  readonly gravity: number;
  readonly radius: number;
}
export const SPLASH_PIC_FLIP_CAPACITY = 131_072;

export interface SplashPicFlipStateSnapshot {
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly radii: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly foam: Float32Array;
  readonly affine: Float32Array;
  readonly obstacles: readonly WaterObstacle[];
  readonly grid: SplashPicFlipGridSnapshot;
}

export interface SplashPicFlipGridSnapshot {
  readonly columns: number;
  readonly rows: number;
  readonly cell: number;
  readonly mass: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly previousVelocityX: Float32Array;
  readonly previousVelocityY: Float32Array;
  readonly pressure: Float32Array;
}

export interface SplashPicFlipMetrics {
  readonly count: number;
  readonly finite: boolean;
  readonly centerX: number;
  readonly centerY: number;
  readonly momentumX: number;
  readonly momentumY: number;
  readonly kineticEnergy: number;
  readonly foamCoverage: number;
  readonly gridMass: number;
  readonly occupiedGridCells: number;
}

export interface SplashPicFlipMetricDelta {
  readonly countEqual: boolean;
  readonly finite: boolean;
  readonly centerDistance: number;
  readonly momentumRelativeError: number;
  readonly kineticEnergyRelativeError: number;
  readonly foamCoverageError: number;
  readonly gridMassRelativeError: number;
  readonly occupiedGridRelativeError: number;
}

export interface SplashPicFlipParticleToGridInput {
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly affine: Float32Array;
  readonly columns: number;
  readonly rows: number;
  readonly cell: number;
  readonly radius: number;
  readonly output?: SplashPicFlipParticleToGridOutput;
}

export interface SplashPicFlipParticleToGridOutput {
  readonly mass: Float32Array;
  readonly momentumX: Float32Array;
  readonly momentumY: Float32Array;
}

export interface SplashPicFlipParticleToGridTransfer {
  readonly columns: number;
  readonly rows: number;
  readonly cell: number;
  readonly support: number;
  readonly mass: Float32Array;
  readonly momentumX: Float32Array;
  readonly momentumY: Float32Array;
}

export interface SplashPicFlipGridUpdateInput {
  readonly columns: number;
  readonly rows: number;
  readonly cell: number;
  readonly support: number;
  readonly mass: Float32Array;
  readonly momentumX: Float32Array;
  readonly momentumY: Float32Array;
  readonly dt: number;
  readonly stiffness: number;
  readonly restDensity: number;
  readonly separation: number;
  readonly viscosity: number;
  readonly gravity: number;
  readonly output?: SplashPicFlipGridUpdateOutput;
}

export interface SplashPicFlipGridUpdateOutput {
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly previousVelocityX: Float32Array;
  readonly previousVelocityY: Float32Array;
  readonly pressure: Float32Array;
  readonly scratchVelocityX: Float32Array;
  readonly scratchVelocityY: Float32Array;
}

export interface SplashPicFlipGridUpdate {
  readonly columns: number;
  readonly rows: number;
  readonly cell: number;
  readonly restDensity: number;
  readonly viscosityBlend: number;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly previousVelocityX: Float32Array;
  readonly previousVelocityY: Float32Array;
  readonly pressure: Float32Array;
}

export interface SplashPicFlipParticleUpdateInput {
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly radii: Float32Array;
  readonly foam: Float32Array;
  readonly affine: Float32Array;
  readonly obstacles: readonly WaterObstacle[];
  readonly columns: number;
  readonly rows: number;
  readonly cell: number;
  readonly mass: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly previousVelocityX: Float32Array;
  readonly previousVelocityY: Float32Array;
  readonly dt: number;
  readonly width: number;
  readonly height: number;
  readonly flipness: number;
  readonly foamFrame: number;
  readonly scratch?: Float64Array;
}

export interface SplashPicFlipParticleUpdate {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly foam: Float32Array;
  readonly affine: Float32Array;
}

export class SplashPicFlipModel {
  readonly world = new DenseCircleParticleWorld2D(SPLASH_PIC_FLIP_CAPACITY, {
    maxParticles: SPLASH_PIC_FLIP_CAPACITY,
    openTop: true
  }, 6296997);
  readonly foam = new Float32Array(SPLASH_PIC_FLIP_CAPACITY);
  readonly obstacles: WaterObstacle[] = [];
  private mass = new Float32Array(1);
  private vx = new Float32Array(1);
  private vy = new Float32Array(1);
  private oldVx = new Float32Array(1);
  private oldVy = new Float32Array(1);
  private pressure = new Float32Array(1);
  private nextVx = new Float32Array(1);
  private nextVy = new Float32Array(1);
  private readonly affine = new Float32Array(SPLASH_PIC_FLIP_CAPACITY * 4);
  private readonly sampleScratch = new Float64Array(8);
  private columns = 1;
  private rows = 1;
  private cell = 1;
  private configuredMaxParticles = -1;
  private configuredRadius = Number.NaN;
  private foamFrame = 0;
  reset(width: number, height: number, t: SplashMpmTuning) {
    this.world.clear(6296997);
    this.world.setBounds(width, height);
    this.obstacles.length = 0;
    this.foam.fill(0);
    this.affine.fill(0);
    this.foamFrame = 0;
    this.configure(t);
  }
  configure(t: SplashMpmTuning) {
    const maxParticles = Math.floor(t.maxParticles);
    if (maxParticles === this.configuredMaxParticles && t.radius === this.configuredRadius) return;
    this.world.configure({
      maxParticles,
      radius: t.radius,
      radiusVariation: 0,
      gravity: 0,
      solverIterations: 1,
      substeps: 1,
      collisionSoftness: 0.35,
      contactFriction: 0.1,
      solverDamping: 0.998,
      airDrag: 1,
      openTop: true
    });
    this.configuredMaxParticles = maxParticles;
    this.configuredRadius = t.radius;
  }
  seed(width: number, height: number, t: SplashMpmTuning) {
    const resolutionScale = Math.max(0.25, Math.min(1.35, 128 / Math.max(32, t.resolution))), overlap = Math.max(0.96, Math.min(1.32, 1.34 - t.radius * 0.004));
    const spacing = Math.max(Math.max(1.4, t.radius * 0.72), Math.min(t.radius * 1.52, t.radius * overlap * resolutionScale));
    const limit = Math.min(t.maxParticles, Math.max(512, Math.floor(width * height * 0.42 / Math.max(1, t.radius * t.radius * 0.42))));
    const wall = Math.max(0.5, t.radius * 0.45);
    for (let y = height * 0.22; y < height - wall && this.count < limit; y += spacing)
      for (let x = wall; x < width - wall && this.count < limit; x += spacing) {
        const seed = hash(this.count * 37 + 17);
        const index = this.world.addCircle(
          x + (hash(this.count * 31) - 0.5) * spacing * 0.34,
          y + (seed - 0.5) * spacing * 0.34,
          {
            velocityX: 28 + seed * 34,
            velocityY: 8,
            colorSeed: this.count
          }
        );
        if (index >= 0) this.foam[index] = 0.08 + seed * 0.16;
      }
  }
  pour(x: number, y: number, count: number, radius: number, dx = 0, dy = 0) {
    let made = 0;
    const particleRadius = this.world.activeSettings.radius;
    const speed = Math.hypot(dx, dy);
    const inverseSpeed = speed > 0.001 ? 1 / speed : 0;
    const velocityX = dx * 16;
    const velocityY = dy * 16;
    const spread = Math.max(particleRadius * 0.25, Math.min(radius, Math.max(particleRadius * 1.6, speed * 0.035)));
    for (let i = 0; i < count; i++) {
      const angle = hash(this.count + i * 19) * Math.PI * 2;
      const distance = i === 0 ? 0 : Math.sqrt(hash(this.count + i * 37 + 17)) * spread;
      const jitter = (hash(this.count + i * 53 + 29) - 0.5) * 22;
      const index = this.world.addCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, {
        velocityX: velocityX + Math.cos(angle) * jitter + dx * inverseSpeed * 45,
        velocityY: velocityY + Math.sin(angle) * jitter + dy * inverseSpeed * 45,
        colorSeed: this.count
      });
      if (index < 0) break;
      this.foam[index] = 0.72 + hash(this.count + i * 59 + 41) * 0.28;
      made++;
    }
    return made;
  }
  splash(x: number, y: number, radius: number, force: number, dx: number, dy: number) {
    const startX = x - dx, startY = y - dy, radiusSquared = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const offset = i * 2;
      const [distance, nearestX, nearestY] = distanceToSegment(
        this.world.positions[offset] ?? 0,
        this.world.positions[offset + 1] ?? 0,
        startX,
        startY,
        x,
        y,
      );
      if (distance > radius) continue;
      const falloff = (1 - distance * distance / radiusSquared) ** 2;
      const offsetX = (this.world.positions[offset] ?? 0) - nearestX;
      const offsetY = (this.world.positions[offset + 1] ?? 0) - nearestY;
      const inverseDistance = 1 / Math.max(1, Math.hypot(offsetX, offsetY));
      this.world.velocities[offset] = (this.world.velocities[offset] ?? 0)
        + (dx * force * 4.8 - offsetY * inverseDistance * force * 12) * falloff;
      this.world.velocities[offset + 1] = (this.world.velocities[offset + 1] ?? 0)
        + (dy * force * 4.8 + offsetX * inverseDistance * force * 12) * falloff;
      this.foam[i] = Math.min(1, (this.foam[i] ?? 0) + falloff * 0.34);
    }
  }
  addCircle(x: number, y: number, r: number) {
    this.obstacles.push({
      kind: 'circle',
      ax: x,
      ay: y,
      bx: x,
      by: y,
      radius: r
    });
  }
  addSegment(ax: number, ay: number, bx: number, by: number, r: number) {
    this.obstacles.push({
      kind: 'segment',
      ax,
      ay,
      bx,
      by,
      radius: r
    });
  }
  step(dt: number, width: number, height: number, t: SplashMpmTuning) {
    this.configure(t);
    this.world.setBounds(width, height);
    this.ensureGrid(width, height, t.resolution);
    const transfer = computeSplashPicFlipParticleToGrid({
      count: this.count,
      positions: this.world.positions,
      velocities: this.world.velocities,
      affine: this.affine,
      columns: this.columns,
      rows: this.rows,
      cell: this.cell,
      radius: t.radius,
      output: {
        mass: this.mass,
        momentumX: this.vx,
        momentumY: this.vy,
      },
    });
    const support = transfer.support;
    computeSplashPicFlipGridUpdate({
      columns: this.columns,
      rows: this.rows,
      cell: this.cell,
      support,
      mass: this.mass,
      momentumX: this.vx,
      momentumY: this.vy,
      dt,
      stiffness: t.stiffness,
      restDensity: t.restDensity,
      separation: t.separation,
      viscosity: t.viscosity,
      gravity: t.gravity,
      output: {
        velocityX: this.vx,
        velocityY: this.vy,
        previousVelocityX: this.oldVx,
        previousVelocityY: this.oldVy,
        pressure: this.pressure,
        scratchVelocityX: this.nextVx,
        scratchVelocityY: this.nextVy,
      },
    });
    computeSplashPicFlipParticleUpdate({
      count: this.count,
      positions: this.world.positions,
      velocities: this.world.velocities,
      radii: this.world.radii,
      foam: this.foam,
      affine: this.affine,
      obstacles: this.obstacles,
      columns: this.columns,
      rows: this.rows,
      cell: this.cell,
      mass: this.mass,
      velocityX: this.vx,
      velocityY: this.vy,
      previousVelocityX: this.oldVx,
      previousVelocityY: this.oldVy,
      dt,
      width,
      height,
      flipness: t.flipness,
      foamFrame: this.foamFrame,
      scratch: this.sampleScratch,
    });
    this.foamFrame++;
  }
  snapshot(): SplashPicFlipStateSnapshot {
    const count = this.count;
    const gridLength = this.columns * this.rows;
    return Object.freeze({
      count,
      positions: this.world.positions.slice(0, count * 2),
      velocities: this.world.velocities.slice(0, count * 2),
      radii: this.world.radii.slice(0, count),
      colorSeeds: this.world.colorSeeds.slice(0, count),
      foam: this.foam.slice(0, count),
      affine: this.affine.slice(0, count * 4),
      obstacles: Object.freeze(this.obstacles.map((obstacle) => Object.freeze({ ...obstacle }))),
      grid: Object.freeze({
        columns: this.columns,
        rows: this.rows,
        cell: this.cell,
        mass: this.mass.slice(0, gridLength),
        velocityX: this.vx.slice(0, gridLength),
        velocityY: this.vy.slice(0, gridLength),
        previousVelocityX: this.oldVx.slice(0, gridLength),
        previousVelocityY: this.oldVy.slice(0, gridLength),
        pressure: this.pressure.slice(0, gridLength),
      }),
    });
  }
  restore(snapshot: SplashPicFlipStateSnapshot, width: number, height: number, tuning: SplashMpmTuning): void {
    if (snapshot.count > SPLASH_PIC_FLIP_CAPACITY || snapshot.positions.length < snapshot.count * 2
      || snapshot.velocities.length < snapshot.count * 2 || snapshot.radii.length < snapshot.count
      || snapshot.colorSeeds.length < snapshot.count || snapshot.foam.length < snapshot.count
      || snapshot.affine.length < snapshot.count * 4) {
      throw new Error('Invalid Splash PIC/FLIP state snapshot');
    }
    this.reset(width, height, tuning);
    for (let index = 0; index < snapshot.count; index += 1) {
      const offset = index * 2;
      const added = this.world.addCircle(snapshot.positions[offset] ?? 0, snapshot.positions[offset + 1] ?? 0, {
        radius: snapshot.radii[index] ?? tuning.radius,
        velocityX: snapshot.velocities[offset] ?? 0,
        velocityY: snapshot.velocities[offset + 1] ?? 0,
        colorSeed: snapshot.colorSeeds[index] ?? index,
      });
      if (added < 0) throw new Error('Splash PIC/FLIP snapshot exceeds configured particle capacity');
      this.foam[added] = snapshot.foam[index] ?? 0;
      const affineOffset = index * 4;
      this.affine.set(snapshot.affine.subarray(affineOffset, affineOffset + 4), affineOffset);
    }
    this.obstacles.push(...snapshot.obstacles.map((obstacle) => ({ ...obstacle })));
  }
  metrics(): SplashPicFlipMetrics {
    return measureSplashPicFlipSnapshot(this.snapshot());
  }
  get count() {
    return this.world.count;
  }
  packSegments() {
    const a = this.obstacles.filter(x => x.kind === 'segment'), segments = new Float32Array(a.length * 4), styles = new Float32Array(a.length * 2);
    a.forEach((x, i) => {
      segments.set([
        x.ax,
        x.ay,
        x.bx,
        x.by
      ], i * 4);
      styles.set([
        x.radius,
        0.7
      ], i * 2);
    });
    return {
      count: a.length,
      segments,
      styles
    };
  }
  packPegs() {
    const a = this.obstacles.filter(x => x.kind === 'circle'), positions = new Float32Array(a.length * 2), radii = new Float32Array(a.length), seeds = new Float32Array(a.length);
    a.forEach((x, i) => {
      positions.set([
        x.ax,
        x.ay
      ], i * 2);
      radii[i] = x.radius;
      seeds[i] = i;
    });
    return {
      count: a.length,
      positions,
      radii,
      seeds
    };
  }
  private ensureGrid(width: number, height: number, res: number) {
    const requestedColumns = Math.max(24, Math.floor(res));
    this.cell = Math.max(2, width / requestedColumns);
    this.columns = Math.max(8, Math.ceil(width / this.cell));
    this.rows = Math.max(8, Math.ceil(height / this.cell));
    const n = this.columns * this.rows;
    if (this.mass.length !== n) {
      this.mass = new Float32Array(n);
      this.vx = new Float32Array(n);
      this.vy = new Float32Array(n);
      this.oldVx = new Float32Array(n);
      this.oldVy = new Float32Array(n);
      this.pressure = new Float32Array(n);
      this.nextVx = new Float32Array(n);
      this.nextVy = new Float32Array(n);
    }
  }
  private gridIndex(x: number, y: number) {
    return splashPicFlipGridIndex(x, y, this.columns, this.rows);
  }
  private sample(values: Float32Array, x: number, y: number) {
    const gx = x / Math.max(1, this.cell), gy = y / Math.max(1, this.cell);
    const baseX = Math.floor(gx - 0.5), baseY = Math.floor(gy - 0.5);
    const tx = gx - baseX, ty = gy - baseY;
    const wx0 = 0.5 * (1.5 - tx) * (1.5 - tx), wx1 = 0.75 - (tx - 1) * (tx - 1), wx2 = 0.5 * (tx - 0.5) * (tx - 0.5);
    const wy0 = 0.5 * (1.5 - ty) * (1.5 - ty), wy1 = 0.75 - (ty - 1) * (ty - 1), wy2 = 0.5 * (ty - 0.5) * (ty - 0.5);
    let value = 0;
    for (let offsetY = 0; offsetY < 3; offsetY++) {
      const wy = offsetY === 0 ? wy0 : offsetY === 1 ? wy1 : wy2;
      for (let offsetX = 0; offsetX < 3; offsetX++) {
        const wx = offsetX === 0 ? wx0 : offsetX === 1 ? wx1 : wx2;
        value += (values[this.gridIndex(baseX + offsetX, baseY + offsetY)] ?? 0) * wx * wy;
      }
    }
    return value;
  }
  private samplePair(a: Float32Array, b: Float32Array, x: number, y: number, output: Float64Array, offset: number) {
    const gx = x / Math.max(1, this.cell), gy = y / Math.max(1, this.cell);
    const baseX = Math.floor(gx - 0.5), baseY = Math.floor(gy - 0.5), tx = gx - baseX, ty = gy - baseY;
    const wx0 = 0.5 * (1.5 - tx) * (1.5 - tx), wx1 = 0.75 - (tx - 1) * (tx - 1), wx2 = 0.5 * (tx - 0.5) * (tx - 0.5);
    const wy0 = 0.5 * (1.5 - ty) * (1.5 - ty), wy1 = 0.75 - (ty - 1) * (ty - 1), wy2 = 0.5 * (ty - 0.5) * (ty - 0.5);
    let valueA = 0, valueB = 0;
    for (let offsetY = 0; offsetY < 3; offsetY++) {
      const wy = offsetY === 0 ? wy0 : offsetY === 1 ? wy1 : wy2;
      for (let offsetX = 0; offsetX < 3; offsetX++) {
        const wx = offsetX === 0 ? wx0 : offsetX === 1 ? wx1 : wx2, weight = wx * wy;
        const index = this.gridIndex(baseX + offsetX, baseY + offsetY);
        valueA += (a[index] ?? 0) * weight;
        valueB += (b[index] ?? 0) * weight;
      }
    }
    output[offset] = valueA;
    output[offset + 1] = valueB;
  }
  private sampleFour(a: Float32Array, b: Float32Array, c: Float32Array, d: Float32Array, x: number, y: number, output: Float64Array) {
    const gx = x / Math.max(1, this.cell), gy = y / Math.max(1, this.cell);
    const baseX = Math.floor(gx - 0.5), baseY = Math.floor(gy - 0.5), tx = gx - baseX, ty = gy - baseY;
    const wx0 = 0.5 * (1.5 - tx) * (1.5 - tx), wx1 = 0.75 - (tx - 1) * (tx - 1), wx2 = 0.5 * (tx - 0.5) * (tx - 0.5);
    const wy0 = 0.5 * (1.5 - ty) * (1.5 - ty), wy1 = 0.75 - (ty - 1) * (ty - 1), wy2 = 0.5 * (ty - 0.5) * (ty - 0.5);
    let valueA = 0, valueB = 0, valueC = 0, valueD = 0;
    for (let offsetY = 0; offsetY < 3; offsetY++) {
      const wy = offsetY === 0 ? wy0 : offsetY === 1 ? wy1 : wy2;
      for (let offsetX = 0; offsetX < 3; offsetX++) {
        const wx = offsetX === 0 ? wx0 : offsetX === 1 ? wx1 : wx2, weight = wx * wy;
        const index = this.gridIndex(baseX + offsetX, baseY + offsetY);
        valueA += (a[index] ?? 0) * weight;
        valueB += (b[index] ?? 0) * weight;
        valueC += (c[index] ?? 0) * weight;
        valueD += (d[index] ?? 0) * weight;
      }
    }
    output[0] = valueA;
    output[1] = valueB;
    output[2] = valueC;
    output[3] = valueD;
  }
  private bound(i: number, w: number, h: number) {
    const o = i * 2, r = Math.max(0.5, (this.world.radii[i] ?? 2) * 0.45), bounce = 0.34;
    if ((this.world.positions[o] ?? 0) < r) {
      this.world.positions[o] = r;
      this.world.velocities[o] = Math.abs(this.world.velocities[o] ?? 0) * bounce;
    }
    if ((this.world.positions[o] ?? 0) > w - r) {
      this.world.positions[o] = w - r;
      this.world.velocities[o] = -Math.abs(this.world.velocities[o] ?? 0) * bounce;
    }
    if ((this.world.positions[o + 1] ?? 0) < r) {
      this.world.positions[o + 1] = r;
      this.world.velocities[o + 1] = Math.abs(this.world.velocities[o + 1] ?? 0) * bounce;
    }
    if ((this.world.positions[o + 1] ?? 0) > h - r) {
      this.world.positions[o + 1] = h - r;
      this.world.velocities[o + 1] = -Math.abs(this.world.velocities[o + 1] ?? 0) * bounce;
      this.world.velocities[o] = (this.world.velocities[o] ?? 0) * 0.86;
    }
  }
  private collide(i: number) {
    for (const x of this.obstacles) {
      const o = i * 2, px = this.world.positions[o] ?? 0, py = this.world.positions[o + 1] ?? 0, p = x.kind === 'circle' ? {
        x: x.ax,
        y: x.ay
      } : closest(px, py, x), dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy), target = (this.world.radii[i] ?? 2) + x.radius;
      if (d >= target)
        continue;
      const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : -1;
      this.world.positions[o] = p.x + nx * target;
      this.world.positions[o + 1] = p.y + ny * target;
      const dot = (this.world.velocities[o] ?? 0) * nx + (this.world.velocities[o + 1] ?? 0) * ny;
      if (dot < 0) {
        this.world.velocities[o] = (this.world.velocities[o] ?? 0) - 1.05 * dot * nx;
        this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) - 1.05 * dot * ny;
      }
    }
  }
}

/** @deprecated Compatibility alias; the implementation is PIC/FLIP, not MPM. */
export { SplashPicFlipModel as SplashMpmModel };

export function computeSplashPicFlipParticleToGrid(input: SplashPicFlipParticleToGridInput): SplashPicFlipParticleToGridTransfer {
  if (!Number.isSafeInteger(input.count) || input.count < 0) throw new Error('Splash PIC/FLIP particle count must be a non-negative integer');
  if (!Number.isSafeInteger(input.columns) || input.columns < 1) throw new Error('Splash PIC/FLIP grid columns must be positive');
  if (!Number.isSafeInteger(input.rows) || input.rows < 1) throw new Error('Splash PIC/FLIP grid rows must be positive');
  if (!Number.isFinite(input.cell) || input.cell <= 0) throw new Error('Splash PIC/FLIP grid cell must be positive');
  if (!Number.isFinite(input.radius) || input.radius <= 0) throw new Error('Splash PIC/FLIP particle radius must be positive');
  if (input.positions.length < input.count * 2 || input.velocities.length < input.count * 2 || input.affine.length < input.count * 4) {
    throw new Error('Splash PIC/FLIP particle-to-grid input arrays are too short');
  }
  const cellCount = input.columns * input.rows;
  const mass = input.output?.mass ?? new Float32Array(cellCount);
  const momentumX = input.output?.momentumX ?? new Float32Array(cellCount);
  const momentumY = input.output?.momentumY ?? new Float32Array(cellCount);
  if (mass.length < cellCount || momentumX.length < cellCount || momentumY.length < cellCount) {
    throw new Error('Splash PIC/FLIP particle-to-grid output arrays are too short');
  }
  mass.fill(0, 0, cellCount);
  momentumX.fill(0, 0, cellCount);
  momentumY.fill(0, 0, cellCount);
  const support = Math.max(0.65, Math.min(8, input.radius / input.cell));
  const supportCells = Math.ceil(support) + 1;
  const inverseSupportSquared = 1 / (support * support);
  for (let particle = 0; particle < input.count; particle += 1) {
    const offset = particle * 2;
    const affineOffset = particle * 4;
    const gx = (input.positions[offset] ?? 0) / input.cell;
    const gy = (input.positions[offset + 1] ?? 0) / input.cell;
    const minY = Math.floor(gy - supportCells);
    const maxY = Math.ceil(gy + supportCells);
    const minX = Math.floor(gx - supportCells);
    const maxX = Math.ceil(gx + supportCells);
    let weightSum = 0;
    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        const dx = xx - gx;
        const dy = yy - gy;
        const normalizedDistanceSquared = (dx * dx + dy * dy) * inverseSupportSquared;
        if (normalizedDistanceSquared >= 1) continue;
        const core = 1 - normalizedDistanceSquared;
        const weight = core * core * (0.56 + core * 0.44);
        weightSum += weight;
      }
    }
    if (weightSum <= 0.000001) continue;
    const invWeight = Math.max(1.05, Math.min(42, 1.05 + support * support * 0.88)) / weightSum;
    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        const dx = xx - gx;
        const dy = yy - gy;
        const normalizedDistanceSquared = (dx * dx + dy * dy) * inverseSupportSquared;
        if (normalizedDistanceSquared >= 1) continue;
        const core = 1 - normalizedDistanceSquared;
        const weight = core * core * (0.56 + core * 0.44) * invWeight;
        const cell = splashPicFlipGridIndex(xx, yy, input.columns, input.rows);
        const affineX = (input.affine[affineOffset] ?? 0) * dx + (input.affine[affineOffset + 1] ?? 0) * dy;
        const affineY = (input.affine[affineOffset + 2] ?? 0) * dx + (input.affine[affineOffset + 3] ?? 0) * dy;
        mass[cell] = (mass[cell] ?? 0) + weight;
        momentumX[cell] = (momentumX[cell] ?? 0) + ((input.velocities[offset] ?? 0) + affineX) * weight;
        momentumY[cell] = (momentumY[cell] ?? 0) + ((input.velocities[offset + 1] ?? 0) + affineY) * weight;
      }
    }
  }
  return Object.freeze({
    columns: input.columns,
    rows: input.rows,
    cell: input.cell,
    support,
    mass,
    momentumX,
    momentumY,
  });
}

export function computeSplashPicFlipGridUpdate(input: SplashPicFlipGridUpdateInput): SplashPicFlipGridUpdate {
  if (!Number.isSafeInteger(input.columns) || input.columns < 1) throw new Error('Splash PIC/FLIP grid update columns must be positive');
  if (!Number.isSafeInteger(input.rows) || input.rows < 1) throw new Error('Splash PIC/FLIP grid update rows must be positive');
  if (!Number.isFinite(input.cell) || input.cell <= 0) throw new Error('Splash PIC/FLIP grid update cell must be positive');
  if (!Number.isFinite(input.support) || input.support <= 0) throw new Error('Splash PIC/FLIP grid update support must be positive');
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new Error('Splash PIC/FLIP grid update dt must be non-negative');
  const cellCount = input.columns * input.rows;
  if (input.mass.length < cellCount || input.momentumX.length < cellCount || input.momentumY.length < cellCount) {
    throw new Error('Splash PIC/FLIP grid update input arrays are too short');
  }
  const velocityX = input.output?.velocityX ?? new Float32Array(cellCount);
  const velocityY = input.output?.velocityY ?? new Float32Array(cellCount);
  const previousVelocityX = input.output?.previousVelocityX ?? new Float32Array(cellCount);
  const previousVelocityY = input.output?.previousVelocityY ?? new Float32Array(cellCount);
  const pressure = input.output?.pressure ?? new Float32Array(cellCount);
  const scratchVelocityX = input.output?.scratchVelocityX ?? new Float32Array(cellCount);
  const scratchVelocityY = input.output?.scratchVelocityY ?? new Float32Array(cellCount);
  if (velocityX.length < cellCount || velocityY.length < cellCount || previousVelocityX.length < cellCount
    || previousVelocityY.length < cellCount || pressure.length < cellCount
    || scratchVelocityX.length < cellCount || scratchVelocityY.length < cellCount) {
    throw new Error('Splash PIC/FLIP grid update output arrays are too short');
  }
  for (let cell = 0; cell < cellCount; cell += 1) {
    const mass = input.mass[cell] ?? 0;
    if (mass <= 0) {
      velocityX[cell] = 0;
      velocityY[cell] = 0;
      previousVelocityX[cell] = 0;
      previousVelocityY[cell] = 0;
      continue;
    }
    velocityX[cell] = (input.momentumX[cell] ?? 0) / mass;
    velocityY[cell] = (input.momentumY[cell] ?? 0) / mass;
    previousVelocityX[cell] = velocityX[cell] ?? 0;
    previousVelocityY[cell] = velocityY[cell] ?? 0;
  }
  const restDensity = input.restDensity * Math.max(0.62, Math.min(1.05, 1.08 - input.support * 0.035));
  for (let cell = 0; cell < cellCount; cell += 1) {
    const ratio = (input.mass[cell] ?? 0) / Math.max(0.001, restDensity);
    pressure[cell] = Math.max(0, ratio - 1) * input.stiffness + Math.max(0, ratio - 0.28) * input.stiffness * input.separation * 0.34;
  }
  for (let y = 0; y < input.rows; y += 1) {
    for (let x = 0; x < input.columns; x += 1) {
      const cell = y * input.columns + x;
      if ((input.mass[cell] ?? 0) <= 0.000001) continue;
      const gradX = ((pressure[splashPicFlipGridIndex(x + 1, y, input.columns, input.rows)] ?? 0)
        - (pressure[splashPicFlipGridIndex(x - 1, y, input.columns, input.rows)] ?? 0)) / Math.max(1, input.cell * 2);
      const gradY = ((pressure[splashPicFlipGridIndex(x, y + 1, input.columns, input.rows)] ?? 0)
        - (pressure[splashPicFlipGridIndex(x, y - 1, input.columns, input.rows)] ?? 0)) / Math.max(1, input.cell * 2);
      velocityX[cell] = (velocityX[cell] ?? 0) - gradX * input.dt * input.cell * 18;
      velocityY[cell] = (velocityY[cell] ?? 0) + input.gravity * input.dt - gradY * input.dt * input.cell * 18;
    }
  }
  const viscosityBlend = Math.max(0, Math.min(0.85, input.viscosity * input.dt * 14));
  for (let y = 0; y < input.rows; y += 1) {
    for (let x = 0; x < input.columns; x += 1) {
      const cell = y * input.columns + x;
      const avgX = ((velocityX[splashPicFlipGridIndex(x - 1, y, input.columns, input.rows)] ?? 0)
        + (velocityX[splashPicFlipGridIndex(x + 1, y, input.columns, input.rows)] ?? 0)
        + (velocityX[splashPicFlipGridIndex(x, y - 1, input.columns, input.rows)] ?? 0)
        + (velocityX[splashPicFlipGridIndex(x, y + 1, input.columns, input.rows)] ?? 0)) * 0.25;
      const avgY = ((velocityY[splashPicFlipGridIndex(x - 1, y, input.columns, input.rows)] ?? 0)
        + (velocityY[splashPicFlipGridIndex(x + 1, y, input.columns, input.rows)] ?? 0)
        + (velocityY[splashPicFlipGridIndex(x, y - 1, input.columns, input.rows)] ?? 0)
        + (velocityY[splashPicFlipGridIndex(x, y + 1, input.columns, input.rows)] ?? 0)) * 0.25;
      scratchVelocityX[cell] = (velocityX[cell] ?? 0) + (avgX - (velocityX[cell] ?? 0)) * viscosityBlend;
      scratchVelocityY[cell] = (velocityY[cell] ?? 0) + (avgY - (velocityY[cell] ?? 0)) * viscosityBlend;
    }
  }
  velocityX.set(scratchVelocityX.subarray(0, cellCount), 0);
  velocityY.set(scratchVelocityY.subarray(0, cellCount), 0);
  return Object.freeze({
    columns: input.columns,
    rows: input.rows,
    cell: input.cell,
    restDensity,
    viscosityBlend,
    velocityX,
    velocityY,
    previousVelocityX,
    previousVelocityY,
    pressure,
  });
}

export function computeSplashPicFlipParticleUpdate(input: SplashPicFlipParticleUpdateInput): SplashPicFlipParticleUpdate {
  if (!Number.isSafeInteger(input.count) || input.count < 0) throw new Error('Splash PIC/FLIP particle update count must be non-negative');
  if (!Number.isSafeInteger(input.columns) || input.columns < 1) throw new Error('Splash PIC/FLIP particle update columns must be positive');
  if (!Number.isSafeInteger(input.rows) || input.rows < 1) throw new Error('Splash PIC/FLIP particle update rows must be positive');
  if (!Number.isFinite(input.cell) || input.cell <= 0) throw new Error('Splash PIC/FLIP particle update cell must be positive');
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new Error('Splash PIC/FLIP particle update dt must be non-negative');
  if (!Number.isFinite(input.width) || input.width <= 0 || !Number.isFinite(input.height) || input.height <= 0) {
    throw new Error('Splash PIC/FLIP particle update bounds must be positive');
  }
  const gridCount = input.columns * input.rows;
  if (input.positions.length < input.count * 2 || input.velocities.length < input.count * 2 || input.radii.length < input.count
    || input.foam.length < input.count || input.affine.length < input.count * 4) {
    throw new Error('Splash PIC/FLIP particle update particle arrays are too short');
  }
  if (input.mass.length < gridCount || input.velocityX.length < gridCount || input.velocityY.length < gridCount
    || input.previousVelocityX.length < gridCount || input.previousVelocityY.length < gridCount) {
    throw new Error('Splash PIC/FLIP particle update grid arrays are too short');
  }
  const flip = Math.max(0, Math.min(1, input.flipness));
  const foamParity = input.foamFrame & 1;
  const scratch = input.scratch ?? new Float64Array(8);
  if (scratch.length < 8) throw new Error('Splash PIC/FLIP particle update scratch array is too short');
  for (let particle = 0; particle < input.count; particle += 1) {
    const offset = particle * 2;
    const affineOffset = particle * 4;
    const px = input.positions[offset] ?? 0;
    const py = input.positions[offset + 1] ?? 0;
    splashPicFlipSampleFour(input.velocityX, input.velocityY, input.previousVelocityX, input.previousVelocityY, px, py, input.columns, input.rows, input.cell, scratch);
    const picX = scratch[0] ?? 0;
    const picY = scratch[1] ?? 0;
    const prevX = scratch[2] ?? 0;
    const prevY = scratch[3] ?? 0;
    const deltaX = picX - prevX;
    const deltaY = picY - prevY;
    input.velocities[offset] = picX * (1 - flip) + ((input.velocities[offset] ?? 0) + deltaX) * flip;
    input.velocities[offset + 1] = picY * (1 - flip) + ((input.velocities[offset + 1] ?? 0) + deltaY) * flip;
    input.positions[offset] = (input.positions[offset] ?? 0) + (input.velocities[offset] ?? 0) * input.dt;
    input.positions[offset + 1] = (input.positions[offset + 1] ?? 0) + (input.velocities[offset + 1] ?? 0) * input.dt;
    splashPicFlipResolveBounds(particle, input.positions, input.velocities, input.radii, input.width, input.height);
    splashPicFlipResolveObstacles(particle, input.positions, input.velocities, input.radii, input.obstacles);
    const eps = Math.max(1, input.cell);
    const x = input.positions[offset] ?? 0;
    const y = input.positions[offset + 1] ?? 0;
    splashPicFlipSamplePair(input.velocityX, input.velocityY, x + eps, y, input.columns, input.rows, input.cell, scratch, 0);
    splashPicFlipSamplePair(input.velocityX, input.velocityY, x - eps, y, input.columns, input.rows, input.cell, scratch, 2);
    splashPicFlipSamplePair(input.velocityX, input.velocityY, x, y + eps, input.columns, input.rows, input.cell, scratch, 4);
    splashPicFlipSamplePair(input.velocityX, input.velocityY, x, y - eps, input.columns, input.rows, input.cell, scratch, 6);
    input.affine[affineOffset] = ((scratch[0] ?? 0) - (scratch[2] ?? 0)) * 0.5;
    input.affine[affineOffset + 1] = ((scratch[4] ?? 0) - (scratch[6] ?? 0)) * 0.5;
    input.affine[affineOffset + 2] = ((scratch[1] ?? 0) - (scratch[3] ?? 0)) * 0.5;
    input.affine[affineOffset + 3] = ((scratch[5] ?? 0) - (scratch[7] ?? 0)) * 0.5;
    if ((particle & 1) !== foamParity) continue;
    const localMass = splashPicFlipSample(input.mass, x, y, input.columns, input.rows, input.cell);
    const massAbove = splashPicFlipSample(input.mass, x, y - eps, input.columns, input.rows, input.cell);
    const massBelow = splashPicFlipSample(input.mass, x, y + eps, input.columns, input.rows, input.cell);
    const massLeft = splashPicFlipSample(input.mass, x - eps, y, input.columns, input.rows, input.cell);
    const massRight = splashPicFlipSample(input.mass, x + eps, y, input.columns, input.rows, input.cell);
    const freeSurface = smoothstep(0.08, 0.8, localMass) * smoothstep(0.04, 0.75, localMass - massAbove);
    const massGradient = smoothstep(0.05, 1.2, Math.abs(massBelow - massAbove) + Math.abs(massRight - massLeft) * 0.45);
    const velocityX = input.velocities[offset] ?? 0;
    const velocityY = input.velocities[offset + 1] ?? 0;
    const turbulentSpeed = smoothstep(260, 1250, Math.sqrt(velocityX * velocityX + velocityY * velocityY));
    const shear = smoothstep(0.08, 0.9, Math.abs(input.affine[affineOffset + 1] ?? 0) + Math.abs(input.affine[affineOffset + 2] ?? 0)
      + Math.abs(input.affine[affineOffset] ?? 0) * 0.35 + Math.abs(input.affine[affineOffset + 3] ?? 0) * 0.35);
    const foamSource = freeSurface * massGradient * Math.max(turbulentSpeed, shear * 0.72);
    input.foam[particle] = Math.max(0, Math.min(1, (input.foam[particle] ?? 0) * Math.pow(0.996, input.dt * 120) + foamSource * 0.056));
  }
  return Object.freeze({
    positions: input.positions,
    velocities: input.velocities,
    foam: input.foam,
    affine: input.affine,
  });
}

export function measureSplashPicFlipSnapshot(snapshot: SplashPicFlipStateSnapshot): SplashPicFlipMetrics {
  let sumX = 0, sumY = 0, momentumX = 0, momentumY = 0, kineticEnergy = 0, foamCount = 0, finite = true;
  for (let index = 0; index < snapshot.count; index += 1) {
    const offset = index * 2;
    const x = snapshot.positions[offset] ?? 0, y = snapshot.positions[offset + 1] ?? 0;
    const velocityX = snapshot.velocities[offset] ?? 0, velocityY = snapshot.velocities[offset + 1] ?? 0;
    const foam = snapshot.foam[index] ?? 0;
    finite = finite && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(velocityX)
      && Number.isFinite(velocityY) && Number.isFinite(foam);
    sumX += x;
    sumY += y;
    momentumX += velocityX;
    momentumY += velocityY;
    kineticEnergy += 0.5 * (velocityX * velocityX + velocityY * velocityY);
    if (foam >= 0.08) foamCount += 1;
  }
  let gridMass = 0, occupiedGridCells = 0;
  for (const mass of snapshot.grid.mass) {
    finite = finite && Number.isFinite(mass);
    gridMass += mass;
    if (mass > 0.000001) occupiedGridCells += 1;
  }
  const divisor = Math.max(1, snapshot.count);
  return Object.freeze({
    count: snapshot.count,
    finite,
    centerX: sumX / divisor,
    centerY: sumY / divisor,
    momentumX,
    momentumY,
    kineticEnergy,
    foamCoverage: foamCount / divisor,
    gridMass,
    occupiedGridCells,
  });
}

export function compareSplashPicFlipMetrics(reference: SplashPicFlipMetrics, candidate: SplashPicFlipMetrics): SplashPicFlipMetricDelta {
  const momentumMagnitude = Math.hypot(reference.momentumX, reference.momentumY);
  return Object.freeze({
    countEqual: reference.count === candidate.count,
    finite: reference.finite && candidate.finite,
    centerDistance: Math.hypot(reference.centerX - candidate.centerX, reference.centerY - candidate.centerY),
    momentumRelativeError: Math.hypot(reference.momentumX - candidate.momentumX, reference.momentumY - candidate.momentumY)
      / Math.max(0.000001, momentumMagnitude),
    kineticEnergyRelativeError: relativeError(reference.kineticEnergy, candidate.kineticEnergy),
    foamCoverageError: Math.abs(reference.foamCoverage - candidate.foamCoverage),
    gridMassRelativeError: relativeError(reference.gridMass, candidate.gridMass),
    occupiedGridRelativeError: relativeError(reference.occupiedGridCells, candidate.occupiedGridCells),
  });
}

function relativeError(reference: number, candidate: number): number {
  return Math.abs(reference - candidate) / Math.max(0.000001, Math.abs(reference));
}
function splashPicFlipGridIndex(x: number, y: number, columns: number, rows: number) {
  return Math.max(0, Math.min(rows - 1, y)) * columns + Math.max(0, Math.min(columns - 1, x));
}
function splashPicFlipSample(values: Float32Array, x: number, y: number, columns: number, rows: number, cell: number) {
  const gx = x / Math.max(1, cell), gy = y / Math.max(1, cell);
  const baseX = Math.floor(gx - 0.5), baseY = Math.floor(gy - 0.5);
  const tx = gx - baseX, ty = gy - baseY;
  const wx0 = 0.5 * (1.5 - tx) * (1.5 - tx), wx1 = 0.75 - (tx - 1) * (tx - 1), wx2 = 0.5 * (tx - 0.5) * (tx - 0.5);
  const wy0 = 0.5 * (1.5 - ty) * (1.5 - ty), wy1 = 0.75 - (ty - 1) * (ty - 1), wy2 = 0.5 * (ty - 0.5) * (ty - 0.5);
  let value = 0;
  for (let offsetY = 0; offsetY < 3; offsetY += 1) {
    const wy = offsetY === 0 ? wy0 : offsetY === 1 ? wy1 : wy2;
    for (let offsetX = 0; offsetX < 3; offsetX += 1) {
      const wx = offsetX === 0 ? wx0 : offsetX === 1 ? wx1 : wx2;
      value += (values[splashPicFlipGridIndex(baseX + offsetX, baseY + offsetY, columns, rows)] ?? 0) * wx * wy;
    }
  }
  return value;
}
function splashPicFlipSamplePair(a: Float32Array, b: Float32Array, x: number, y: number, columns: number, rows: number, cell: number, output: Float64Array, offset: number) {
  const gx = x / Math.max(1, cell), gy = y / Math.max(1, cell);
  const baseX = Math.floor(gx - 0.5), baseY = Math.floor(gy - 0.5), tx = gx - baseX, ty = gy - baseY;
  const wx0 = 0.5 * (1.5 - tx) * (1.5 - tx), wx1 = 0.75 - (tx - 1) * (tx - 1), wx2 = 0.5 * (tx - 0.5) * (tx - 0.5);
  const wy0 = 0.5 * (1.5 - ty) * (1.5 - ty), wy1 = 0.75 - (ty - 1) * (ty - 1), wy2 = 0.5 * (ty - 0.5) * (ty - 0.5);
  let valueA = 0, valueB = 0;
  for (let offsetY = 0; offsetY < 3; offsetY += 1) {
    const wy = offsetY === 0 ? wy0 : offsetY === 1 ? wy1 : wy2;
    for (let offsetX = 0; offsetX < 3; offsetX += 1) {
      const wx = offsetX === 0 ? wx0 : offsetX === 1 ? wx1 : wx2, weight = wx * wy;
      const index = splashPicFlipGridIndex(baseX + offsetX, baseY + offsetY, columns, rows);
      valueA += (a[index] ?? 0) * weight;
      valueB += (b[index] ?? 0) * weight;
    }
  }
  output[offset] = valueA;
  output[offset + 1] = valueB;
}
function splashPicFlipSampleFour(a: Float32Array, b: Float32Array, c: Float32Array, d: Float32Array, x: number, y: number, columns: number, rows: number, cell: number, output: Float64Array) {
  const gx = x / Math.max(1, cell), gy = y / Math.max(1, cell);
  const baseX = Math.floor(gx - 0.5), baseY = Math.floor(gy - 0.5), tx = gx - baseX, ty = gy - baseY;
  const wx0 = 0.5 * (1.5 - tx) * (1.5 - tx), wx1 = 0.75 - (tx - 1) * (tx - 1), wx2 = 0.5 * (tx - 0.5) * (tx - 0.5);
  const wy0 = 0.5 * (1.5 - ty) * (1.5 - ty), wy1 = 0.75 - (ty - 1) * (ty - 1), wy2 = 0.5 * (ty - 0.5) * (ty - 0.5);
  let valueA = 0, valueB = 0, valueC = 0, valueD = 0;
  for (let offsetY = 0; offsetY < 3; offsetY += 1) {
    const wy = offsetY === 0 ? wy0 : offsetY === 1 ? wy1 : wy2;
    for (let offsetX = 0; offsetX < 3; offsetX += 1) {
      const wx = offsetX === 0 ? wx0 : offsetX === 1 ? wx1 : wx2, weight = wx * wy;
      const index = splashPicFlipGridIndex(baseX + offsetX, baseY + offsetY, columns, rows);
      valueA += (a[index] ?? 0) * weight;
      valueB += (b[index] ?? 0) * weight;
      valueC += (c[index] ?? 0) * weight;
      valueD += (d[index] ?? 0) * weight;
    }
  }
  output[0] = valueA;
  output[1] = valueB;
  output[2] = valueC;
  output[3] = valueD;
}
function splashPicFlipResolveBounds(index: number, positions: Float32Array, velocities: Float32Array, radii: Float32Array, width: number, height: number) {
  const offset = index * 2, radius = Math.max(0.5, (radii[index] ?? 2) * 0.45), bounce = 0.34;
  if ((positions[offset] ?? 0) < radius) {
    positions[offset] = radius;
    velocities[offset] = Math.abs(velocities[offset] ?? 0) * bounce;
  }
  if ((positions[offset] ?? 0) > width - radius) {
    positions[offset] = width - radius;
    velocities[offset] = -Math.abs(velocities[offset] ?? 0) * bounce;
  }
  if ((positions[offset + 1] ?? 0) < radius) {
    positions[offset + 1] = radius;
    velocities[offset + 1] = Math.abs(velocities[offset + 1] ?? 0) * bounce;
  }
  if ((positions[offset + 1] ?? 0) > height - radius) {
    positions[offset + 1] = height - radius;
    velocities[offset + 1] = -Math.abs(velocities[offset + 1] ?? 0) * bounce;
    velocities[offset] = (velocities[offset] ?? 0) * 0.86;
  }
}
function splashPicFlipResolveObstacles(index: number, positions: Float32Array, velocities: Float32Array, radii: Float32Array, obstacles: readonly WaterObstacle[]) {
  for (const obstacle of obstacles) {
    const offset = index * 2;
    const px = positions[offset] ?? 0;
    const py = positions[offset + 1] ?? 0;
    const point = obstacle.kind === 'circle' ? { x: obstacle.ax, y: obstacle.ay } : closest(px, py, obstacle);
    const dx = px - point.x;
    const dy = py - point.y;
    const distance = Math.hypot(dx, dy);
    const target = (radii[index] ?? 2) + obstacle.radius;
    if (distance >= target) continue;
    const normalX = distance > 0.001 ? dx / distance : 0;
    const normalY = distance > 0.001 ? dy / distance : -1;
    positions[offset] = point.x + normalX * target;
    positions[offset + 1] = point.y + normalY * target;
    const dot = (velocities[offset] ?? 0) * normalX + (velocities[offset + 1] ?? 0) * normalY;
    if (dot < 0) {
      velocities[offset] = (velocities[offset] ?? 0) - 1.05 * dot * normalX;
      velocities[offset + 1] = (velocities[offset + 1] ?? 0) - 1.05 * dot * normalY;
    }
  }
}
function closest(x: number, y: number, l: WaterObstacle) {
  const dx = l.bx - l.ax, dy = l.by - l.ay, q = dx * dx + dy * dy, t = q < 0.001 ? 0 : Math.max(0, Math.min(1, ((x - l.ax) * dx + (y - l.ay) * dy) / q));
  return {
    x: l.ax + dx * t,
    y: l.ay + dy * t
  };
}
function hash(v: number) {
  return Math.abs(Math.sin(v * 12.9898) * 43758.5453) % 1;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): readonly [number, number, number] {
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0.0001 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 1;
  const x = ax + dx * t, y = ay + dy * t;
  return [Math.hypot(px - x, py - y), x, y];
}
