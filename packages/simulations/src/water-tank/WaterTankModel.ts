import { DenseCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
export interface WaterTankTuning {
  readonly maxParticles: number;
  readonly particleRadius: number;
  readonly gravity: number;
  readonly viscosity: number;
  readonly viscositySigma: number;
  readonly viscosityBeta: number;
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
    this.world.configure({
      maxParticles: Math.max(1, Math.min(8192, Math.floor(tuning.maxParticles))),
      radius: tuning.particleRadius,
      radiusVariation: 0.08,
      gravity: tuning.gravity,
      solverIterations: 2,
      substeps: Math.max(1, Math.min(5, Math.floor(tuning.substeps))),
      collisionSoftness: Math.min(1.5, 0.68 + tuning.nearStiffness * 0.18),
      contactFriction: Math.min(2, tuning.viscosity * 0.12),
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
  seedObstacles(width: number, height: number, ramps: number, pegs: number, radius: number) {
    for (let i = 0; i < pegs; i++)
      this.addCircle(width * (0.28 + (i % 3) * 0.22), height * (0.36 + Math.floor(i / 3) * 0.18), radius);
    for (let i = 0; i < ramps; i++) {
      const left = i % 2 === 0, y = height * (0.3 + i * 0.12);
      this.addSegment(width * (left ? 0.14 : 0.86), y, width * (left ? 0.48 : 0.52), y + height * 0.08, radius);
    }
  }
  step(dt: number, width: number, height: number, tuning: WaterTankTuning) {
    this.world.setBounds(width, height);
    this.configure(tuning);
    this.world.step(dt);
    this.relax(dt, width, height, tuning);
    this.solveObstacles(tuning.collisionBounce);
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
      const near = tuning.nearStiffness * nearDensity * 0.5;
      const pressure = Math.max(-0.02, (pressureI + pressureJ) * 0.5) * q;
      const displacement = (pressure + near * q * q) * dt * dt * 55;
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
      const settle = tuning.surfaceTension * 0.000004 * q * dt;
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
