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
    const spacing = Math.max(t.radius * 1.55, t.separation + t.radius), cols = Math.floor(width * 0.42 / spacing), rows = Math.floor(height * 0.42 / spacing), limit = Math.min(preview ? 2200 : 9000, Math.floor(t.maxParticles * 0.42));
    for (let y = 0; y < rows && this.count < limit; y++)
      for (let x = 0; x < cols && this.count < limit; x++)
        this.world.addCircle(width * 0.08 + x * spacing, height * 0.52 + y * spacing, {
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
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, x = (this.world.positions[o] ?? 0) / this.cell, y = (this.world.positions[o + 1] ?? 0) / this.cell, cx = Math.max(0, Math.min(this.columns - 1, Math.floor(x))), cy = Math.max(0, Math.min(this.rows - 1, Math.floor(y))), c = cy * this.columns + cx;
      this.mass[c] = (this.mass[c] ?? 0) + 1;
      this.vx[c] = (this.vx[c] ?? 0) + (this.world.velocities[o] ?? 0);
      this.vy[c] = (this.vy[c] ?? 0) + (this.world.velocities[o + 1] ?? 0);
    }
    for (let c = 0; c < this.mass.length; c++) {
      const m = this.mass[c] ?? 0;
      if (m <= 0)
        continue;
      this.vx[c] = (this.vx[c] ?? 0) / m;
      this.vy[c] = (this.vy[c] ?? 0) / m + t.gravity * dt;
      const pressure = Math.max(0, m - t.restDensity) * t.stiffness;
      if (c % this.columns > 0)
        this.vx[c] = (this.vx[c] ?? 0) + ((this.mass[c - 1] ?? 0) - m) * pressure * dt * 0.015;
      if (c >= this.columns)
        this.vy[c] = (this.vy[c] ?? 0) + ((this.mass[c - this.columns] ?? 0) - m) * pressure * dt * 0.015;
      this.vx[c] = (this.vx[c] ?? 0) * (1 - t.viscosity * 0.08);
      this.vy[c] = (this.vy[c] ?? 0) * (1 - t.viscosity * 0.08);
    }
    for (let i = 0; i < this.count; i++) {
      const o = i * 2, c = this.cellIndex(this.world.positions[o] ?? 0, this.world.positions[o + 1] ?? 0), picX = this.vx[c] ?? 0, picY = this.vy[c] ?? 0, deltaX = picX - (this.oldVx[c] ?? picX), deltaY = picY - (this.oldVy[c] ?? picY), flip = Math.max(0, Math.min(1, t.flipness));
      this.world.velocities[o] = picX * (1 - flip) + ((this.world.velocities[o] ?? 0) + deltaX) * flip;
      this.world.velocities[o + 1] = picY * (1 - flip) + ((this.world.velocities[o + 1] ?? 0) + deltaY) * flip;
      this.world.positions[o] = (this.world.positions[o] ?? 0) + (this.world.velocities[o] ?? 0) * dt;
      this.world.positions[o + 1] = (this.world.positions[o + 1] ?? 0) + (this.world.velocities[o + 1] ?? 0) * dt;
      this.bound(i, width, height);
      this.collide(i);
      this.foam[i] = Math.min(1, Math.hypot(this.world.velocities[o] ?? 0, this.world.velocities[o + 1] ?? 0) / 1200);
    }
    this.oldVx.set(this.vx);
    this.oldVy.set(this.vy);
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
    }
  }
  private cellIndex(x: number, y: number) {
    return Math.max(0, Math.min(this.mass.length - 1, Math.floor(y / this.cell) * this.columns + Math.max(0, Math.min(this.columns - 1, Math.floor(x / this.cell)))));
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
