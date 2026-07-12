import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
export interface SoftBody {
  readonly indices: readonly number[];
  restArea: number;
  readonly seed: number;
}
export interface SoftBodyTuning {
  readonly squishiness: number;
  readonly surfaceTension: number;
  readonly areaPressure: number;
  readonly plasticFlow: number;
  readonly boundaryElasticity: number;
}
export class SoftBodyModel {
  readonly world = new ConstrainedCircleParticleWorld2D(65536, 196608, {}, 100118795);
  readonly bodies: SoftBody[] = [];
  private nextSeed = 1;
  reset(width: number, height: number, seed = 100118795) {
    this.world.clear(seed);
    this.world.setBounds(width, height);
    this.bodies.length = 0;
    this.nextSeed = 1;
  }
  addBlob(centerX: number, centerY: number, size: number, density: number, outline?: readonly {
    readonly x: number;
    readonly y: number;
  }[]): SoftBody | undefined {
    const points = outline && outline.length >= 8 ? [
      ...outline
    ] : circle(centerX, centerY, size, Math.max(12, Math.min(112, Math.round(Math.PI * 2 * size / (Math.max(3, size * 0.12) / density)))));
    if (points.length < 8)
      return;
    const radius = Math.max(2.2, Math.min(10, size * Math.PI / points.length * 0.56)), indices: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point)
        continue;
      const index = this.world.addCircle(point.x, point.y, {
        radius,
        velocityX: (Math.sin(i * 12.31 + this.nextSeed) - 0.5) * 18,
        velocityY: 0,
        colorSeed: this.nextSeed
      });
      if (index < 0)
        return;
      indices.push(index);
    }
    if (indices.length < 8)
      return;
    for (let i = 0; i < indices.length; i += 1) {
      this.world.addDistanceConstraint(indices[i] ?? 0, indices[(i + 1) % indices.length] ?? 0, {
        stiffness: 0.72
      });
      this.world.addDistanceConstraint(indices[i] ?? 0, indices[(i + 2) % indices.length] ?? 0, {
        stiffness: 0.16
      });
    }
    const body: SoftBody = {
      indices: Object.freeze(indices),
      restArea: Math.max(1, Math.abs(area(points))),
      seed: this.nextSeed++
    };
    this.bodies.push(body);
    return body;
  }
  addFixture(points: readonly {
    readonly x: number;
    readonly y: number;
  }[], radius: number) {
    for (const point of points)
      this.world.addCircle(point.x, point.y, {
        radius,
        inverseMass: 0,
        colorSeed: 0
      });
  }
  step(dt: number, tuning: SoftBodyTuning) {
    this.world.step(dt);
    for (let pass = 0; pass < 3; pass += 1)
      for (const body of this.bodies)
        this.solveArea(body, dt / 3, tuning);
  }
  configure(options: Parameters<ConstrainedCircleParticleWorld2D['configure']>[0]) {
    this.world.configure(options);
  }
  packMesh(): {
    readonly vertexCount: number;
    readonly positions: Float32Array;
    readonly colorSeeds: Float32Array;
  } {
    let triangles = 0;
    for (const body of this.bodies)
      triangles += body.indices.length;
    const positions = new Float32Array(triangles * 6), colorSeeds = new Float32Array(triangles * 3);
    let vertex = 0;
    for (const body of this.bodies) {
      const center = this.center(body);
      for (let i = 0; i < body.indices.length; i += 1) {
        const a = body.indices[i] ?? 0, b = body.indices[(i + 1) % body.indices.length] ?? 0, offset = vertex * 2;
        positions[offset] = center.x;
        positions[offset + 1] = center.y;
        positions[offset + 2] = this.world.positions[a * 2] ?? 0;
        positions[offset + 3] = this.world.positions[a * 2 + 1] ?? 0;
        positions[offset + 4] = this.world.positions[b * 2] ?? 0;
        positions[offset + 5] = this.world.positions[b * 2 + 1] ?? 0;
        colorSeeds.fill(body.seed, vertex, vertex + 3);
        vertex += 3;
      }
    }
    return {
      vertexCount: vertex,
      positions,
      colorSeeds
    };
  }
  packOutlines(): {
    readonly count: number;
    readonly segments: Float32Array;
    readonly styles: Float32Array;
  } {
    let count = 0;
    for (const body of this.bodies)
      count += body.indices.length;
    const segments = new Float32Array(count * 4), styles = new Float32Array(count * 2);
    let segment = 0;
    for (const body of this.bodies)
      for (let i = 0; i < body.indices.length; i += 1) {
        const a = body.indices[i] ?? 0, b = body.indices[(i + 1) % body.indices.length] ?? 0, o = segment * 4;
        segments[o] = this.world.positions[a * 2] ?? 0;
        segments[o + 1] = this.world.positions[a * 2 + 1] ?? 0;
        segments[o + 2] = this.world.positions[b * 2] ?? 0;
        segments[o + 3] = this.world.positions[b * 2 + 1] ?? 0;
        styles[segment * 2] = this.world.radii[a] ?? 3;
        styles[segment * 2 + 1] = 1;
        segment++;
      }
    return {
      count,
      segments,
      styles
    };
  }
  packVisualPoints(fillDensity: number): {
    readonly count: number;
    readonly positions: Float32Array;
    readonly radii: Float32Array;
    readonly seeds: Float32Array;
  } {
    const ringCounts = this.bodies.map(body => Math.max(0, Math.round(Math.sqrt(body.indices.length) * fillDensity)));
    const fillerCapacity = this.bodies.reduce((sum, body, bodyIndex) => {
      const rings = ringCounts[bodyIndex] ?? 0;
      for (let ring = 0; ring < rings; ring += 1) sum += Math.max(1, Math.round(body.indices.length * ((ring + 1) / (rings + 1))));
      return sum;
    }, 0);
    const capacity = this.world.count + fillerCapacity, positions = new Float32Array(capacity * 2), radii = new Float32Array(capacity), seeds = new Float32Array(capacity);
    positions.set(this.world.positions.subarray(0, this.world.count * 2));
    radii.set(this.world.radii.subarray(0, this.world.count));
    seeds.set(this.world.colorSeeds.subarray(0, this.world.count));
    let count = this.world.count;
    for (const [bodyIndex, body] of this.bodies.entries()) {
      const center = this.center(body), first = body.indices[0] ?? 0, baseRadius = Math.max(2, this.world.radii[first] ?? 3);
      const rings = ringCounts[bodyIndex] ?? 0;
      for (let ring = 0; ring < rings; ring += 1) {
        const radiusFraction = (ring + 1) / (rings + 1), ringPoints = Math.max(1, Math.round(body.indices.length * radiusFraction));
        for (let i = 0; i < ringPoints; i += 1) {
          const edge = body.indices[Math.floor(i / ringPoints * body.indices.length)] ?? first, x = this.world.positions[edge * 2] ?? center.x, y = this.world.positions[edge * 2 + 1] ?? center.y;
          positions[count * 2] = center.x + (x - center.x) * radiusFraction;
          positions[count * 2 + 1] = center.y + (y - center.y) * radiusFraction;
          radii[count] = baseRadius * 1.5;
          seeds[count] = body.seed;
          count++;
        }
      }
    }
    return {
      count,
      positions,
      radii,
      seeds
    };
  }
  private solveArea(body: SoftBody, dt: number, tuning: SoftBodyTuning) {
    const points = body.indices.map(index => ({
      x: this.world.positions[index * 2] ?? 0,
      y: this.world.positions[index * 2 + 1] ?? 0
    })), current = Math.max(1, Math.abs(area(points))), center = this.center(body), ratio = Math.sqrt(body.restArea / current) - 1, softness = 1 / (1 + Math.max(0, tuning.squishiness) * 1.6), strength = Math.min(0.18, Math.abs(ratio) * tuning.areaPressure * 0.075 * softness * (1 + Math.sqrt(tuning.boundaryElasticity) * 0.08)) * Math.sign(ratio);
    for (const index of body.indices) {
      const o = index * 2, dx = (this.world.positions[o] ?? 0) - center.x, dy = (this.world.positions[o + 1] ?? 0) - center.y;
      this.world.positions[o] = (this.world.positions[o] ?? 0) + dx * strength;
      this.world.positions[o + 1] = (this.world.positions[o + 1] ?? 0) + dy * strength;
    }
    body.restArea += (current - body.restArea) * Math.max(0, tuning.plasticFlow) * dt * 0.18;
  }
  private center(body: SoftBody) {
    let x = 0, y = 0;
    for (const index of body.indices) {
      x += this.world.positions[index * 2] ?? 0;
      y += this.world.positions[index * 2 + 1] ?? 0;
    }
    return {
      x: x / body.indices.length,
      y: y / body.indices.length
    };
  }
}
function circle(cx: number, cy: number, r: number, count: number) {
  return Array.from({
    length: count
  }, (_, i) => {
    const angle = i / count * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r
    };
  });
}
function area(points: readonly {
  readonly x: number;
  readonly y: number;
}[]) {
  let value = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a && b)
      value += a.x * b.y - b.x * a.y;
  }
  return value * 0.5;
}
