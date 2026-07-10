export interface PhysicsBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CircleBodyOptions {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
  readonly mass?: number;
  readonly restitution?: number;
  readonly friction?: number;
  readonly static?: boolean;
}

export interface CircleBody {
  readonly id: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  readonly inverseMass: number;
  restitution: number;
  friction: number;
}

export interface PhysicsWorld2DOptions {
  readonly gravityY?: number;
  readonly solverIterations?: number;
  readonly cellSize?: number;
  readonly bounds?: PhysicsBounds;
  readonly boundaryRestitution?: number;
  readonly substeps?: number;
  readonly collisionSoftness?: number;
  readonly maxPairPush?: number;
  readonly impactBounceThreshold?: number;
  readonly openTop?: boolean;
}

export class PhysicsWorld2D {
  private readonly bodies = new Map<number, CircleBody>();
  private nextId = 1;
  private gravityY: number;
  private solverIterations: number;
  private readonly cellSize: number;
  private bounds: PhysicsBounds | undefined;
  private boundaryRestitution: number;
  private substeps: number;
  private collisionSoftness: number;
  private maxPairPush: number;
  private impactBounceThreshold: number;
  private openTop: boolean;

  constructor(options: PhysicsWorld2DOptions = {}) {
    this.gravityY = options.gravityY ?? 980;
    this.solverIterations = positiveInteger(options.solverIterations ?? 3, 'Solver iterations');
    this.cellSize = positiveFinite(options.cellSize ?? 32, 'Cell size');
    this.bounds = options.bounds;
    this.boundaryRestitution = unitInterval(options.boundaryRestitution ?? 0.16, 'Boundary restitution');
    this.substeps = positiveInteger(options.substeps ?? 1, 'Physics substeps');
    this.collisionSoftness = positiveFinite(options.collisionSoftness ?? 0.85, 'Collision softness');
    this.maxPairPush = positiveFinite(options.maxPairPush ?? 0.75, 'Maximum pair push');
    this.impactBounceThreshold = nonNegativeFinite(options.impactBounceThreshold ?? 0, 'Impact bounce threshold');
    this.openTop = options.openTop ?? false;
    if (this.bounds) validateBounds(this.bounds);
  }

  get bodyCount(): number {
    return this.bodies.size;
  }

  createCircle(options: CircleBodyOptions): CircleBody {
    validateBodyOptions(options);
    const mass = options.static === true ? Infinity : options.mass ?? 1;
    const body: CircleBody = {
      id: this.nextId,
      x: options.x,
      y: options.y,
      velocityX: options.velocityX ?? 0,
      velocityY: options.velocityY ?? 0,
      radius: options.radius,
      inverseMass: mass === Infinity ? 0 : 1 / mass,
      restitution: unitInterval(options.restitution ?? 0.15, 'Body restitution'),
      friction: bounded(options.friction ?? 0.72, 0, 2, 'Body friction'),
    };
    this.nextId += 1;
    this.bodies.set(body.id, body);
    return body;
  }

  remove(body: CircleBody): boolean {
    return this.bodies.delete(body.id);
  }

  clear(): void {
    this.bodies.clear();
  }

  setBounds(bounds: PhysicsBounds | undefined): void {
    if (bounds) validateBounds(bounds);
    this.bounds = bounds;
  }

  configure(options: Omit<PhysicsWorld2DOptions, 'cellSize' | 'bounds'>): void {
    if (options.gravityY !== undefined) this.gravityY = finite(options.gravityY, 'Gravity');
    if (options.solverIterations !== undefined) this.solverIterations = positiveInteger(options.solverIterations, 'Solver iterations');
    if (options.boundaryRestitution !== undefined) this.boundaryRestitution = unitInterval(options.boundaryRestitution, 'Boundary restitution');
    if (options.substeps !== undefined) this.substeps = positiveInteger(options.substeps, 'Physics substeps');
    if (options.collisionSoftness !== undefined) this.collisionSoftness = positiveFinite(options.collisionSoftness, 'Collision softness');
    if (options.maxPairPush !== undefined) this.maxPairPush = positiveFinite(options.maxPairPush, 'Maximum pair push');
    if (options.impactBounceThreshold !== undefined) this.impactBounceThreshold = nonNegativeFinite(options.impactBounceThreshold, 'Impact bounce threshold');
    if (options.openTop !== undefined) this.openTop = options.openTop;
  }

  values(): readonly CircleBody[] {
    return [...this.bodies.values()].sort((left, right) => left.id - right.id);
  }

  step(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Physics delta must be non-negative and finite');
    if (deltaSeconds === 0) return;
    const stepDelta = deltaSeconds / this.substeps;
    for (let substep = 0; substep < this.substeps; substep += 1) this.runSubstep(stepDelta);
  }

  private runSubstep(deltaSeconds: number): void {
    const bodies = this.values();
    for (const body of bodies) {
      if (body.inverseMass === 0) continue;
      body.velocityY += this.gravityY * deltaSeconds;
      body.x += body.velocityX * deltaSeconds;
      body.y += body.velocityY * deltaSeconds;
    }
    for (let iteration = 0; iteration < this.solverIterations; iteration += 1) {
      for (const [left, right] of this.pairs(bodies)) {
        resolveCircleContact(left, right, this.collisionSoftness, this.maxPairPush, this.impactBounceThreshold);
      }
      if (this.bounds) for (const body of bodies) this.resolveBounds(body);
    }
  }

  private pairs(bodies: readonly CircleBody[]): readonly [CircleBody, CircleBody][] {
    const cells = new Map<string, CircleBody[]>();
    for (const body of bodies) {
      const minX = Math.floor((body.x - body.radius) / this.cellSize);
      const maxX = Math.floor((body.x + body.radius) / this.cellSize);
      const minY = Math.floor((body.y - body.radius) / this.cellSize);
      const maxY = Math.floor((body.y + body.radius) / this.cellSize);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = `${x}:${y}`;
          const cell = cells.get(key) ?? [];
          cell.push(body);
          cells.set(key, cell);
        }
      }
    }
    const seen = new Set<string>();
    const pairs: Array<[CircleBody, CircleBody]> = [];
    for (const cell of cells.values()) {
      for (let first = 0; first < cell.length; first += 1) {
        const left = cell[first];
        if (!left) continue;
        for (let second = first + 1; second < cell.length; second += 1) {
          const right = cell[second];
          if (!right) continue;
          const key = left.id < right.id ? `${left.id}:${right.id}` : `${right.id}:${left.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push(left.id < right.id ? [left, right] : [right, left]);
        }
      }
    }
    pairs.sort((left, right) => left[0].id - right[0].id || left[1].id - right[1].id);
    return pairs;
  }

  private resolveBounds(body: CircleBody): void {
    if (body.inverseMass === 0 || !this.bounds) return;
    const { left, top, right, bottom } = this.bounds;
    if (body.x - body.radius < left) {
      body.x = left + body.radius;
      body.velocityX = Math.abs(body.velocityX) * this.boundaryRestitution;
    } else if (body.x + body.radius > right) {
      body.x = right - body.radius;
      body.velocityX = -Math.abs(body.velocityX) * this.boundaryRestitution;
    }
    if (!this.openTop && body.y - body.radius < top) {
      body.y = top + body.radius;
      body.velocityY = Math.abs(body.velocityY) * this.boundaryRestitution;
    } else if (body.y + body.radius > bottom) {
      body.y = bottom - body.radius;
      body.velocityY = -Math.abs(body.velocityY) * this.boundaryRestitution;
    }
  }
}

function resolveCircleContact(
  left: CircleBody,
  right: CircleBody,
  collisionSoftness: number,
  maxPairPush: number,
  impactBounceThreshold: number,
): void {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const target = left.radius + right.radius;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= target * target) return;
  const distance = Math.sqrt(distanceSquared);
  const normalX = distance > 1e-8 ? dx / distance : left.id < right.id ? 1 : -1;
  const normalY = distance > 1e-8 ? dy / distance : 0;
  const inverseMass = left.inverseMass + right.inverseMass;
  if (inverseMass === 0) return;
  const penetration = target - distance;
  const maximumCorrection = Math.min(left.radius, right.radius) * maxPairPush;
  const correction = Math.min(penetration * collisionSoftness, maximumCorrection) / inverseMass;
  if (left.inverseMass > 0) {
    left.x -= normalX * correction * left.inverseMass;
    left.y -= normalY * correction * left.inverseMass;
  }
  if (right.inverseMass > 0) {
    right.x += normalX * correction * right.inverseMass;
    right.y += normalY * correction * right.inverseMass;
  }
  const relativeVelocityX = right.velocityX - left.velocityX;
  const relativeVelocityY = right.velocityY - left.velocityY;
  const normalVelocity = relativeVelocityX * normalX + relativeVelocityY * normalY;
  if (normalVelocity >= 0) return;
  const restitution = -normalVelocity >= impactBounceThreshold ? Math.min(left.restitution, right.restitution) : 0;
  const impulse = -(1 + restitution) * normalVelocity / inverseMass;
  if (left.inverseMass > 0) {
    left.velocityX -= normalX * impulse * left.inverseMass;
    left.velocityY -= normalY * impulse * left.inverseMass;
  }
  if (right.inverseMass > 0) {
    right.velocityX += normalX * impulse * right.inverseMass;
    right.velocityY += normalY * impulse * right.inverseMass;
  }
  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentVelocity = relativeVelocityX * tangentX + relativeVelocityY * tangentY;
  const friction = Math.sqrt(left.friction * right.friction);
  const frictionImpulse = Math.max(-impulse * friction, Math.min(impulse * friction, -tangentVelocity / inverseMass));
  if (left.inverseMass > 0) {
    left.velocityX -= tangentX * frictionImpulse * left.inverseMass;
    left.velocityY -= tangentY * frictionImpulse * left.inverseMass;
  }
  if (right.inverseMass > 0) {
    right.velocityX += tangentX * frictionImpulse * right.inverseMass;
    right.velocityY += tangentY * frictionImpulse * right.inverseMass;
  }
}

function validateBodyOptions(options: CircleBodyOptions): void {
  for (const value of [options.x, options.y, options.radius, options.velocityX ?? 0, options.velocityY ?? 0]) {
    if (!Number.isFinite(value)) throw new Error('Circle body values must be finite');
  }
  positiveFinite(options.radius, 'Circle radius');
  if (options.mass !== undefined) positiveFinite(options.mass, 'Circle mass');
}

function validateBounds(bounds: PhysicsBounds): void {
  for (const value of [bounds.left, bounds.top, bounds.right, bounds.bottom]) {
    if (!Number.isFinite(value)) throw new Error('Physics bounds must be finite');
  }
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) throw new Error('Physics bounds must have positive area');
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite`);
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  return bounded(value, 0, Number.MAX_VALUE, label);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function unitInterval(value: number, label: string): number {
  return bounded(value, 0, 1, label);
}

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}
