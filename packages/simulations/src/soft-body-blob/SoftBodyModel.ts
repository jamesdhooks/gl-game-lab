import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';

export interface SoftBody {
  readonly indices: readonly number[];
  readonly interiorIndices: readonly number[];
  restArea: number;
  readonly restRadius: number;
  readonly seed: number;
}

export interface SoftBodyTuning {
  readonly squishiness: number;
  readonly surfaceTension: number;
  readonly areaPressure: number;
  readonly plasticFlow: number;
  readonly boundaryElasticity: number;
  readonly membraneDamping: number;
  readonly constraintPasses: number;
}

export class SoftBodyModel {
  readonly world = new ConstrainedCircleParticleWorld2D(65536, 196608, {}, 100118795);
  readonly bodies: SoftBody[] = [];
  private readonly bodyOf = new Int32Array(65536).fill(-1);
  private readonly localOf = new Int16Array(65536).fill(-1);
  private nextSeed = 1;
  private width = 1;
  private height = 1;

  constructor() {
    this.world.setCollisionFilter((left, right) => {
      const body = this.bodyOf[left] ?? -1;
      if (body < 0 || body !== (this.bodyOf[right] ?? -2)) return true;
      const definition = this.bodies[body];
      if (!definition) return true;
      const a = this.localOf[left] ?? -1, b = this.localOf[right] ?? -1, boundaryCount = definition.indices.length;
      if (a < 0 || b < 0 || a >= boundaryCount || b >= boundaryCount) return true;
      const separation = Math.abs(a - b);
      return separation > 1 && separation < boundaryCount - 1;
    });
  }

  reset(width: number, height: number, seed = 100118795) {
    this.world.clear(seed);
    this.world.setBounds(width, height);
    this.width = width; this.height = height;
    this.bodies.length = 0;
    this.bodyOf.fill(-1); this.localOf.fill(-1);
    this.nextSeed = 1;
  }

  addBlob(centerX: number, centerY: number, size: number, density: number, outline?: readonly Point[]): SoftBody | undefined {
    const nodeRadius = nodeRadiusForDensity(density);
    const boundaryCount = outline && outline.length >= 5
      ? boundaryCountForPerimeter(polylineLength(outline), density)
      : boundaryCountForSize(size, density);
    const points = outline && outline.length >= 5 ? resampleClosed(outline, boundaryCount) : circle(centerX, centerY, size, boundaryCount);
    if (points.length < 8) return;
    const bodyIndex = this.bodies.length, seed = this.nextSeed++, indices: number[] = [], interiorIndices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i]; if (!point) continue;
      const index = this.world.addCircle(point.x, point.y, { radius: nodeRadius, velocityX: (Math.sin(i * 12.31 + seed) - 0.5) * 18, velocityY: 0, colorSeed: seed });
      if (index < 0) return;
      this.bodyOf[index] = bodyIndex; this.localOf[index] = i; indices.push(index);
    }
    const interiorCount = Math.max(2, Math.min(129, Math.round(indices.length * 0.32 + (indices.length / 128) ** 2 * 42)));
    for (let i = 0; i < interiorCount; i++) {
      const normalized = (i + 0.5) / interiorCount, angle = i * 2.399963229728653 + seed * 0.37, radial = Math.sqrt(normalized) * 0.74;
      const index = this.world.addCircle(centerX + Math.cos(angle) * radial * size, centerY + Math.sin(angle) * radial * size, { radius: nodeRadius, colorSeed: seed });
      if (index < 0) break;
      this.bodyOf[index] = bodyIndex; this.localOf[index] = indices.length + i; interiorIndices.push(index);
    }
    for (let i = 0; i < indices.length; i++) {
      this.world.addDistanceConstraint(indices[i] as number, indices[(i + 1) % indices.length] as number, { stiffness: 0.72 });
      this.world.addDistanceConstraint(indices[i] as number, indices[(i + 2) % indices.length] as number, { stiffness: 0.16 });
    }
    const restArea = Math.max(1, Math.abs(area(points)));
    const body: SoftBody = { indices: Object.freeze(indices), interiorIndices: Object.freeze(interiorIndices), restArea, restRadius: Math.sqrt(restArea / Math.PI), seed };
    this.bodies.push(body);
    return body;
  }

  addFixture(points: readonly Point[], radius: number) {
    for (const point of points) this.world.addCircle(point.x, point.y, { radius, inverseMass: 0, colorSeed: 0 });
  }

  step(dt: number, tuning: SoftBodyTuning) {
    this.world.step(dt);
    const passes = Math.max(2, Math.min(14, Math.floor(tuning.constraintPasses)));
    for (let pass = 0; pass < passes; pass++) for (const body of this.bodies) this.solveBody(body, dt / passes, tuning, 1 / passes);
  }

  configure(options: Parameters<ConstrainedCircleParticleWorld2D['configure']>[0]) { this.world.configure(options); }

  packMesh(smoothing = 0.46): { readonly vertexCount: number; readonly positions: Float32Array; readonly colorSeeds: Float32Array } {
    const subdivisions = 4, triangles = this.bodies.reduce((sum, body) => sum + body.indices.length * subdivisions, 0);
    const positions = new Float32Array(triangles * 6), colorSeeds = new Float32Array(triangles * 3);
    let vertex = 0;
    for (const body of this.bodies) {
      const center = this.center(body), boundary: Point[] = [];
      for (let i = 0; i < body.indices.length; i++) {
        const p0 = body.indices[(i - 1 + body.indices.length) % body.indices.length] as number, p1 = body.indices[i] as number, p2 = body.indices[(i + 1) % body.indices.length] as number, p3 = body.indices[(i + 2) % body.indices.length] as number;
        for (let step = 0; step < subdivisions; step++) {
          const t = step / subdivisions, linearX = value(this.world.positions, p1 * 2) + (value(this.world.positions, p2 * 2) - value(this.world.positions, p1 * 2)) * t, linearY = value(this.world.positions, p1 * 2 + 1) + (value(this.world.positions, p2 * 2 + 1) - value(this.world.positions, p1 * 2 + 1)) * t;
          const curveX = catmull(value(this.world.positions, p0 * 2), value(this.world.positions, p1 * 2), value(this.world.positions, p2 * 2), value(this.world.positions, p3 * 2), t), curveY = catmull(value(this.world.positions, p0 * 2 + 1), value(this.world.positions, p1 * 2 + 1), value(this.world.positions, p2 * 2 + 1), value(this.world.positions, p3 * 2 + 1), t);
          boundary.push({ x: linearX + (curveX - linearX) * smoothing, y: linearY + (curveY - linearY) * smoothing });
        }
      }
      for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i] as Point, b = boundary[(i + 1) % boundary.length] as Point, offset = vertex * 2;
        positions.set([center.x, center.y, a.x, a.y, b.x, b.y], offset); colorSeeds.fill(body.seed, vertex, vertex + 3); vertex += 3;
      }
    }
    return { vertexCount: vertex, positions, colorSeeds };
  }

  packOutlines() {
    const count = this.bodies.reduce((sum, body) => sum + body.indices.length, 0), segments = new Float32Array(count * 4), styles = new Float32Array(count * 2);
    let segment = 0;
    for (const body of this.bodies) for (let i = 0; i < body.indices.length; i++) {
      const a = body.indices[i] as number, b = body.indices[(i + 1) % body.indices.length] as number, o = segment * 4;
      segments.set([value(this.world.positions, a * 2), value(this.world.positions, a * 2 + 1), value(this.world.positions, b * 2), value(this.world.positions, b * 2 + 1)], o);
      styles[segment * 2] = this.world.radii[a] ?? 3; styles[segment * 2 + 1] = 1; segment++;
    }
    return { count, segments, styles };
  }

  packBasicVisualLayers(fillDensity: number) {
    const nodeCount = this.bodies.reduce((sum, body) => sum + body.indices.length + body.interiorIndices.length, 0);
    let fixtureCount = 0;
    for (let index = 0; index < this.world.count; index++) if ((this.bodyOf[index] ?? -1) < 0) fixtureCount++;
    const nodes = pointBuffers(nodeCount), fixtures = pointBuffers(fixtureCount);
    let nodeCursor = 0, fixtureCursor = 0;
    const write = (target: ReturnType<typeof pointBuffers>, cursor: number, index: number, seed: number) => {
      target.positions[cursor * 2] = value(this.world.positions, index * 2);
      target.positions[cursor * 2 + 1] = value(this.world.positions, index * 2 + 1);
      target.radii[cursor] = this.world.radii[index] ?? 1;
      target.seeds[cursor] = seed;
    };
    for (const body of this.bodies) {
      for (const index of body.indices) { write(nodes, nodeCursor, index, Math.max(0, body.seed - 1)); nodeCursor++; }
      for (const index of body.interiorIndices) { write(nodes, nodeCursor, index, Math.max(0, body.seed - 1)); nodeCursor++; }
    }
    for (let index = 0; index < this.world.count; index++) if ((this.bodyOf[index] ?? -1) < 0) {
      write(fixtures, fixtureCursor, index, 0);
      fixtureCursor++;
    }
    const density = Math.max(0, Math.min(3, fillDensity));
    const fillerPlans = this.bodies.map(body => {
      const center = this.center(body), first = body.indices[0] as number, radius = this.world.radii[first] ?? 1;
      if (density <= 0.001) return { center, radius, ringCount: 0, sampleCount: 0, count: 0 };
      let extent = 0;
      for (const index of body.indices) extent = Math.max(extent, Math.hypot(value(this.world.positions, index * 2) - center.x, value(this.world.positions, index * 2 + 1) - center.y));
      const sizeScale = Math.max(1, extent / Math.max(12, Math.max(1, radius) * 3.4));
      const ringCount = Math.max(1, Math.round((1 + density * 1.65) * Math.sqrt(sizeScale)));
      const sampleCount = Math.max(7, Math.round((8 + density * 9) * Math.sqrt(sizeScale)));
      return { center, radius, ringCount, sampleCount, count: 1 + sampleCount * (ringCount + 1) };
    });
    const fillers = pointBuffers(fillerPlans.reduce((sum, plan) => sum + plan.count, 0));
    let fillerCursor = 0;
    for (const [bodyIndex, body] of this.bodies.entries()) {
      const plan = fillerPlans[bodyIndex];
      if (!plan || plan.count === 0) continue;
      const { center, radius, ringCount, sampleCount } = plan;
      fillers.positions[fillerCursor * 2] = center.x; fillers.positions[fillerCursor * 2 + 1] = center.y; fillers.radii[fillerCursor] = radius; fillerCursor++;
      for (let sample = 0; sample < sampleCount; sample++) {
        const scaled = ((sample + (bodyIndex % 2) * 0.5) / sampleCount) * body.indices.length, local = Math.floor(scaled) % body.indices.length, nextLocal = (local + 1) % body.indices.length, t = scaled - Math.floor(scaled);
        const a = body.indices[local] as number, b = body.indices[nextLocal] as number;
        const edgeX = value(this.world.positions, a * 2) + (value(this.world.positions, b * 2) - value(this.world.positions, a * 2)) * t, edgeY = value(this.world.positions, a * 2 + 1) + (value(this.world.positions, b * 2 + 1) - value(this.world.positions, a * 2 + 1)) * t;
        for (let ring = 0; ring <= ringCount; ring++) {
          const amount = ring / Math.max(1, ringCount + 1), ease = amount * amount;
          fillers.positions[fillerCursor * 2] = center.x + (edgeX - center.x) * ease;
          fillers.positions[fillerCursor * 2 + 1] = center.y + (edgeY - center.y) * ease;
          fillers.radii[fillerCursor] = radius;
          fillerCursor++;
        }
      }
    }
    return {
      nodes: { count: nodeCursor, ...nodes },
      fixtures: { count: fixtureCursor, ...fixtures },
      fillers: { count: fillerCursor, ...fillers }
    };
  }

  packVisualPoints(fillDensity: number) {
    const ringCounts = this.bodies.map(body => Math.max(0, Math.round((2 + fillDensity * 4.75) * Math.sqrt(Math.max(1, body.restRadius / Math.max(12, (this.world.radii[body.indices[0] as number] ?? 3) * 3.2))))));
    const sampleCounts = this.bodies.map((body, index) => Math.max(0, Math.round((18 + fillDensity * 34) * Math.sqrt(Math.max(1, body.restRadius / Math.max(12, (this.world.radii[body.indices[0] as number] ?? 3) * 3.2)))) * (ringCounts[index] ? 1 : 0)));
    const fillerCapacity = this.bodies.reduce((sum, _body, index) => sum + (sampleCounts[index] ?? 0) * ((ringCounts[index] ?? 0) + 1) + 1, 0);
    const capacity = this.world.count + fillerCapacity, positions = new Float32Array(capacity * 2), radii = new Float32Array(capacity), seeds = new Float32Array(capacity);
    positions.set(this.world.positions.subarray(0, this.world.count * 2)); radii.set(this.world.radii.subarray(0, this.world.count)); seeds.set(this.world.colorSeeds.subarray(0, this.world.count));
    let count = this.world.count;
    for (const [bodyIndex, body] of this.bodies.entries()) {
      const center = this.center(body), first = body.indices[0] as number, baseRadius = this.world.radii[first] ?? 3, rings = ringCounts[bodyIndex] ?? 0, samples = sampleCounts[bodyIndex] ?? 0;
      positions[count * 2] = center.x; positions[count * 2 + 1] = center.y; radii[count] = baseRadius; seeds[count++] = body.seed;
      for (let sample = 0; sample < samples; sample++) {
        const edge = body.indices[Math.floor(sample / Math.max(1, samples) * body.indices.length)] as number, ex = value(this.world.positions, edge * 2), ey = value(this.world.positions, edge * 2 + 1);
        for (let ring = 0; ring <= rings; ring++) { const t = ring / Math.max(1, rings + 1), ease = t * t; positions[count * 2] = center.x + (ex - center.x) * ease; positions[count * 2 + 1] = center.y + (ey - center.y) * ease; radii[count] = baseRadius; seeds[count++] = body.seed; }
      }
    }
    return { count, positions, radii, seeds };
  }

  private solveBody(body: SoftBody, dt: number, tuning: SoftBodyTuning, passScale: number) {
    const points = body.indices.map(index => ({ x: value(this.world.positions, index * 2), y: value(this.world.positions, index * 2 + 1) }));
    const currentArea = area(points), target = body.restArea, softness = Math.max(0, Math.min(1, tuning.squishiness / 2));
    const areaStiffness = (0.045 + (1 - softness) * 0.15) * tuning.areaPressure * (1 + Math.sqrt(tuning.boundaryElasticity) * 0.12) * passScale;
    const gradientsX = new Float32Array(body.indices.length), gradientsY = new Float32Array(body.indices.length);
    let denominator = 0;
    for (let i = 0; i < body.indices.length; i++) { const previous = points[(i - 1 + points.length) % points.length] as Point, next = points[(i + 1) % points.length] as Point; const gx = 0.5 * (next.y - previous.y), gy = 0.5 * (previous.x - next.x); gradientsX[i] = gx; gradientsY[i] = gy; denominator += gx * gx + gy * gy; }
    if (denominator > 1e-6) {
      const lambda = -(currentArea - target) / denominator * areaStiffness, maxCorrection = body.restRadius * 0.06;
      for (let i = 0; i < body.indices.length; i++) { const index = body.indices[i] as number, dx = lambda * (gradientsX[i] ?? 0), dy = lambda * (gradientsY[i] ?? 0), length = Math.hypot(dx, dy), scale = length > maxCorrection ? maxCorrection / length : 1; this.move(index, dx * scale, dy * scale); }
    }
    const surface = tuning.surfaceTension * 0.06 * passScale;
    if (surface > 0) for (let i = 0; i < body.indices.length; i++) {
      const index = body.indices[i] as number;
      const previous = body.indices[(i - 1 + body.indices.length) % body.indices.length] as number;
      const next = body.indices[(i + 1) % body.indices.length] as number;
      this.move(
        index,
        ((value(this.world.positions, previous * 2) + value(this.world.positions, next * 2)) * 0.5 - value(this.world.positions, index * 2)) * surface,
        ((value(this.world.positions, previous * 2 + 1) + value(this.world.positions, next * 2 + 1)) * 0.5 - value(this.world.positions, index * 2 + 1)) * surface,
      );
    }
    const membrane = 0.72 * Math.pow(1 / (1 + tuning.boundaryElasticity * 0.72), 1.35) * passScale;
    for (const index of body.interiorIndices) {
      const px = value(this.world.positions, index * 2), py = value(this.world.positions, index * 2 + 1);
      let bestBoundary = 0, bestDistance = Number.POSITIVE_INFINITY;
      for (let boundary = 0; boundary < body.indices.length; boundary++) {
        const a = body.indices[boundary] as number, b = body.indices[(boundary + 1) % body.indices.length] as number;
        const ax = value(this.world.positions, a * 2), ay = value(this.world.positions, a * 2 + 1), bx = value(this.world.positions, b * 2), by = value(this.world.positions, b * 2 + 1), ex = bx - ax, ey = by - ay;
        const along = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / Math.max(1e-6, ex * ex + ey * ey)));
        const distance = Math.hypot(px - (ax + ex * along), py - (ay + ey * along));
        if (distance < bestDistance) { bestDistance = distance; bestBoundary = boundary; }
      }
      const a = body.indices[bestBoundary] as number, b = body.indices[(bestBoundary + 1) % body.indices.length] as number;
      const ax = value(this.world.positions, a * 2), ay = value(this.world.positions, a * 2 + 1), ex = value(this.world.positions, b * 2) - ax, ey = value(this.world.positions, b * 2 + 1) - ay, edgeLength = Math.hypot(ex, ey) + 1e-6;
      const nx = -ey / edgeLength, ny = ex / edgeLength, side = (px - ax) * nx + (py - ay) * ny, minimum = (this.world.radii[index] ?? 1) * 0.85;
      if (side < minimum) {
        const correction = (minimum - side) * membrane;
        this.move(index, nx * correction, ny * correction);
        this.move(a, -nx * correction * 0.035, -ny * correction * 0.035);
        this.move(b, -nx * correction * 0.035, -ny * correction * 0.035);
      }
    }
    body.restArea += (Math.abs(currentArea) - body.restArea) * Math.max(0, tuning.plasticFlow) * dt * 0.55;
  }

  private move(index: number, dx: number, dy: number) {
    const o = index * 2, x = Math.max(this.world.radii[index] ?? 0, Math.min(this.width - (this.world.radii[index] ?? 0), value(this.world.positions, o) + dx)), y = Math.max(this.world.radii[index] ?? 0, Math.min(this.height - (this.world.radii[index] ?? 0), value(this.world.positions, o + 1) + dy));
    dx = x - value(this.world.positions, o); dy = y - value(this.world.positions, o + 1); this.world.positions[o] = x; this.world.positions[o + 1] = y; this.world.particles.previousPositions[o] = value(this.world.particles.previousPositions, o) + dx; this.world.particles.previousPositions[o + 1] = value(this.world.particles.previousPositions, o + 1) + dy;
  }
  private center(body: SoftBody) { const all = [...body.indices, ...body.interiorIndices]; let x = 0, y = 0; for (const index of all) { x += value(this.world.positions, index * 2); y += value(this.world.positions, index * 2 + 1); } return { x: x / Math.max(1, all.length), y: y / Math.max(1, all.length) }; }
}

function pointBuffers(count: number) {
  return { positions: new Float32Array(count * 2), radii: new Float32Array(count), seeds: new Float32Array(count) };
}

interface Point { readonly x: number; readonly y: number }
function nodeRadiusForDensity(density: number) { const t = Math.max(0, Math.min(1, (density - 0.35) / (2.5 - 0.35))); return 22 + (8.5 - 22) * Math.sqrt(t); }
function boundaryCountForSize(size: number, density: number) { return Math.max(12, Math.min(128, Math.round(Math.PI * 2 * size / (nodeRadiusForDensity(density) * 1.32)))); }
function boundaryCountForPerimeter(perimeter: number, density: number) { return Math.max(12, Math.min(128, Math.round(perimeter / (nodeRadiusForDensity(density) * 1.32)))); }
function circle(cx: number, cy: number, radius: number, count: number): Point[] { return Array.from({ length: count }, (_, i) => ({ x: cx + Math.cos(i / count * Math.PI * 2) * radius, y: cy + Math.sin(i / count * Math.PI * 2) * radius })); }
function polylineLength(points: readonly Point[]) { let total = 0; for (let i = 0; i < points.length; i++) { const a = points[i] as Point, b = points[(i + 1) % points.length] as Point; total += Math.hypot(b.x - a.x, b.y - a.y); } return total; }
function resampleClosed(points: readonly Point[], count: number): Point[] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Point, b = points[(i + 1) % points.length] as Point;
    total += Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(total);
  }
  const result: Point[] = [];
  for (let sample = 0; sample < count; sample++) {
    const target = sample / count * total;
    let segment = 0;
    while (segment < lengths.length - 1 && (lengths[segment] ?? 0) < target) segment++;
    const before = segment === 0 ? 0 : lengths[segment - 1] ?? 0;
    const length = Math.max(1e-4, (lengths[segment] ?? total) - before);
    const t = (target - before) / length, a = points[segment] as Point, b = points[(segment + 1) % points.length] as Point;
    result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return result;
}
function area(points: readonly Point[]) { let result = 0; for (let i = 0; i < points.length; i++) { const a = points[i] as Point, b = points[(i + 1) % points.length] as Point; result += a.x * b.y - a.y * b.x; } return result * 0.5; }
function catmull(p0: number, p1: number, p2: number, p3: number, t: number) { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function value(array: Float32Array, index: number) { return array[index] ?? 0; }
