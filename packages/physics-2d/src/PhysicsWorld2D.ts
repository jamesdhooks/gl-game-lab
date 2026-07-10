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
  readonly radius: number;
  readonly inverseMass: number;
  readonly restitution: number;
  readonly friction: number;
}

export interface PhysicsWorld2DOptions {
  readonly gravityY?: number;
  readonly solverIterations?: number;
  readonly cellSize?: number;
  readonly bounds?: PhysicsBounds;
  readonly boundaryRestitution?: number;
}

export class PhysicsWorld2D {
  private readonly bodies = new Map<number, CircleBody>();
  private nextId = 1;
  private readonly gravityY: number;
  private readonly solverIterations: number;
  private readonly cellSize: number;
  private readonly bounds: PhysicsBounds | undefined;
  private readonly boundaryRestitution: number;

  constructor(options: PhysicsWorld2DOptions = {}) {
    this.gravityY = options.gravityY ?? 980;
    this.solverIterations = positiveInteger(options.solverIterations ?? 3, 'Solver iterations');
    this.cellSize = positiveFinite(options.cellSize ?? 32, 'Cell size');
    this.bounds = options.bounds;
    this.boundaryRestitution = unitInterval(options.boundaryRestitution ?? 0.16, 'Boundary restitution');
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
      friction: unitInterval(options.friction ?? 0.72, 'Body friction'),
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

  values(): readonly CircleBody[] {
    return [...this.bodies.values()].sort((left, right) => left.id - right.id);
  }

  step(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Physics delta must be non-negative and finite');
    if (deltaSeconds === 0) return;
    const bodies = this.values();
    for (const body of bodies) {
      if (body.inverseMass === 0) continue;
      body.velocityY += this.gravityY * deltaSeconds;
      body.x += body.velocityX * deltaSeconds;
      body.y += body.velocityY * deltaSeconds;
    }
    for (let iteration = 0; iteration < this.solverIterations; iteration += 1) {
      for (const [left, right] of this.pairs(bodies)) resolveCircleContact(left, right);
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
    if (body.y - body.radius < top) {
      body.y = top + body.radius;
      body.velocityY = Math.abs(body.velocityY) * this.boundaryRestitution;
    } else if (body.y + body.radius > bottom) {
      body.y = bottom - body.radius;
      body.velocityY = -Math.abs(body.velocityY) * this.boundaryRestitution;
    }
  }
}

function resolveCircleContact(left: CircleBody, right: CircleBody): void {
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
  const correction = penetration / inverseMass * 0.85;
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
  const impulse = -(1 + Math.min(left.restitution, right.restitution)) * normalVelocity / inverseMass;
  if (left.inverseMass > 0) {
    left.velocityX -= normalX * impulse * left.inverseMass;
    left.velocityY -= normalY * impulse * left.inverseMass;
  }
  if (right.inverseMass > 0) {
    right.velocityX += normalX * impulse * right.inverseMass;
    right.velocityY += normalY * impulse * right.inverseMass;
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

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function unitInterval(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between zero and one`);
  return value;
}
