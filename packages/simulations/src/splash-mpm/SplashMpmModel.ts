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
  private columns = 1;
  private rows = 1;
  private cell = 1;
  reset(width: number, height: number, t: SplashMpmTuning) {
    this.world.clear(6296997);
    this.world.setBounds(width, height);
    this.obstacles.length = 0;
    this.configure(t);
  }
  configure(t: SplashMpmTuning) {
    this.world.configure({
      maxParticles: Math.floor(t.maxParticles),
      radius: t.radius,
      radiusVariation: 0.05,
      gravity: 0,
      solverIterations: 1,
      substeps: 1,
      collisionSoftness: 0.35,
      contactFriction: 0.1,
      solverDamping: 0.998,
      airDrag: 1,
      openTop: true
    });
  }
  seed(width: number, height: number, t: SplashMpmTuning, preview = false) {
    const resolutionScale = Math.max(0.25, Math.min(1.35, 128 / Math.max(32, t.resolution))), overlap = Math.max(0.96, Math.min(1.32, 1.34 - t.radius * 0.004));
    const spacing = Math.max(Math.max(1.4, t.radius * 0.72), Math.min(t.radius * 1.52, t.radius * overlap * resolutionScale));
    const limit = Math.min(t.maxParticles, preview ? 8192 : t.maxParticles, Math.max(512, Math.floor(width * height * (preview ? 0.34 : 0.42) / Math.max(1, t.radius * t.radius * 0.42))));
    const wall = Math.max(0.5, t.radius * 0.45);
    for (let y = height * 0.22; y < height - wall && this.count < limit; y += spacing)
      for (let x = wall; x < width - wall && this.count < limit; x += spacing)
        this.world.addCircle(x + (hash(this.count * 31) - 0.5) * spacing * 0.34, y + (hash(this.count * 37 + 17) - 0.5) * spacing * 0.34, {
          colorSeed: this.count
        });
  }
  pour(x: number, y: number, count: number, radius: number, vx = 0, vy = 160) {
    let made = 0;
    for (let i = 0; i < count; i++) {
      const a = hash(this.count + i * 7) * Math.PI * 2, d = Math.sqrt(hash(this.count + i * 13)) * radius;
      if (this.world.addCircle(x + Math.cos(a) * d, y + Math.sin(a) * d, {
        velocityX: vx + (hash(i * 17) - 0.5) * 90,
        velocityY: vy + hash(i * 23) * 100,
        colorSeed: this.count
      }) < 0)
        break;
      made++;
    }
    return made;
  }
  splash(x: number, y: number, radius: number, force: number, vx: number, vy: number) {
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, dx = (this.world.positions[o] ?? 0) - x, dy = (this.world.positions[o + 1] ?? 0) - y, d2 = dx * dx + dy * dy;
      if (d2 >= r2)
        continue;
      const q = 1 - Math.sqrt(d2) / radius;
      this.world.velocities[o] = (this.world.velocities[o] ?? 0) + (vx * 0.08 + dx * force * 0.4) * q;
      this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) + (vy * 0.08 + dy * force * 0.4) * q;
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
    const support = Math.max(0.65, Math.min(6, t.radius / this.cell));
    const supportCells = Math.ceil(support) + 1;
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, ao = i * 4, gx = (this.world.positions[o] ?? 0) / this.cell, gy = (this.world.positions[o + 1] ?? 0) / this.cell;
      let weightSum = 0;
      for (let yy = Math.floor(gy - supportCells); yy <= Math.ceil(gy + supportCells); yy++)
        for (let xx = Math.floor(gx - supportCells); xx <= Math.ceil(gx + supportCells); xx++) {
          const distance = Math.hypot(xx - gx, yy - gy) / support;
          if (distance >= 1.85) continue;
          const core = Math.max(0, 1 - distance * distance);
          weightSum += core * core * (0.56 + core * 0.44);
        }
      if (weightSum <= 0.000001) continue;
      const invWeight = Math.max(1.05, Math.min(42, 1.05 + support * support * 0.88)) / weightSum;
      for (let yy = Math.floor(gy - supportCells); yy <= Math.ceil(gy + supportCells); yy++)
        for (let xx = Math.floor(gx - supportCells); xx <= Math.ceil(gx + supportCells); xx++) {
          const dx = xx - gx, dy = yy - gy, distance = Math.hypot(dx, dy) / support;
          if (distance >= 1.85) continue;
          const core = Math.max(0, 1 - distance * distance), weight = core * core * (0.56 + core * 0.44) * invWeight, c = this.gridIndex(xx, yy);
          const affineX = (this.affine[ao] ?? 0) * dx + (this.affine[ao + 1] ?? 0) * dy;
          const affineY = (this.affine[ao + 2] ?? 0) * dx + (this.affine[ao + 3] ?? 0) * dy;
          this.mass[c] = (this.mass[c] ?? 0) + weight;
          this.vx[c] = (this.vx[c] ?? 0) + ((this.world.velocities[o] ?? 0) + affineX) * weight;
          this.vy[c] = (this.vy[c] ?? 0) + ((this.world.velocities[o + 1] ?? 0) + affineY) * weight;
        }
    }
    for (let c = 0; c < this.mass.length; c++) {
      const m = this.mass[c] ?? 0;
      if (m <= 0)
        continue;
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
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, ao = i * 4, px = this.world.positions[o] ?? 0, py = this.world.positions[o + 1] ?? 0, picX = this.sample(this.vx, px, py), picY = this.sample(this.vy, px, py), prevX = this.sample(this.oldVx, px, py), prevY = this.sample(this.oldVy, px, py), flip = Math.max(0, Math.min(1, t.flipness));
      const deltaX = picX - prevX, deltaY = picY - prevY;
      this.world.velocities[o] = picX * (1 - flip) + ((this.world.velocities[o] ?? 0) + deltaX) * flip;
      this.world.velocities[o + 1] = picY * (1 - flip) + ((this.world.velocities[o + 1] ?? 0) + deltaY) * flip;
      this.world.positions[o] = (this.world.positions[o] ?? 0) + (this.world.velocities[o] ?? 0) * dt;
      this.world.positions[o + 1] = (this.world.positions[o + 1] ?? 0) + (this.world.velocities[o + 1] ?? 0) * dt;
      this.bound(i, width, height);
      this.collide(i);
      const eps = Math.max(1, this.cell), x = this.world.positions[o] ?? 0, y = this.world.positions[o + 1] ?? 0;
      this.affine[ao] = (this.sample(this.vx, x + eps, y) - this.sample(this.vx, x - eps, y)) * 0.5;
      this.affine[ao + 1] = (this.sample(this.vx, x, y + eps) - this.sample(this.vx, x, y - eps)) * 0.5;
      this.affine[ao + 2] = (this.sample(this.vy, x + eps, y) - this.sample(this.vy, x - eps, y)) * 0.5;
      this.affine[ao + 3] = (this.sample(this.vy, x, y + eps) - this.sample(this.vy, x, y - eps)) * 0.5;
      const localMass = this.sample(this.mass, x, y), above = this.sample(this.mass, x, y - eps), gradient = Math.abs(this.sample(this.mass, x + eps, y) - this.sample(this.mass, x - eps, y)) + Math.abs(this.sample(this.mass, x, y + eps) - above);
      const surface = Math.max(0, Math.min(1, (localMass - above) * 1.4)), turbulence = Math.max(0, Math.min(1, Math.hypot(this.world.velocities[o] ?? 0, this.world.velocities[o + 1] ?? 0) / 900));
      this.foam[i] = Math.max(0, Math.min(1, (this.foam[i] ?? 0) * Math.pow(0.996, dt * 60) + surface * Math.min(1, gradient) * turbulence * 0.028));
    }
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
    this.columns = Math.max(16, Math.min(256, Math.floor(res)));
    this.cell = width / this.columns;
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
    const gx = x / this.cell, gy = y / this.cell, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const a = (values[this.gridIndex(x0, y0)] ?? 0) * (1 - tx) + (values[this.gridIndex(x0 + 1, y0)] ?? 0) * tx;
    const b = (values[this.gridIndex(x0, y0 + 1)] ?? 0) * (1 - tx) + (values[this.gridIndex(x0 + 1, y0 + 1)] ?? 0) * tx;
    return a * (1 - ty) + b * ty;
  }
  private bound(i: number, w: number, h: number) {
    const o = i * 2, r = this.world.radii[i] ?? 2;
    if ((this.world.positions[o] ?? 0) < r) {
      this.world.positions[o] = r;
      this.world.velocities[o] = Math.abs(this.world.velocities[o] ?? 0) * 0.08;
    }
    if ((this.world.positions[o] ?? 0) > w - r) {
      this.world.positions[o] = w - r;
      this.world.velocities[o] = -Math.abs(this.world.velocities[o] ?? 0) * 0.08;
    }
    if ((this.world.positions[o + 1] ?? 0) > h - r) {
      this.world.positions[o + 1] = h - r;
      this.world.velocities[o + 1] = -Math.abs(this.world.velocities[o + 1] ?? 0) * 0.04;
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
