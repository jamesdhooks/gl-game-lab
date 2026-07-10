export interface DenseCircleParticleSettings {
  readonly maxParticles: number;
  readonly radius: number;
  readonly radiusVariation: number;
  readonly gravity: number;
  readonly solverIterations: number;
  readonly substeps: number;
  readonly wallBounce: boolean;
  readonly boundaryRestitution: number;
  readonly airDrag: number;
  readonly solverDamping: number;
  readonly collisionSoftness: number;
  readonly maxPairPush: number;
  readonly impactBounceThreshold: number;
  readonly contactFriction: number;
  readonly maxFrameDelta: number;
  readonly openTop: boolean;
}

export interface DenseCircleParticleOptions {
  readonly radius?: number;
  readonly radiusNoise?: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly inverseMass?: number;
  readonly colorSeed?: number;
}

export interface DenseCircleParticleStats {
  readonly count: number;
  readonly capacity: number;
  readonly collisionHits: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly cellSize: number;
  readonly maxVelocity: number;
  readonly awake: boolean;
  readonly settledFrames: number;
}

const DEFAULT_SETTINGS: DenseCircleParticleSettings = Object.freeze({
  maxParticles: 65_536,
  radius: 12,
  radiusVariation: 0.15,
  gravity: 1300,
  solverIterations: 3,
  substeps: 2,
  wallBounce: false,
  boundaryRestitution: 0.16,
  airDrag: 0.998,
  solverDamping: 0.982,
  collisionSoftness: 1.05,
  maxPairPush: 0.75,
  impactBounceThreshold: 150,
  contactFriction: 0.72,
  maxFrameDelta: 1 / 30,
  openTop: true,
});

/**
 * Dense, renderer-independent PBD circle storage for high-count simulations.
 * Active particles occupy the contiguous prefix of every typed array, allowing
 * renderer uploads to use subarray views without per-particle object creation.
 */
export class DenseCircleParticleWorld2D {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly previousPositions: Float32Array;
  readonly radii: Float32Array;
  readonly inverseMasses: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly radiusNoise: Float32Array;

  private readonly next: Int32Array;
  private heads = new Int32Array(1);
  private activeCells = new Int32Array(1);
  private activeCellCount = 0;
  private settings: DenseCircleParticleSettings;
  private activeCount = 0;
  private width = 1;
  private height = 1;
  private cellSize = 24;
  private inverseCellSize = 1 / 24;
  private gridColumns = 1;
  private gridRows = 1;
  private randomState: number;
  private collisionHits = 0;
  private maxVelocity = 0;
  private awake = false;
  private settledFrames = 0;

  constructor(readonly capacity: number, settings: Partial<DenseCircleParticleSettings> = {}, seed = 0x9e3779b9) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Dense particle capacity must be a positive integer');
    this.positions = new Float32Array(capacity * 2);
    this.velocities = new Float32Array(capacity * 2);
    this.previousPositions = new Float32Array(capacity * 2);
    this.radii = new Float32Array(capacity);
    this.inverseMasses = new Float32Array(capacity);
    this.colorSeeds = new Float32Array(capacity);
    this.radiusNoise = new Float32Array(capacity);
    this.next = new Int32Array(capacity);
    this.settings = normalizeSettings({ ...DEFAULT_SETTINGS, maxParticles: capacity }, settings, capacity);
    this.randomState = normalizeSeed(seed);
    this.rebuildGridShape();
  }

  get count(): number {
    return this.activeCount;
  }

  get activeSettings(): DenseCircleParticleSettings {
    return this.settings;
  }

  configure(settings: Partial<DenseCircleParticleSettings>): void {
    const previousRadius = this.settings.radius;
    const previousVariation = this.settings.radiusVariation;
    this.settings = normalizeSettings(this.settings, settings, this.capacity);
    if (this.activeCount > this.settings.maxParticles) this.activeCount = this.settings.maxParticles;
    if (previousRadius !== this.settings.radius || previousVariation !== this.settings.radiusVariation) {
      for (let index = 0; index < this.activeCount; index += 1) {
        this.radii[index] = this.radiusForNoise(this.radiusNoise[index] ?? 0);
      }
    }
    this.rebuildGridShape();
    this.wake();
  }

  setBounds(width: number, height: number): void {
    const nextWidth = positiveFinite(width, 'Dense particle world width');
    const nextHeight = positiveFinite(height, 'Dense particle world height');
    if (Math.abs(this.width - nextWidth) > 0.01 || Math.abs(this.height - nextHeight) > 0.01) this.wake();
    this.width = nextWidth;
    this.height = nextHeight;
    this.rebuildGridShape();
  }

  clear(seed?: number): void {
    this.activeCount = 0;
    this.collisionHits = 0;
    this.maxVelocity = 0;
    this.awake = false;
    this.settledFrames = 0;
    if (seed !== undefined) this.randomState = normalizeSeed(seed);
  }

  addCircle(x: number, y: number, options: DenseCircleParticleOptions = {}): number {
    if (this.activeCount >= this.settings.maxParticles || this.activeCount >= this.capacity) return -1;
    const index = this.activeCount;
    this.activeCount += 1;
    const offset = index * 2;
    const noise = clamp(options.radiusNoise ?? this.random() * 2 - 1, -1, 1);
    const radius = options.radius === undefined
      ? this.radiusForNoise(noise)
      : positiveFinite(options.radius, 'Dense particle radius');
    const px = finite(x, 'Dense particle x');
    const py = finite(y, 'Dense particle y');
    this.positions[offset] = px;
    this.positions[offset + 1] = py;
    this.previousPositions[offset] = px;
    this.previousPositions[offset + 1] = py;
    this.velocities[offset] = finite(options.velocityX ?? 0, 'Dense particle velocity x');
    this.velocities[offset + 1] = finite(options.velocityY ?? 0, 'Dense particle velocity y');
    this.radii[index] = radius;
    this.radiusNoise[index] = noise;
    this.inverseMasses[index] = nonNegativeFinite(options.inverseMass ?? 1, 'Dense particle inverse mass');
    this.colorSeeds[index] = finite(options.colorSeed ?? Math.floor(this.random() * 0x1_0000), 'Dense particle color seed');
    this.wake();
    return index;
  }

  spawnStream(count: number, x: number, y: number): number {
    const target = Math.max(0, Math.floor(count));
    let made = 0;
    for (; made < target; made += 1) {
      const radius = this.settings.radius;
      const angle = this.random() * Math.PI * 2;
      const distance = Math.sqrt(this.random()) * radius * 2.8;
      const spread = (this.random() - 0.5) * 1.25;
      const speed = 180 + 480 * this.random();
      const index = this.addCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, {
        velocityX: Math.sin(spread) * speed + (this.random() - 0.5) * 80,
        velocityY: Math.cos(spread) * speed - 180 * this.random(),
      });
      if (index < 0) break;
    }
    return made;
  }

  pickNearby(x: number, y: number, radius: number, target: Int32Array): number {
    const limitSquared = positiveFinite(radius, 'Dense particle pick radius') ** 2;
    let count = 0;
    for (let index = 0; index < this.activeCount && count < target.length; index += 1) {
      const offset = index * 2;
      const dx = floatAt(this.positions, offset) - x;
      const dy = floatAt(this.positions, offset + 1) - y;
      if (dx * dx + dy * dy <= limitSquared) {
        target[count] = index;
        count += 1;
      }
    }
    return count;
  }

  dragPicked(indices: Int32Array, count: number, x: number, y: number, deltaSeconds: number): void {
    const strength = Math.min(1, nonNegativeFinite(deltaSeconds, 'Dense particle drag delta') * 18);
    const limit = Math.min(Math.max(0, Math.floor(count)), indices.length);
    for (let entry = 0; entry < limit; entry += 1) {
      const index = indices[entry] ?? -1;
      if (index < 0 || index >= this.activeCount) continue;
      const offset = index * 2;
      this.velocities[offset] = (floatAt(this.velocities, offset) + (x - floatAt(this.positions, offset)) * strength) * 0.84;
      this.velocities[offset + 1] = (floatAt(this.velocities, offset + 1) + (y - floatAt(this.positions, offset + 1)) * strength) * 0.84;
    }
    if (limit > 0) this.wake();
  }

  applyExplosion(x: number, y: number, radius: number, force: number): void {
    const blastRadius = positiveFinite(radius, 'Dense particle explosion radius');
    const strength = nonNegativeFinite(force, 'Dense particle explosion force');
    let affected = false;
    for (let index = 0; index < this.activeCount; index += 1) {
      const offset = index * 2;
      const dx = floatAt(this.positions, offset) - x;
      const dy = floatAt(this.positions, offset + 1) - y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-6 || distance > blastRadius) continue;
      const falloff = 1 - distance / blastRadius;
      const impulse = strength * falloff * falloff;
      this.velocities[offset] = floatAt(this.velocities, offset) + dx / distance * impulse;
      this.velocities[offset + 1] = floatAt(this.velocities, offset + 1) + dy / distance * impulse;
      affected = true;
    }
    if (affected) this.wake();
  }

  removeBelow(y: number): number {
    const threshold = finite(y, 'Dense particle removal threshold');
    let write = 0;
    for (let read = 0; read < this.activeCount; read += 1) {
      if (floatAt(this.positions, read * 2 + 1) > threshold) continue;
      if (write !== read) this.copyParticle(read, write);
      write += 1;
    }
    const removed = this.activeCount - write;
    this.activeCount = write;
    if (removed > 0) this.wake();
    return removed;
  }

  step(deltaSeconds: number): DenseCircleParticleStats {
    const frameDelta = Math.min(this.settings.maxFrameDelta, nonNegativeFinite(deltaSeconds, 'Dense particle delta'));
    if (frameDelta === 0 || this.activeCount === 0 || !this.awake) return this.stats();
    const stepDelta = frameDelta / this.settings.substeps;
    this.collisionHits = 0;
    this.maxVelocity = 0;
    for (let substep = 0; substep < this.settings.substeps; substep += 1) {
      this.integrate(stepDelta);
      this.projectBounds(stepDelta);
      for (let pass = 0; pass < this.settings.solverIterations; pass += 1) {
        this.buildGrid();
        const passFraction = pass / Math.max(1, this.settings.solverIterations - 1);
        const relaxation = 0.76 - 0.16 * passFraction;
        const hits = this.solveGrid(stepDelta, relaxation);
        this.projectBounds(stepDelta);
        if (hits === 0) break;
      }
      this.syncVelocities(stepDelta);
    }
    if (this.maxVelocity < 8) {
      this.settledFrames += 1;
      if (this.settledFrames > 50) this.awake = false;
    } else {
      this.settledFrames = 0;
    }
    return this.stats();
  }

  getStats(): DenseCircleParticleStats {
    return this.stats();
  }

  private integrate(deltaSeconds: number): void {
    for (let index = 0; index < this.activeCount; index += 1) {
      if (floatAt(this.inverseMasses, index) <= 0) continue;
      const offset = index * 2;
      this.previousPositions[offset] = floatAt(this.positions, offset);
      this.previousPositions[offset + 1] = floatAt(this.positions, offset + 1);
      this.velocities[offset + 1] = floatAt(this.velocities, offset + 1) + this.settings.gravity * deltaSeconds;
      this.positions[offset] = floatAt(this.positions, offset) + floatAt(this.velocities, offset) * deltaSeconds;
      this.positions[offset + 1] = floatAt(this.positions, offset + 1) + floatAt(this.velocities, offset + 1) * deltaSeconds;
    }
  }

  private projectBounds(deltaSeconds: number): void {
    const restitution = this.settings.wallBounce ? this.settings.boundaryRestitution : 0;
    for (let index = 0; index < this.activeCount; index += 1) {
      if (floatAt(this.inverseMasses, index) <= 0) continue;
      const offset = index * 2;
      const radius = this.radii[index] ?? this.settings.radius;
      if (floatAt(this.positions, offset) < radius) {
        this.positions[offset] = radius;
        if (floatAt(this.velocities, offset) < 0) this.previousPositions[offset] = radius - Math.abs(floatAt(this.velocities, offset)) * deltaSeconds * restitution;
      } else if (floatAt(this.positions, offset) > this.width - radius) {
        this.positions[offset] = this.width - radius;
        if (floatAt(this.velocities, offset) > 0) this.previousPositions[offset] = floatAt(this.positions, offset) + Math.abs(floatAt(this.velocities, offset)) * deltaSeconds * restitution;
      }
      if (!this.settings.openTop && floatAt(this.positions, offset + 1) < radius) {
        this.positions[offset + 1] = radius;
        if (floatAt(this.velocities, offset + 1) < 0) this.previousPositions[offset + 1] = radius - Math.abs(floatAt(this.velocities, offset + 1)) * deltaSeconds * restitution;
      } else if (floatAt(this.positions, offset + 1) > this.height - radius) {
        this.positions[offset + 1] = this.height - radius;
        if (floatAt(this.velocities, offset + 1) > 0) this.previousPositions[offset + 1] = floatAt(this.positions, offset + 1) + Math.abs(floatAt(this.velocities, offset + 1)) * deltaSeconds * restitution;
      }
    }
  }

  private buildGrid(): void {
    for (let index = 0; index < this.activeCellCount; index += 1) {
      const cell = this.activeCells[index] ?? -1;
      if (cell >= 0) this.heads[cell] = -1;
    }
    this.activeCellCount = 0;
    for (let index = 0; index < this.activeCount; index += 1) {
      const offset = index * 2;
      const x = clamp(Math.floor(floatAt(this.positions, offset) * this.inverseCellSize), 0, this.gridColumns - 1);
      const y = clamp(Math.floor(floatAt(this.positions, offset + 1) * this.inverseCellSize), 0, this.gridRows - 1);
      const cell = y * this.gridColumns + x;
      if ((this.heads[cell] ?? -1) === -1) {
        this.activeCells[this.activeCellCount] = cell;
        this.activeCellCount += 1;
      }
      this.next[index] = this.heads[cell] ?? -1;
      this.heads[cell] = index;
    }
  }

  private solveGrid(deltaSeconds: number, relaxation: number): number {
    const initialHits = this.collisionHits;
    for (let index = 0; index < this.activeCellCount; index += 1) {
      const cell = this.activeCells[index] ?? -1;
      if (cell < 0) continue;
      const x = cell % this.gridColumns;
      const y = Math.floor(cell / this.gridColumns);
      this.solveSelfCell(cell, deltaSeconds, relaxation);
      if (x + 1 < this.gridColumns) this.solveCellPair(cell, cell + 1, deltaSeconds, relaxation);
      if (y + 1 < this.gridRows) {
        const nextRow = cell + this.gridColumns;
        this.solveCellPair(cell, nextRow, deltaSeconds, relaxation);
        if (x > 0) this.solveCellPair(cell, nextRow - 1, deltaSeconds, relaxation);
        if (x + 1 < this.gridColumns) this.solveCellPair(cell, nextRow + 1, deltaSeconds, relaxation);
      }
    }
    return this.collisionHits - initialHits;
  }

  private solveSelfCell(cell: number, deltaSeconds: number, relaxation: number): void {
    for (let left = this.heads[cell] ?? -1; left !== -1; left = this.next[left] ?? -1) {
      for (let right = this.next[left] ?? -1; right !== -1; right = this.next[right] ?? -1) {
        this.solvePair(left, right, deltaSeconds, relaxation);
      }
    }
  }

  private solveCellPair(leftCell: number, rightCell: number, deltaSeconds: number, relaxation: number): void {
    for (let left = this.heads[leftCell] ?? -1; left !== -1; left = this.next[left] ?? -1) {
      for (let right = this.heads[rightCell] ?? -1; right !== -1; right = this.next[right] ?? -1) {
        this.solvePair(left, right, deltaSeconds, relaxation);
      }
    }
  }

  private solvePair(left: number, right: number, deltaSeconds: number, relaxation: number): void {
    const leftOffset = left * 2;
    const rightOffset = right * 2;
    let dx = floatAt(this.positions, rightOffset) - floatAt(this.positions, leftOffset);
    let dy = floatAt(this.positions, rightOffset + 1) - floatAt(this.positions, leftOffset + 1);
    const target = (this.radii[left] ?? 0) + (this.radii[right] ?? 0);
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= target * target) return;
    let distance = Math.sqrt(Math.max(distanceSquared, 1e-12));
    if (distance < 1e-6) {
      const angle = ((left + 1) * 12.9898 + (right + 1) * 78.233) % (Math.PI * 2);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      distance = 1;
    } else {
      dx /= distance;
      dy /= distance;
    }
    const leftWeight = this.inverseMasses[left] ?? 0;
    const rightWeight = this.inverseMasses[right] ?? 0;
    const totalWeight = leftWeight + rightWeight;
    if (totalWeight <= 0) return;
    const penetration = target - distance;
    const maximum = target * 0.5 * this.settings.maxPairPush;
    const correction = Math.min(penetration * this.settings.collisionSoftness * relaxation, maximum) / totalWeight;
    this.positions[leftOffset] = floatAt(this.positions, leftOffset) - dx * correction * leftWeight;
    this.positions[leftOffset + 1] = floatAt(this.positions, leftOffset + 1) - dy * correction * leftWeight;
    this.positions[rightOffset] = floatAt(this.positions, rightOffset) + dx * correction * rightWeight;
    this.positions[rightOffset + 1] = floatAt(this.positions, rightOffset + 1) + dy * correction * rightWeight;
    this.applyContactResponse(leftOffset, rightOffset, dx, dy, leftWeight, rightWeight, totalWeight, deltaSeconds);
    this.collisionHits += 1;
  }

  private applyContactResponse(
    leftOffset: number,
    rightOffset: number,
    normalX: number,
    normalY: number,
    leftWeight: number,
    rightWeight: number,
    totalWeight: number,
    deltaSeconds: number,
  ): void {
    const leftDx = floatAt(this.positions, leftOffset) - floatAt(this.previousPositions, leftOffset);
    const leftDy = floatAt(this.positions, leftOffset + 1) - floatAt(this.previousPositions, leftOffset + 1);
    const rightDx = floatAt(this.positions, rightOffset) - floatAt(this.previousPositions, rightOffset);
    const rightDy = floatAt(this.positions, rightOffset + 1) - floatAt(this.previousPositions, rightOffset + 1);
    const relativeNormal = (rightDx - leftDx) * normalX + (rightDy - leftDy) * normalY;
    const impactSpeed = Math.max(0, -relativeNormal / Math.max(1e-6, deltaSeconds));
    if (this.settings.wallBounce && impactSpeed >= this.settings.impactBounceThreshold) {
      const bounce = -relativeNormal * this.settings.boundaryRestitution;
      const inverseWeight = 1 / totalWeight;
      this.previousPositions[leftOffset] = floatAt(this.previousPositions, leftOffset) + normalX * bounce * leftWeight * inverseWeight;
      this.previousPositions[leftOffset + 1] = floatAt(this.previousPositions, leftOffset + 1) + normalY * bounce * leftWeight * inverseWeight;
      this.previousPositions[rightOffset] = floatAt(this.previousPositions, rightOffset) - normalX * bounce * rightWeight * inverseWeight;
      this.previousPositions[rightOffset + 1] = floatAt(this.previousPositions, rightOffset + 1) - normalY * bounce * rightWeight * inverseWeight;
    }
    if (this.settings.contactFriction <= 0) return;
    const tangentX = -normalY;
    const tangentY = normalX;
    const relativeTangent = (rightDx - leftDx) * tangentX + (rightDy - leftDy) * tangentY;
    const friction = relativeTangent * Math.min(0.62, this.settings.contactFriction * 0.48) / totalWeight;
    this.previousPositions[leftOffset] = floatAt(this.previousPositions, leftOffset) - tangentX * friction * leftWeight;
    this.previousPositions[leftOffset + 1] = floatAt(this.previousPositions, leftOffset + 1) - tangentY * friction * leftWeight;
    this.previousPositions[rightOffset] = floatAt(this.previousPositions, rightOffset) + tangentX * friction * rightWeight;
    this.previousPositions[rightOffset + 1] = floatAt(this.previousPositions, rightOffset + 1) + tangentY * friction * rightWeight;
  }

  private syncVelocities(deltaSeconds: number): void {
    const damping = Math.pow(this.settings.airDrag * this.settings.solverDamping, deltaSeconds * 60);
    for (let index = 0; index < this.activeCount; index += 1) {
      if (floatAt(this.inverseMasses, index) <= 0) continue;
      const offset = index * 2;
      this.velocities[offset] = (floatAt(this.positions, offset) - floatAt(this.previousPositions, offset)) / deltaSeconds * damping;
      this.velocities[offset + 1] = (floatAt(this.positions, offset + 1) - floatAt(this.previousPositions, offset + 1)) / deltaSeconds * damping;
      this.maxVelocity = Math.max(this.maxVelocity, Math.hypot(floatAt(this.velocities, offset), floatAt(this.velocities, offset + 1)));
    }
  }

  private rebuildGridShape(): void {
    let maximumRadius = this.settings.radius * (1 + this.settings.radiusVariation);
    for (let index = 0; index < this.activeCount; index += 1) maximumRadius = Math.max(maximumRadius, this.radii[index] ?? 0);
    this.cellSize = Math.max(1, maximumRadius * 2.1);
    this.inverseCellSize = 1 / this.cellSize;
    this.gridColumns = Math.max(1, Math.ceil(this.width / this.cellSize));
    this.gridRows = Math.max(1, Math.ceil(this.height / this.cellSize));
    const cells = this.gridColumns * this.gridRows;
    if (this.heads.length !== cells) {
      this.heads = new Int32Array(cells);
      this.activeCells = new Int32Array(cells);
    }
    this.heads.fill(-1);
    this.activeCellCount = 0;
  }

  private copyParticle(source: number, target: number): void {
    const sourceOffset = source * 2;
    const targetOffset = target * 2;
    this.positions[targetOffset] = floatAt(this.positions, sourceOffset);
    this.positions[targetOffset + 1] = floatAt(this.positions, sourceOffset + 1);
    this.velocities[targetOffset] = floatAt(this.velocities, sourceOffset);
    this.velocities[targetOffset + 1] = floatAt(this.velocities, sourceOffset + 1);
    this.previousPositions[targetOffset] = floatAt(this.previousPositions, sourceOffset);
    this.previousPositions[targetOffset + 1] = floatAt(this.previousPositions, sourceOffset + 1);
    this.radii[target] = floatAt(this.radii, source);
    this.inverseMasses[target] = floatAt(this.inverseMasses, source);
    this.colorSeeds[target] = floatAt(this.colorSeeds, source);
    this.radiusNoise[target] = floatAt(this.radiusNoise, source);
  }

  private radiusForNoise(noise: number): number {
    return this.settings.radius * (1 + clamp(noise, -1, 1) * this.settings.radiusVariation);
  }

  private stats(): DenseCircleParticleStats {
    return {
      count: this.activeCount,
      capacity: this.capacity,
      collisionHits: this.collisionHits,
      gridColumns: this.gridColumns,
      gridRows: this.gridRows,
      cellSize: this.cellSize,
      maxVelocity: this.maxVelocity,
      awake: this.awake,
      settledFrames: this.settledFrames,
    };
  }

  private random(): number {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 0x1_0000_0000;
  }

  private wake(): void {
    this.awake = this.activeCount > 0;
    this.settledFrames = 0;
  }
}

function normalizeSettings(
  current: DenseCircleParticleSettings,
  updates: Partial<DenseCircleParticleSettings>,
  capacity: number,
): DenseCircleParticleSettings {
  return Object.freeze({
    maxParticles: integerBetween(updates.maxParticles ?? current.maxParticles, 1, capacity, 'Dense maximum particles'),
    radius: positiveFinite(updates.radius ?? current.radius, 'Dense particle radius'),
    radiusVariation: bounded(updates.radiusVariation ?? current.radiusVariation, 0, 1, 'Dense radius variation'),
    gravity: finite(updates.gravity ?? current.gravity, 'Dense particle gravity'),
    solverIterations: integerBetween(updates.solverIterations ?? current.solverIterations, 1, 16, 'Dense solver iterations'),
    substeps: integerBetween(updates.substeps ?? current.substeps, 1, 8, 'Dense substeps'),
    wallBounce: updates.wallBounce ?? current.wallBounce,
    boundaryRestitution: bounded(updates.boundaryRestitution ?? current.boundaryRestitution, 0, 1, 'Dense boundary restitution'),
    airDrag: bounded(updates.airDrag ?? current.airDrag, 0, 1, 'Dense air drag'),
    solverDamping: bounded(updates.solverDamping ?? current.solverDamping, 0, 1, 'Dense solver damping'),
    collisionSoftness: bounded(updates.collisionSoftness ?? current.collisionSoftness, 0.05, 1.5, 'Dense collision softness'),
    maxPairPush: bounded(updates.maxPairPush ?? current.maxPairPush, 0.02, 2, 'Dense maximum pair push'),
    impactBounceThreshold: nonNegativeFinite(updates.impactBounceThreshold ?? current.impactBounceThreshold, 'Dense impact threshold'),
    contactFriction: bounded(updates.contactFriction ?? current.contactFriction, 0, 2, 'Dense contact friction'),
    maxFrameDelta: bounded(updates.maxFrameDelta ?? current.maxFrameDelta, 1 / 240, 1 / 10, 'Dense maximum frame delta'),
    openTop: updates.openTop ?? current.openTop,
  });
}

function normalizeSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) throw new Error('Dense particle seed must be a safe integer');
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x9e3779b9 : normalized;
}

function integerBetween(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  return value;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite`);
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative and finite`);
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function floatAt(array: Float32Array, index: number): number {
  return array[index] ?? 0;
}
