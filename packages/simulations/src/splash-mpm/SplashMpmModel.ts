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
  private readonly neighborIndices = new Int32Array(512);
  private readonly neighborDx = new Float32Array(512);
  private readonly neighborDy = new Float32Array(512);
  private readonly neighborWeights = new Float32Array(512);
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
    this.mass.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    const support = Math.max(0.65, Math.min(8, t.radius / this.cell));
    const supportCells = Math.ceil(support) + 1;
    const inverseSupportSquared = 1 / (support * support);
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, ao = i * 4, gx = (this.world.positions[o] ?? 0) / this.cell, gy = (this.world.positions[o + 1] ?? 0) / this.cell;
      let neighborCount = 0, weightSum = 0;
      for (let yy = Math.floor(gy - supportCells); yy <= Math.ceil(gy + supportCells); yy++)
        for (let xx = Math.floor(gx - supportCells); xx <= Math.ceil(gx + supportCells); xx++) {
          const dx = xx - gx, dy = yy - gy;
          const normalizedDistanceSquared = (dx * dx + dy * dy) * inverseSupportSquared;
          if (normalizedDistanceSquared >= 1) continue;
          const core = 1 - normalizedDistanceSquared;
          const weight = core * core * (0.56 + core * 0.44);
          this.neighborIndices[neighborCount] = this.gridIndex(xx, yy);
          this.neighborDx[neighborCount] = dx;
          this.neighborDy[neighborCount] = dy;
          this.neighborWeights[neighborCount] = weight;
          neighborCount++;
          weightSum += weight;
        }
      if (weightSum <= 0.000001) continue;
      const invWeight = Math.max(1.05, Math.min(42, 1.05 + support * support * 0.88)) / weightSum;
      for (let neighbor = 0; neighbor < neighborCount; neighbor++) {
        const dx = this.neighborDx[neighbor] ?? 0, dy = this.neighborDy[neighbor] ?? 0;
        const weight = (this.neighborWeights[neighbor] ?? 0) * invWeight, c = this.neighborIndices[neighbor] ?? 0;
        const affineX = (this.affine[ao] ?? 0) * dx + (this.affine[ao + 1] ?? 0) * dy;
        const affineY = (this.affine[ao + 2] ?? 0) * dx + (this.affine[ao + 3] ?? 0) * dy;
        this.mass[c] = (this.mass[c] ?? 0) + weight;
        this.vx[c] = (this.vx[c] ?? 0) + ((this.world.velocities[o] ?? 0) + affineX) * weight;
        this.vy[c] = (this.vy[c] ?? 0) + ((this.world.velocities[o + 1] ?? 0) + affineY) * weight;
      }
    }
    for (let c = 0; c < this.mass.length; c++) {
      const m = this.mass[c] ?? 0;
      if (m <= 0) {
        this.oldVx[c] = 0;
        this.oldVy[c] = 0;
        continue;
      }
      this.vx[c] = (this.vx[c] ?? 0) / m;
      this.vy[c] = (this.vy[c] ?? 0) / m;
      this.oldVx[c] = this.vx[c] ?? 0;
      this.oldVy[c] = this.vy[c] ?? 0;
    }
    const restDensity = t.restDensity * Math.max(0.62, Math.min(1.05, 1.08 - support * 0.035));
    for (let c = 0; c < this.mass.length; c++) {
      const ratio = (this.mass[c] ?? 0) / Math.max(0.001, restDensity);
      this.pressure[c] = Math.max(0, ratio - 1) * t.stiffness + Math.max(0, ratio - 0.28) * t.stiffness * t.separation * 0.34;
    }
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.columns; x++) {
      const c = y * this.columns + x;
      if ((this.mass[c] ?? 0) <= 0.000001) continue;
      const gradX = ((this.pressure[this.gridIndex(x + 1, y)] ?? 0) - (this.pressure[this.gridIndex(x - 1, y)] ?? 0)) / Math.max(1, this.cell * 2);
      const gradY = ((this.pressure[this.gridIndex(x, y + 1)] ?? 0) - (this.pressure[this.gridIndex(x, y - 1)] ?? 0)) / Math.max(1, this.cell * 2);
      this.vx[c] = (this.vx[c] ?? 0) - gradX * dt * this.cell * 18;
      this.vy[c] = (this.vy[c] ?? 0) + t.gravity * dt - gradY * dt * this.cell * 18;
    }
    const viscosityBlend = Math.max(0, Math.min(0.85, t.viscosity * dt * 14));
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.columns; x++) {
      const c = y * this.columns + x;
      const avgX = ((this.vx[this.gridIndex(x - 1, y)] ?? 0) + (this.vx[this.gridIndex(x + 1, y)] ?? 0) + (this.vx[this.gridIndex(x, y - 1)] ?? 0) + (this.vx[this.gridIndex(x, y + 1)] ?? 0)) * 0.25;
      const avgY = ((this.vy[this.gridIndex(x - 1, y)] ?? 0) + (this.vy[this.gridIndex(x + 1, y)] ?? 0) + (this.vy[this.gridIndex(x, y - 1)] ?? 0) + (this.vy[this.gridIndex(x, y + 1)] ?? 0)) * 0.25;
      this.nextVx[c] = (this.vx[c] ?? 0) + (avgX - (this.vx[c] ?? 0)) * viscosityBlend;
      this.nextVy[c] = (this.vy[c] ?? 0) + (avgY - (this.vy[c] ?? 0)) * viscosityBlend;
    }
    [this.vx, this.nextVx] = [this.nextVx, this.vx];
    [this.vy, this.nextVy] = [this.nextVy, this.vy];
    const flip = Math.max(0, Math.min(1, t.flipness));
    const foamParity = this.foamFrame & 1;
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, ao = i * 4, px = this.world.positions[o] ?? 0, py = this.world.positions[o + 1] ?? 0;
      this.sampleFour(this.vx, this.vy, this.oldVx, this.oldVy, px, py, this.sampleScratch);
      const picX = this.sampleScratch[0] ?? 0, picY = this.sampleScratch[1] ?? 0;
      const prevX = this.sampleScratch[2] ?? 0, prevY = this.sampleScratch[3] ?? 0;
      const deltaX = picX - prevX, deltaY = picY - prevY;
      this.world.velocities[o] = picX * (1 - flip) + ((this.world.velocities[o] ?? 0) + deltaX) * flip;
      this.world.velocities[o + 1] = picY * (1 - flip) + ((this.world.velocities[o + 1] ?? 0) + deltaY) * flip;
      this.world.positions[o] = (this.world.positions[o] ?? 0) + (this.world.velocities[o] ?? 0) * dt;
      this.world.positions[o + 1] = (this.world.positions[o + 1] ?? 0) + (this.world.velocities[o + 1] ?? 0) * dt;
      this.bound(i, width, height);
      this.collide(i);
      const eps = Math.max(1, this.cell), x = this.world.positions[o] ?? 0, y = this.world.positions[o + 1] ?? 0;
      this.samplePair(this.vx, this.vy, x + eps, y, this.sampleScratch, 0);
      this.samplePair(this.vx, this.vy, x - eps, y, this.sampleScratch, 2);
      this.samplePair(this.vx, this.vy, x, y + eps, this.sampleScratch, 4);
      this.samplePair(this.vx, this.vy, x, y - eps, this.sampleScratch, 6);
      this.affine[ao] = ((this.sampleScratch[0] ?? 0) - (this.sampleScratch[2] ?? 0)) * 0.5;
      this.affine[ao + 1] = ((this.sampleScratch[4] ?? 0) - (this.sampleScratch[6] ?? 0)) * 0.5;
      this.affine[ao + 2] = ((this.sampleScratch[1] ?? 0) - (this.sampleScratch[3] ?? 0)) * 0.5;
      this.affine[ao + 3] = ((this.sampleScratch[5] ?? 0) - (this.sampleScratch[7] ?? 0)) * 0.5;
      if ((i & 1) !== foamParity) continue;
      const localMass = this.sample(this.mass, x, y);
      const massAbove = this.sample(this.mass, x, y - eps);
      const massBelow = this.sample(this.mass, x, y + eps);
      const massLeft = this.sample(this.mass, x - eps, y);
      const massRight = this.sample(this.mass, x + eps, y);
      const freeSurface = smoothstep(0.08, 0.8, localMass) * smoothstep(0.04, 0.75, localMass - massAbove);
      const massGradient = smoothstep(0.05, 1.2, Math.abs(massBelow - massAbove) + Math.abs(massRight - massLeft) * 0.45);
      const velocityX = this.world.velocities[o] ?? 0, velocityY = this.world.velocities[o + 1] ?? 0;
      const turbulentSpeed = smoothstep(260, 1250, Math.sqrt(velocityX * velocityX + velocityY * velocityY));
      const shear = smoothstep(0.08, 0.9, Math.abs(this.affine[ao + 1] ?? 0) + Math.abs(this.affine[ao + 2] ?? 0) + Math.abs(this.affine[ao] ?? 0) * 0.35 + Math.abs(this.affine[ao + 3] ?? 0) * 0.35);
      const foamSource = freeSurface * massGradient * Math.max(turbulentSpeed, shear * 0.72);
      this.foam[i] = Math.max(0, Math.min(1, (this.foam[i] ?? 0) * Math.pow(0.996, dt * 120) + foamSource * 0.056));
    }
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
    return Math.max(0, Math.min(this.rows - 1, y)) * this.columns + Math.max(0, Math.min(this.columns - 1, x));
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
