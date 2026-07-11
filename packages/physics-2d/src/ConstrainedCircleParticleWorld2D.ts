import { DenseCircleParticleWorld2D, type DenseCircleParticleOptions, type DenseCircleParticleSettings, type DenseCircleParticleStats } from './DenseCircleParticleWorld2D.js';

export interface DistanceConstraintOptions { readonly restLength?: number; readonly stiffness?: number }
export interface ConstrainedCircleParticleStats extends DenseCircleParticleStats { readonly constraintCount: number }

/** Dense circle collisions augmented with reusable position-based distance links. */
export class ConstrainedCircleParticleWorld2D {
  readonly particles: DenseCircleParticleWorld2D;
  private readonly left: Int32Array;
  private readonly right: Int32Array;
  private readonly rest: Float32Array;
  private readonly stiffness: Float32Array;
  private activeConstraints = 0;
  private constraintPasses = 2;

  constructor(readonly capacity: number, readonly constraintCapacity = capacity * 2, settings: Partial<DenseCircleParticleSettings> = {}, seed = 0x9e3779b9) {
    if (!Number.isSafeInteger(constraintCapacity) || constraintCapacity < 1) throw new Error('Constraint capacity must be a positive integer');
    this.particles = new DenseCircleParticleWorld2D(capacity, settings, seed);
    this.left = new Int32Array(constraintCapacity);
    this.right = new Int32Array(constraintCapacity);
    this.rest = new Float32Array(constraintCapacity);
    this.stiffness = new Float32Array(constraintCapacity);
  }

  get count(): number { return this.particles.count }
  get constraintCount(): number { return this.activeConstraints }
  get positions(): Float32Array { return this.particles.positions }
  get velocities(): Float32Array { return this.particles.velocities }
  get radii(): Float32Array { return this.particles.radii }
  get inverseMasses(): Float32Array { return this.particles.inverseMasses }
  get colorSeeds(): Float32Array { return this.particles.colorSeeds }

  configure(settings: Partial<DenseCircleParticleSettings> & { readonly constraintPasses?: number }): void {
    const { constraintPasses, ...particleSettings } = settings;
    this.particles.configure(particleSettings);
    if (constraintPasses !== undefined) {
      if (!Number.isSafeInteger(constraintPasses) || constraintPasses < 1 || constraintPasses > 16) throw new Error('Constraint passes must be an integer between 1 and 16');
      this.constraintPasses = constraintPasses;
    }
  }

  setBounds(width: number, height: number): void { this.particles.setBounds(width, height) }
  addCircle(x: number, y: number, options: DenseCircleParticleOptions = {}): number { return this.particles.addCircle(x, y, options) }
  clear(seed?: number): void { this.particles.clear(seed); this.activeConstraints = 0 }
  pickNearby(x: number, y: number, radius: number, target: Int32Array): number { return this.particles.pickNearby(x, y, radius, target) }
  dragPicked(indices: Int32Array, count: number, x: number, y: number, dt: number): void { this.particles.dragPicked(indices, count, x, y, dt) }

  addDistanceConstraint(a: number, b: number, options: DistanceConstraintOptions = {}): number {
    if (a < 0 || b < 0 || a >= this.count || b >= this.count || a === b) throw new Error('Constraint endpoints must be distinct active particles');
    if (this.activeConstraints >= this.constraintCapacity) return -1;
    const dx = (this.positions[b * 2] ?? 0) - (this.positions[a * 2] ?? 0), dy = (this.positions[b * 2 + 1] ?? 0) - (this.positions[a * 2 + 1] ?? 0);
    const index = this.activeConstraints++;
    this.left[index] = a; this.right[index] = b;
    this.rest[index] = positive(options.restLength ?? Math.hypot(dx, dy), 'Constraint rest length');
    this.stiffness[index] = bounded(options.stiffness ?? .92, 0, 1, 'Constraint stiffness');
    return index;
  }

  step(deltaSeconds: number): ConstrainedCircleParticleStats {
    const base = this.particles.step(deltaSeconds);
    const dt = Math.max(1 / 240, Math.min(1 / 30, deltaSeconds));
    for (let pass = 0; pass < this.constraintPasses; pass += 1) this.solveLinks(dt);
    return Object.freeze({ ...base, constraintCount: this.activeConstraints });
  }

  packSegments(): { readonly count: number; readonly segments: Float32Array; readonly styles: Float32Array } {
    const segments = new Float32Array(this.activeConstraints * 4), styles = new Float32Array(this.activeConstraints * 2);
    for (let i = 0; i < this.activeConstraints; i += 1) {
      const a = (this.left[i] ?? 0) * 2, b = (this.right[i] ?? 0) * 2, offset = i * 4;
      segments[offset] = this.positions[a] ?? 0; segments[offset + 1] = this.positions[a + 1] ?? 0;
      segments[offset + 2] = this.positions[b] ?? 0; segments[offset + 3] = this.positions[b + 1] ?? 0;
      styles[i * 2] = Math.max(this.radii[this.left[i] ?? 0] ?? 1, this.radii[this.right[i] ?? 0] ?? 1);
      styles[i * 2 + 1] = .8 + ((this.left[i] ?? 0) % 7) / 18;
    }
    return { count: this.activeConstraints, segments, styles };
  }

  private solveLinks(dt: number): void {
    for (let i = 0; i < this.activeConstraints; i += 1) {
      const a = this.left[i] ?? 0, b = this.right[i] ?? 0, ao = a * 2, bo = b * 2;
      let dx = (this.positions[bo] ?? 0) - (this.positions[ao] ?? 0), dy = (this.positions[bo + 1] ?? 0) - (this.positions[ao + 1] ?? 0);
      const distance = Math.max(1e-5, Math.hypot(dx, dy)), wa = this.inverseMasses[a] ?? 0, wb = this.inverseMasses[b] ?? 0, total = wa + wb;
      if (total <= 0) continue;
      dx /= distance; dy /= distance;
      const correction = (distance - (this.rest[i] ?? distance)) * (this.stiffness[i] ?? 1) / total;
      const ax = dx * correction * wa, ay = dy * correction * wa, bx = dx * correction * wb, by = dy * correction * wb;
      this.positions[ao] = (this.positions[ao] ?? 0) + ax; this.positions[ao + 1] = (this.positions[ao + 1] ?? 0) + ay;
      this.positions[bo] = (this.positions[bo] ?? 0) - bx; this.positions[bo + 1] = (this.positions[bo + 1] ?? 0) - by;
      this.velocities[ao] = (this.velocities[ao] ?? 0) + ax / dt * .08; this.velocities[ao + 1] = (this.velocities[ao + 1] ?? 0) + ay / dt * .08;
      this.velocities[bo] = (this.velocities[bo] ?? 0) - bx / dt * .08; this.velocities[bo + 1] = (this.velocities[bo + 1] ?? 0) - by / dt * .08;
    }
  }
}

function positive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`); return value }
function bounded(value: number, min: number, max: number, label: string): number { if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}`); return value }
