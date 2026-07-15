import { DenseCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
export interface WaterTankTuning {
  readonly maxParticles: number;
  readonly particleRadius: number;
  readonly gravity: number;
  readonly viscosity: number;
  readonly viscositySigma: number;
  readonly viscosityBeta: number;
  readonly fluidity: number;
  readonly supportRadiusScale: number;
  readonly restDensity: number;
  readonly stiffness: number;
  readonly nearStiffness: number;
  readonly neighborPairBudget: number;
  readonly surfaceTension: number;
  readonly collisionBounce: number;
  readonly maxFluidSpeed: number;
  readonly substeps: number;
}
export interface WaterObstacle {
  readonly kind: 'circle' | 'segment';
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly radius: number;
}
export class WaterTankModel {
  readonly world = new DenseCircleParticleWorld2D(8192, {
    maxParticles: 8192,
    gravity: 1120,
    openTop: true
  }, 8027693);
  readonly density = new Float32Array(8192);
  readonly nearDensity = new Float32Array(8192);
  readonly foam = new Float32Array(8192);
  readonly obstacles: WaterObstacle[] = [];
  private heads = new Int32Array(1);
  private readonly next = new Int32Array(8192);
  private columns = 1;
  private rows = 1;
  private cellSize = 8;
  reset(width: number, height: number, tuning: WaterTankTuning, seed = 8027693) {
    this.world.clear(seed);
    this.world.setBounds(width, height);
    this.obstacles.length = 0;
    this.configure(tuning);
  }
  configure(tuning: WaterTankTuning) {
    const fluidity = Math.max(0, Math.min(1, tuning.fluidity));
    this.world.configure({
      maxParticles: Math.max(1, Math.min(8192, Math.floor(tuning.maxParticles))),
      radius: tuning.particleRadius,
      radiusVariation: 0.08,
      gravity: tuning.gravity,
      solverIterations: 2,
      substeps: Math.max(1, Math.min(5, Math.floor(tuning.substeps))),
      collisionSoftness: 1.05 - fluidity * 0.7,
      contactRadiusScale: 1 - fluidity * 0.65,
      maxPairPush: 0.75 - fluidity * 0.35,
      contactFriction: Math.min(2, tuning.viscosity * 0.12 * (1 - fluidity * 0.65)),
      boundaryRestitution: tuning.collisionBounce,
      wallBounce: tuning.collisionBounce > 0,
      solverDamping: 0.992,
      airDrag: 0.999,
      openTop: true
    });
  }
  pour(x: number, y: number, count: number, radius: number, vx = 0, vy = 125) {
    let made = 0;
    for (let i = 0; i < count; i++) {
      const angle = randomHash(this.world.count * 13 + i * 7) * Math.PI * 2, distance = Math.sqrt(randomHash(this.world.count * 17 + i * 11)) * radius, index = this.world.addCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, {
        velocityX: vx + (randomHash(i * 19 + this.world.count) - 0.5) * 80,
        velocityY: vy + randomHash(i * 23 + this.world.count) * 120,
        colorSeed: this.world.count
      });
      if (index < 0)
        break;
      made++;
    }
    return made;
  }
  seedReservoir(width: number, height: number, count: number, particleRadius: number) {
    const spacingX = particleRadius * 2.15, spacingY = particleRadius * 2.05;
    const columns = Math.max(8, Math.floor(width * 0.84 / spacingX));
    const rows = Math.max(4, Math.ceil(count / columns));
    let made = 0;
    for (let row = 0; row < rows && made < count; row++) {
      for (let column = 0; column < columns && made < count; column++) {
        const jitterX = (randomHash(made * 13 + 17) - 0.5) * particleRadius * 0.7;
        const jitterY = (randomHash(made * 23 + 29) - 0.5) * particleRadius * 0.4;
        const index = this.world.addCircle(width * 0.08 + column * spacingX + jitterX, height * 0.92 - row * spacingY + jitterY, {
          velocityX: 0,
          velocityY: 0,
          colorSeed: row / Math.max(1, rows)
        });
        if (index < 0) return made;
        made++;
      }
    }
    return made;
  }
  splash(x: number, y: number, radius: number, strength: number, vx: number, vy: number) {
    const radius2 = radius * radius;
    for (let i = 0; i < this.world.count; i++) {
      const o = i * 2, dx = (this.world.positions[o] ?? 0) - x, dy = (this.world.positions[o + 1] ?? 0) - y, d2 = dx * dx + dy * dy;
      if (d2 > radius2)
        continue;
      const influence = 1 - Math.sqrt(d2) / radius;
      this.world.velocities[o] = (this.world.velocities[o] ?? 0) + (vx * 0.04 + dx / Math.max(1, Math.sqrt(d2)) * strength * 16) * influence;
      this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) + (vy * 0.04 + dy / Math.max(1, Math.sqrt(d2)) * strength * 16) * influence;
    }
  }
  addCircle(x: number, y: number, radius: number) {
    this.obstacles.push({
      kind: 'circle',
      ax: x,
      ay: y,
      bx: x,
      by: y,
      radius
    });
  }
  addSegment(ax: number, ay: number, bx: number, by: number, radius: number) {
    this.obstacles.push({
      kind: 'segment',
      ax,
      ay,
      bx,
      by,
      radius
    });
  }
  seedObstacles(width: number, height: number, ramps: number, pegs: number, radius: number, seed: number) {
    this.obstacles.push(...createWaterTankObstacleLayout(width, height, ramps, pegs, radius, seed));
  }
  step(dt: number, width: number, height: number, tuning: WaterTankTuning) {
    this.world.setBounds(width, height);
    this.configure(tuning);
    this.world.step(dt);
    this.relax(dt, width, height, tuning);
    this.solveObstacles(tuning.collisionBounce);
    this.projectSolidBounds(width, height, tuning.collisionBounce);
    for (let i = 0; i < this.world.count; i++) {
      const o = i * 2, speed = Math.hypot(this.world.velocities[o] ?? 0, this.world.velocities[o + 1] ?? 0);
      if (speed > tuning.maxFluidSpeed) {
        const scale = tuning.maxFluidSpeed / speed;
        this.world.velocities[o] = (this.world.velocities[o] ?? 0) * scale;
        this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) * scale;
      }
      this.foam[i] = Math.min(1, speed / Math.max(1, tuning.maxFluidSpeed) * 1.8 + (this.nearDensity[i] ?? 0) * 0.08);
    }
  }
  get count() {
    return this.world.count;
  }
  packSegments() {
    const lines = this.obstacles.filter(obstacle => obstacle.kind === 'segment'), segments = new Float32Array(lines.length * 4), styles = new Float32Array(lines.length * 2);
    lines.forEach((line, i) => {
      segments.set([
        line.ax,
        line.ay,
        line.bx,
        line.by
      ], i * 4);
      styles[i * 2] = line.radius;
      styles[i * 2 + 1] = 0.75;
    });
    return {
      count: lines.length,
      segments,
      styles
    };
  }
  packPegs() {
    const pegs = this.obstacles.filter(obstacle => obstacle.kind === 'circle'), positions = new Float32Array(pegs.length * 2), radii = new Float32Array(pegs.length), seeds = new Float32Array(pegs.length);
    pegs.forEach((peg, i) => {
      positions.set([
        peg.ax,
        peg.ay
      ], i * 2);
      radii[i] = peg.radius;
      seeds[i] = i;
    });
    return {
      count: pegs.length,
      positions,
      radii,
      seeds
    };
  }
  private relax(dt: number, width: number, height: number, tuning: WaterTankTuning) {
    const count = this.world.count, support = tuning.particleRadius * 2 * Math.max(1, tuning.supportRadiusScale);
    const fluidity = Math.max(0, Math.min(1, tuning.fluidity));
    const pressureRetention = 1 - fluidity * 0.4;
    this.buildGrid(width, height, support);
    this.density.fill(0, 0, count);
    this.nearDensity.fill(0, 0, count);
    let pairs = 0;
    this.forPairs(support, tuning.neighborPairBudget, (i, j, distance, q) => {
      const q2 = q * q;
      this.density[i] = (this.density[i] ?? 0) + q2;
      this.density[j] = (this.density[j] ?? 0) + q2;
      this.nearDensity[i] = (this.nearDensity[i] ?? 0) + q2 * q;
      this.nearDensity[j] = (this.nearDensity[j] ?? 0) + q2 * q;
      pairs++;
      void distance;
    });
    if (pairs === 0)
      return;
    this.forPairs(support, tuning.neighborPairBudget, (i, j, distance, q) => {
      const io = i * 2;
      const jo = j * 2;
      const dx = (this.world.positions[jo] ?? 0) - (this.world.positions[io] ?? 0);
      const dy = (this.world.positions[jo + 1] ?? 0) - (this.world.positions[io + 1] ?? 0);
      const normalizer = Math.max(0.0001, distance);
      const nx = dx / normalizer;
      const ny = dy / normalizer;
      const pressureI = tuning.stiffness * ((this.density[i] ?? 0) - tuning.restDensity);
      const pressureJ = tuning.stiffness * ((this.density[j] ?? 0) - tuning.restDensity);
      const nearDensity = (this.nearDensity[i] ?? 0) + (this.nearDensity[j] ?? 0);
      const pressure = Math.max(-0.04, Math.min(0.04, (pressureI + pressureJ) * 0.5)) * q;
      const nearPressure = Math.min(0.05, tuning.nearStiffness * nearDensity * 0.5 * q * q);
      const frameScale = Math.min(2, dt * 60);
      const maximumDisplacement = tuning.particleRadius * 0.12 * frameScale;
      const displacement = Math.max(-maximumDisplacement, Math.min(maximumDisplacement, (pressure * 4 + nearPressure * 1.5) * frameScale * pressureRetention));
      this.world.positions[io] = (this.world.positions[io] ?? 0) - nx * displacement * 0.5;
      this.world.positions[io + 1] = (this.world.positions[io + 1] ?? 0) - ny * displacement * 0.5;
      this.world.positions[jo] = (this.world.positions[jo] ?? 0) + nx * displacement * 0.5;
      this.world.positions[jo + 1] = (this.world.positions[jo + 1] ?? 0) + ny * displacement * 0.5;
      const rvx = (this.world.velocities[jo] ?? 0) - (this.world.velocities[io] ?? 0);
      const rvy = (this.world.velocities[jo + 1] ?? 0) - (this.world.velocities[io + 1] ?? 0);
      const relative = rvx * nx + rvy * ny;
      const viscosity = tuning.viscositySigma * q + tuning.viscosityBeta * q * q * Math.abs(relative);
      const visc = viscosity * relative * dt * tuning.viscosity * 0.12;
      this.world.velocities[io] = (this.world.velocities[io] ?? 0) + nx * visc * 0.5;
      this.world.velocities[io + 1] = (this.world.velocities[io + 1] ?? 0) + ny * visc * 0.5;
      this.world.velocities[jo] = (this.world.velocities[jo] ?? 0) - nx * visc * 0.5;
      this.world.velocities[jo + 1] = (this.world.velocities[jo + 1] ?? 0) - ny * visc * 0.5;
      const pressureVelocity = displacement / Math.max(0.001, dt) * 0.08;
      this.world.velocities[io] = (this.world.velocities[io] ?? 0) - nx * pressureVelocity * 0.5;
      this.world.velocities[io + 1] = (this.world.velocities[io + 1] ?? 0) - ny * pressureVelocity * 0.5;
      this.world.velocities[jo] = (this.world.velocities[jo] ?? 0) + nx * pressureVelocity * 0.5;
      this.world.velocities[jo + 1] = (this.world.velocities[jo + 1] ?? 0) + ny * pressureVelocity * 0.5;
      const settle = tuning.surfaceTension * 0.00008 * q * dt;
      this.world.velocities[io] = (this.world.velocities[io] ?? 0) + nx * settle;
      this.world.velocities[io + 1] = (this.world.velocities[io + 1] ?? 0) + ny * settle;
      this.world.velocities[jo] = (this.world.velocities[jo] ?? 0) - nx * settle;
      this.world.velocities[jo + 1] = (this.world.velocities[jo + 1] ?? 0) - ny * settle;
    });
  }
  private buildGrid(width: number, height: number, size: number) {
    this.cellSize = Math.max(2, size);
    this.columns = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    const cells = this.columns * this.rows;
    if (this.heads.length !== cells)
      this.heads = new Int32Array(cells);
    this.heads.fill(-1);
    for (let i = 0; i < this.world.count; i++) {
      const x = Math.max(0, Math.min(this.columns - 1, Math.floor((this.world.positions[i * 2] ?? 0) / this.cellSize))), y = Math.max(0, Math.min(this.rows - 1, Math.floor((this.world.positions[i * 2 + 1] ?? 0) / this.cellSize))), cell = y * this.columns + x;
      this.next[i] = this.heads[cell] ?? -1;
      this.heads[cell] = i;
    }
  }
  private forPairs(support: number, budget: number, visit: (i: number, j: number, distance: number, q: number) => void) {
    let pairs = 0;
    for (let i = 0; i < this.world.count && pairs < budget; i++) {
      const x = Math.max(0, Math.min(this.columns - 1, Math.floor((this.world.positions[i * 2] ?? 0) / this.cellSize))), y = Math.max(0, Math.min(this.rows - 1, Math.floor((this.world.positions[i * 2 + 1] ?? 0) / this.cellSize)));
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= this.columns || ny >= this.rows)
            continue;
          for (let j = this.heads[ny * this.columns + nx] ?? -1; j >= 0; j = this.next[j] ?? -1) {
            if (j <= i)
              continue;
            const dx = (this.world.positions[j * 2] ?? 0) - (this.world.positions[i * 2] ?? 0), dy = (this.world.positions[j * 2 + 1] ?? 0) - (this.world.positions[i * 2 + 1] ?? 0), distance = Math.hypot(dx, dy);
            if (distance >= support || distance < 0.0001)
              continue;
            visit(i, j, distance, 1 - distance / support);
            if (++pairs >= budget)
              return;
          }
        }
    }
  }
  private solveObstacles(bounce: number) {
    for (let i = 0; i < this.world.count; i++)
      for (const obstacle of this.obstacles) {
        const o = i * 2, px = this.world.positions[o] ?? 0, py = this.world.positions[o + 1] ?? 0, closest = obstacle.kind === 'circle' ? {
          x: obstacle.ax,
          y: obstacle.ay
        } : closestPoint(px, py, obstacle), dx = px - closest.x, dy = py - closest.y, distance = Math.hypot(dx, dy), target = (this.world.radii[i] ?? 2) + obstacle.radius;
        if (distance >= target)
          continue;
        const nx = distance > 0.001 ? dx / distance : 0, ny = distance > 0.001 ? dy / distance : -1;
        this.world.positions[o] = closest.x + nx * target;
        this.world.positions[o + 1] = closest.y + ny * target;
        const normal = (this.world.velocities[o] ?? 0) * nx + (this.world.velocities[o + 1] ?? 0) * ny;
        if (normal < 0) {
          this.world.velocities[o] = (this.world.velocities[o] ?? 0) - (1 + bounce) * normal * nx;
          this.world.velocities[o + 1] = (this.world.velocities[o + 1] ?? 0) - (1 + bounce) * normal * ny;
        }
      }
  }
  private projectSolidBounds(width: number, height: number, bounce: number) {
    for (let i = 0; i < this.world.count; i++) {
      const o = i * 2;
      const radius = this.world.radii[i] ?? 2;
      const left = radius, right = width - radius, floor = height - radius;
      if ((this.world.positions[o] ?? 0) < left) {
        this.world.positions[o] = left;
        if ((this.world.velocities[o] ?? 0) < 0) this.world.velocities[o] = 0;
      } else if ((this.world.positions[o] ?? 0) > right) {
        this.world.positions[o] = right;
        if ((this.world.velocities[o] ?? 0) > 0) this.world.velocities[o] = 0;
      }
      if ((this.world.positions[o + 1] ?? 0) <= floor) continue;
      this.world.positions[o + 1] = floor;
      const velocityY = this.world.velocities[o + 1] ?? 0;
      if (velocityY > 0) this.world.velocities[o + 1] = velocityY > 150 ? -velocityY * bounce : 0;
    }
  }
}

export function createWaterTankObstacleLayout(
  width: number,
  height: number,
  ramps: number,
  pegs: number,
  radius: number,
  seed: number,
): readonly WaterObstacle[] {
  const rampCount = Math.max(0, Math.floor(ramps));
  const pegCount = Math.max(0, Math.floor(pegs));
  const random = seededRandom(seed);
  const layout: WaterObstacle[] = [];
  const safeRadius = Math.max(1, radius);
  const clearance = Math.max(4, safeRadius * 0.3);
  const margin = safeRadius + clearance;
  const minDimension = Math.max(1, Math.min(width, height));
  const attemptLimit = 240;

  for (let index = 0; index < rampCount; index++) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const length = minDimension * (0.18 + random() * 0.16);
      const angle = (random() - 0.5) * 1.1;
      const halfX = Math.abs(Math.cos(angle) * length * 0.5);
      const halfY = Math.abs(Math.sin(angle) * length * 0.5);
      const minX = margin + halfX, maxX = width - margin - halfX;
      const minY = height * 0.2 + margin + halfY, maxY = height * 0.74 - margin - halfY;
      if (maxX <= minX || maxY <= minY) continue;
      const cx = minX + random() * (maxX - minX), cy = minY + random() * (maxY - minY);
      const dx = Math.cos(angle) * length * 0.5, dy = Math.sin(angle) * length * 0.5;
      const candidate: WaterObstacle = { kind: 'segment', ax: cx - dx, ay: cy - dy, bx: cx + dx, by: cy + dy, radius: safeRadius };
      if (layout.every(existing => !waterTankObstaclesOverlap(existing, candidate, clearance))) {
        layout.push(candidate);
        break;
      }
    }
  }

  for (let index = 0; index < pegCount; index++) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const minX = margin, maxX = width - margin;
      const minY = height * 0.2 + margin, maxY = height * 0.74 - margin;
      if (maxX <= minX || maxY <= minY) continue;
      const x = minX + random() * (maxX - minX), y = minY + random() * (maxY - minY);
      const candidate: WaterObstacle = { kind: 'circle', ax: x, ay: y, bx: x, by: y, radius: safeRadius };
      if (layout.every(existing => !waterTankObstaclesOverlap(existing, candidate, clearance))) {
        layout.push(candidate);
        break;
      }
    }
  }
  return layout;
}

export function waterTankObstacleLayoutSeed(seed: number, generation: number): number {
  let value = (seed ^ Math.imul(Math.max(0, Math.floor(generation)) + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

export function waterTankObstaclesOverlap(a: WaterObstacle, b: WaterObstacle, clearance = 0): boolean {
  const minimumDistance = a.radius + b.radius + Math.max(0, clearance);
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.ax - b.ax, a.ay - b.ay) < minimumDistance;
  if (a.kind === 'circle') return pointSegmentDistance(a.ax, a.ay, b) < minimumDistance;
  if (b.kind === 'circle') return pointSegmentDistance(b.ax, b.ay, a) < minimumDistance;
  if (segmentsIntersect(a, b)) return true;
  return Math.min(
    pointSegmentDistance(a.ax, a.ay, b),
    pointSegmentDistance(a.bx, a.by, b),
    pointSegmentDistance(b.ax, b.ay, a),
    pointSegmentDistance(b.bx, b.by, a),
  ) < minimumDistance;
}

function pointSegmentDistance(x: number, y: number, segment: WaterObstacle): number {
  const dx = segment.bx - segment.ax, dy = segment.by - segment.ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return Math.hypot(x - segment.ax, y - segment.ay);
  const t = Math.max(0, Math.min(1, ((x - segment.ax) * dx + (y - segment.ay) * dy) / lengthSquared));
  return Math.hypot(x - (segment.ax + dx * t), y - (segment.ay + dy * t));
}

function segmentsIntersect(a: WaterObstacle, b: WaterObstacle): boolean {
  const orientation = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const a1 = orientation(a.ax, a.ay, a.bx, a.by, b.ax, b.ay);
  const a2 = orientation(a.ax, a.ay, a.bx, a.by, b.bx, b.by);
  const b1 = orientation(b.ax, b.ay, b.bx, b.by, a.ax, a.ay);
  const b2 = orientation(b.ax, b.ay, b.bx, b.by, a.bx, a.by);
  return ((a1 > 0 && a2 < 0) || (a1 < 0 && a2 > 0)) && ((b1 > 0 && b2 < 0) || (b1 < 0 && b2 > 0));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}
function closestPoint(x: number, y: number, line: WaterObstacle) {
  const dx = line.bx - line.ax, dy = line.by - line.ay, length = dx * dx + dy * dy, t = length <= 0.001 ? 0 : Math.max(0, Math.min(1, ((x - line.ax) * dx + (y - line.ay) * dy) / length));
  return {
    x: line.ax + dx * t,
    y: line.ay + dy * t
  };
}
function randomHash(value: number) {
  return Math.abs(Math.sin(value * 12.9898) * 43758.5453) % 1;
}
