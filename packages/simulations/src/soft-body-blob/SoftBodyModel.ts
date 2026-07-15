import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import { createBuildFixture, packBuildFixtures, sampleBuildFixture, type BuildFixture2D } from '../BuildFixtures.js';

export interface SoftBody {
  readonly indices: readonly number[];
  readonly interiorIndices: readonly number[];
  restArea: number;
  readonly restRadius: number;
  readonly seed: number;
  readonly edgeBase: Float32Array;
  readonly edgeRest: Float32Array;
  readonly bendBase: Float32Array;
  readonly bendRest: Float32Array;
}

export interface SoftBodyTuning {
  readonly blobSize: number;
  readonly squishiness: number;
  readonly surfaceTension: number;
  readonly areaPressure: number;
  readonly plasticFlow: number;
  readonly boundaryElasticity: number;
  readonly shapeRigidity: number;
  readonly membraneDamping: number;
  readonly constraintPasses: number;
}

export interface SoftBodyDragForce {
  readonly bodyIndices: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly radius: number;
}

export interface SoftBodyDrawBlueprint {
  readonly outline: readonly SoftBodyPoint[];
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly restArea: number;
}

export class SoftBodyModel {
  readonly world = new ConstrainedCircleParticleWorld2D(65536, 196608, {}, 100118795);
  readonly bodies: SoftBody[] = [];
  readonly buildFixtures: BuildFixture2D[] = [];
  private readonly bodyOf = new Int32Array(65536).fill(-1);
  private readonly localOf = new Int16Array(65536).fill(-1);
  private readonly gridNext = new Int32Array(65536);
  private readonly areaGradientX = new Float32Array(128);
  private readonly areaGradientY = new Float32Array(128);
  private gridHeads = new Int32Array(1);
  private gridWidth = 1;
  private gridHeight = 1;
  private gridCellSize = 18;
  private nextSeed = 1;
  private width = 1;
  private height = 1;
  private randomState = 100118795;
  private gravity = 1250;
  private viscosity = 0.64;
  private substeps = 2;
  private maxFrameDelta = 1 / 30;

  constructor(private readonly preview = false) {}

  reset(width: number, height: number, seed = 100118795) {
    this.world.clear(seed);
    this.world.setBounds(width, height);
    this.width = width; this.height = height;
    this.bodies.length = 0;
    this.buildFixtures.length = 0;
    this.bodyOf.fill(-1); this.localOf.fill(-1);
    this.nextSeed = 1;
    this.randomState = seed >>> 0 || 0x6d2b79f5;
  }

  addBlob(centerX: number, centerY: number, size: number, density: number, outline?: readonly Point[], authoredRestArea?: number): SoftBody | undefined {
    const nodeRadius = softBodyNodeRadiusForDensity(density);
    const authoredOutline = outline && outline.length >= 5;
    const boundaryCount = authoredOutline ? outline.length : boundaryCountForSize(size, density);
    const rotation = this.random() * Math.PI * 2, cos = Math.cos(rotation), sin = Math.sin(rotation), jitter = size * 0.025;
    const points = authoredOutline ? outline.map(point => ({ x: point.x, y: point.y })) : circle(centerX, centerY, size, boundaryCount).map(point => {
      const localX = point.x - centerX, localY = point.y - centerY;
      return {
        x: centerX + localX * cos - localY * sin + (this.random() * 2 - 1) * jitter,
        y: centerY + localX * sin + localY * cos + (this.random() * 2 - 1) * jitter,
      };
    });
    if (points.length < 8) return;
    const bodyIndex = this.bodies.length, seed = this.nextSeed++, indices: number[] = [], interiorIndices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i]; if (!point) continue;
      const index = this.world.addCircle(point.x, point.y, { radius: nodeRadius, velocityX: 0, velocityY: 0, colorSeed: seed });
      if (index < 0) return;
      this.bodyOf[index] = bodyIndex; this.localOf[index] = i; indices.push(index);
    }
    const interiorCount = Math.max(2, Math.min(129, Math.round(indices.length * 0.32 + (indices.length / 128) ** 2 * 42)));
    for (let i = 0; i < interiorCount; i++) {
      const normalized = (i + 0.5) / interiorCount, angle = i * 2.399963229728653 + rotation * 0.37, radial = Math.sqrt(normalized) * 0.74;
      const localX = Math.cos(angle) * radial * size, localY = Math.sin(angle) * radial * size;
      const x = centerX + localX * cos - localY * sin + (this.random() * 2 - 1) * jitter;
      const y = centerY + localX * sin + localY * cos + (this.random() * 2 - 1) * jitter;
      const index = this.world.addCircle(x, y, { radius: nodeRadius, colorSeed: seed });
      if (index < 0) break;
      this.bodyOf[index] = bodyIndex; this.localOf[index] = indices.length + i; interiorIndices.push(index);
    }
    const edgeBase = new Float32Array(indices.length), bendBase = new Float32Array(indices.length);
    const fallbackEdge = 2 * size * Math.sin(Math.PI / Math.max(1, indices.length));
    const fallbackBend = 2 * size * Math.sin(Math.PI * 2 / Math.max(1, indices.length));
    for (let i = 0; i < indices.length; i++) {
      edgeBase[i] = authoredOutline ? pointDistance(points[i] as Point, points[(i + 1) % points.length] as Point) : fallbackEdge;
      bendBase[i] = authoredOutline ? pointDistance(points[i] as Point, points[(i + 2) % points.length] as Point) : fallbackBend;
    }
    const restArea = Math.max(1, authoredRestArea ?? (authoredOutline ? Math.abs(area(points)) : Math.PI * size * size));
    const body: SoftBody = {
      indices: Object.freeze(indices), interiorIndices: Object.freeze(interiorIndices), restArea,
      restRadius: Math.sqrt(restArea / Math.PI), seed, edgeBase, edgeRest: edgeBase.slice(),
      bendBase, bendRest: bendBase.slice(),
    };
    this.bodies.push(body);
    return body;
  }

  addFixture(points: readonly Point[], radius: number) {
    const fixture = createBuildFixture(points, radius);
    if (!fixture) return;
    for (const point of sampleBuildFixture(fixture)) this.world.addCircle(point.x, point.y, { radius, inverseMass: 0, colorSeed: 0 });
    this.buildFixtures.push(fixture);
  }

  step(dt: number, tuning: SoftBodyTuning, dragForces: readonly SoftBodyDragForce[] = []) {
    const frameDelta = Math.max(0, Math.min(this.maxFrameDelta, dt));
    if (frameDelta <= 0 || this.world.count === 0) return;
    const substeps = Math.max(1, Math.min(5, Math.floor(this.substeps)));
    const passes = Math.max(2, Math.min(14, Math.floor(tuning.constraintPasses)));
    const step = frameDelta / substeps;
    this.updateGridShape();
    for (let substep = 0; substep < substeps; substep++) {
      this.integrate(step);
      for (const force of dragForces) this.dragBodies(force.bodyIndices, force.x, force.y, force.moveX, force.moveY, force.radius);
      for (let pass = 0; pass < passes; pass++) {
        this.solveWalls();
        for (const body of this.bodies) this.solveBody(body, tuning);
        this.buildGrid();
        this.solveContacts(tuning.squishiness);
      }
      this.solveWalls();
      this.applyPlasticity(step, tuning.plasticFlow);
      this.buildGrid();
      this.settleContactVelocities();
      this.buildGrid();
      this.applyViscosity();
      this.syncVelocities(step);
    }
  }

  configure(options: Parameters<ConstrainedCircleParticleWorld2D['configure']>[0]) {
    if (options.gravity !== undefined) this.gravity = options.gravity;
    if (options.contactFriction !== undefined) this.viscosity = clamp(options.contactFriction, 0, 1);
    if (options.substeps !== undefined) this.substeps = Math.max(1, Math.min(5, Math.floor(options.substeps)));
    if (options.maxFrameDelta !== undefined) this.maxFrameDelta = clamp(options.maxFrameDelta, 1 / 240, 1 / 10);
  }

  pickBodies(x: number, y: number, radius: number): readonly number[] {
    const picked: number[] = [];
    let nearestBody = -1, nearestDistance2 = Number.POSITIVE_INFINITY;
    for (let bodyIndex = 0; bodyIndex < this.bodies.length; bodyIndex++) {
      const body = this.bodies[bodyIndex];
      if (!body) continue;
      const center = this.center(body);
      let extent = 0;
      for (const index of body.indices) extent = Math.max(extent, Math.hypot(value(this.world.positions, index * 2) - center.x, value(this.world.positions, index * 2 + 1) - center.y));
      const dx = center.x - x, dy = center.y - y, distance2 = dx * dx + dy * dy, reach = radius + extent * 0.72;
      if (distance2 < nearestDistance2) { nearestDistance2 = distance2; nearestBody = bodyIndex; }
      if (distance2 <= reach * reach) picked.push(bodyIndex);
    }
    if (picked.length === 0 && nearestBody >= 0 && nearestDistance2 <= radius * radius * 3.24) picked.push(nearestBody);
    return Object.freeze(picked);
  }

  dragBodies(bodyIndices: readonly number[], x: number, y: number, moveX: number, moveY: number, radius: number) {
    const previous = this.world.particles.previousPositions;
    for (const bodyIndex of bodyIndices) {
      const body = this.bodies[bodyIndex];
      if (!body) continue;
      const center = this.center(body);
      let extent = 0;
      for (const index of body.indices) extent = Math.max(extent, Math.hypot(value(this.world.positions, index * 2) - center.x, value(this.world.positions, index * 2 + 1) - center.y));
      const effectiveRadius = Math.max(radius, extent * 0.9), dx = x - center.x, dy = y - center.y;
      const weight = Math.exp(-Math.max(0, Math.hypot(dx, dy) - extent) / Math.max(1, effectiveRadius));
      const carryX = moveX * (0.92 + weight * 0.18) + dx * 0.022 * weight;
      const carryY = moveY * (0.92 + weight * 0.18) + dy * 0.022 * weight;
      const releaseVelocityX = moveX * 0.09 * weight, releaseVelocityY = moveY * 0.09 * weight;
      for (const index of body.indices) {
        const offset = index * 2;
        this.world.positions[offset] = value(this.world.positions, offset) + carryX;
        this.world.positions[offset + 1] = value(this.world.positions, offset + 1) + carryY;
        previous[offset] = value(previous, offset) + carryX - releaseVelocityX;
        previous[offset + 1] = value(previous, offset + 1) + carryY - releaseVelocityY;
      }
      for (const index of body.interiorIndices) {
        const offset = index * 2;
        this.world.positions[offset] = value(this.world.positions, offset) + carryX;
        this.world.positions[offset + 1] = value(this.world.positions, offset + 1) + carryY;
        previous[offset] = value(previous, offset) + carryX - releaseVelocityX;
        previous[offset + 1] = value(previous, offset + 1) + carryY - releaseVelocityY;
      }
    }
  }

  packMesh(smoothing = 0.46): { readonly vertexCount: number; readonly positions: Float32Array; readonly colorSeeds: Float32Array; readonly edgeFactors: Float32Array } {
    const subdivisions = 4, triangles = this.bodies.reduce((sum, body) => sum + body.indices.length * subdivisions, 0);
    const positions = new Float32Array(triangles * 6), colorSeeds = new Float32Array(triangles * 3), edgeFactors = new Float32Array(triangles * 3);
    let vertex = 0;
    for (const body of this.bodies) {
      const center = this.boundaryCenter(body), boundary: Point[] = [], membraneOffset = Math.max(2.2, (this.world.radii[body.indices[0] as number] ?? 1) * 1.02);
      for (let i = 0; i < body.indices.length; i++) {
        const p0 = body.indices[(i - 1 + body.indices.length) % body.indices.length] as number, p1 = body.indices[i] as number, p2 = body.indices[(i + 1) % body.indices.length] as number, p3 = body.indices[(i + 2) % body.indices.length] as number;
        for (let step = 0; step < subdivisions; step++) {
          const t = step / subdivisions, linearX = value(this.world.positions, p1 * 2) + (value(this.world.positions, p2 * 2) - value(this.world.positions, p1 * 2)) * t, linearY = value(this.world.positions, p1 * 2 + 1) + (value(this.world.positions, p2 * 2 + 1) - value(this.world.positions, p1 * 2 + 1)) * t;
          const curveX = catmull(value(this.world.positions, p0 * 2), value(this.world.positions, p1 * 2), value(this.world.positions, p2 * 2), value(this.world.positions, p3 * 2), t), curveY = catmull(value(this.world.positions, p0 * 2 + 1), value(this.world.positions, p1 * 2 + 1), value(this.world.positions, p2 * 2 + 1), value(this.world.positions, p3 * 2 + 1), t);
          let skinX = linearX + (curveX - linearX) * smoothing, skinY = linearY + (curveY - linearY) * smoothing;
          const dx = skinX - center.x, dy = skinY - center.y, inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1e-6);
          skinX += dx * inverseLength * membraneOffset; skinY += dy * inverseLength * membraneOffset;
          boundary.push({ x: skinX, y: skinY });
        }
      }
      for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i] as Point, b = boundary[(i + 1) % boundary.length] as Point, offset = vertex * 2;
        positions.set([center.x, center.y, a.x, a.y, b.x, b.y], offset);
        colorSeeds.fill(Math.max(0, body.seed - 1), vertex, vertex + 3);
        edgeFactors.set([0, 0.25, 0.25], vertex);
        vertex += 3;
      }
    }
    return { vertexCount: vertex, positions, colorSeeds, edgeFactors };
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

  packBuildFixtures() { return packBuildFixtures(this.buildFixtures); }

  packBasicVisualLayers(fillDensity: number, fillerScale = 1) {
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
    const density = Math.max(0, Math.min(3, fillDensity)), scale = clamp(fillerScale, 0, 2);
    const fillerPlans = this.bodies.map(body => {
      const center = this.boundaryCenter(body), first = body.indices[0] as number, radius = this.world.radii[first] ?? 1;
      if (density <= 0.001 || scale <= 0.001) return { center, radius, ringCount: 0, sampleCount: 0, count: 0 };
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
      fillers.positions[fillerCursor * 2] = center.x; fillers.positions[fillerCursor * 2 + 1] = center.y; fillers.radii[fillerCursor] = radius * scale; fillerCursor++;
      const fillerCount = sampleCount * (ringCount + 1);
      for (let filler = 0; filler < fillerCount; filler++) {
        const distribution = fillerDistribution(filler, fillerCount, bodyIndex * 0.173), scaled = distribution.phase * body.indices.length, local = Math.floor(scaled) % body.indices.length, nextLocal = (local + 1) % body.indices.length, t = scaled - Math.floor(scaled);
        const a = body.indices[local] as number, b = body.indices[nextLocal] as number;
        const edgeX = value(this.world.positions, a * 2) + (value(this.world.positions, b * 2) - value(this.world.positions, a * 2)) * t, edgeY = value(this.world.positions, a * 2 + 1) + (value(this.world.positions, b * 2 + 1) - value(this.world.positions, a * 2 + 1)) * t;
        fillers.positions[fillerCursor * 2] = center.x + (edgeX - center.x) * distribution.amount;
        fillers.positions[fillerCursor * 2 + 1] = center.y + (edgeY - center.y) * distribution.amount;
        fillers.radii[fillerCursor] = radius * scale;
        fillerCursor++;
      }
    }
    return {
      nodes: { count: nodeCursor, ...nodes },
      fixtures: { count: fixtureCursor, ...fixtures },
      fillers: { count: fillerCursor, ...fillers }
    };
  }

  packVisualPoints(fillDensity: number, paletteCount = 4, fillerScale = 1) {
    const scale = clamp(fillerScale, 0, 2);
    if (scale <= 0.001) return { count: 0, positions: new Float32Array(0), radii: new Float32Array(0), seeds: new Float32Array(0) };
    const ringCounts = this.bodies.map(body => Math.max(0, Math.round((2 + fillDensity * 4.75) * Math.sqrt(Math.max(1, body.restRadius / Math.max(12, (this.world.radii[body.indices[0] as number] ?? 3) * 3.2))))));
    const sampleCounts = this.bodies.map((body, index) => Math.max(0, Math.round((18 + fillDensity * 34) * Math.sqrt(Math.max(1, body.restRadius / Math.max(12, (this.world.radii[body.indices[0] as number] ?? 3) * 3.2)))) * (ringCounts[index] ? 1 : 0)));
    const capacity = this.bodies.reduce((sum, _body, index) => sum + 1 + (sampleCounts[index] ?? 0) * ((ringCounts[index] ?? 0) + 1), 0);
    const positions = new Float32Array(capacity * 2), radii = new Float32Array(capacity), seeds = new Float32Array(capacity);
    let count = 0;
    for (const [bodyIndex, body] of this.bodies.entries()) {
      const center = this.boundaryCenter(body), first = body.indices[0] as number, baseRadius = this.world.radii[first] ?? 3, rings = ringCounts[bodyIndex] ?? 0, samples = sampleCounts[bodyIndex] ?? 0;
      const paletteIndex = Math.max(0, body.seed - 1) % Math.max(1, paletteCount);
      const paletteCoordinate = paletteCount > 1 ? paletteIndex / (paletteCount - 1) : 0;
      positions[count * 2] = center.x; positions[count * 2 + 1] = center.y; radii[count] = baseRadius * scale; seeds[count++] = paletteCoordinate;
      const fillerCount = samples * (rings + 1);
      for (let filler = 0; filler < fillerCount; filler++) {
        const distribution = fillerDistribution(filler, fillerCount, bodyIndex * 0.173), scaled = distribution.phase * body.indices.length, local = Math.floor(scaled) % body.indices.length, nextLocal = (local + 1) % body.indices.length, t = scaled - Math.floor(scaled);
        const edgeA = body.indices[local] as number, edgeB = body.indices[nextLocal] as number;
        const ex = value(this.world.positions, edgeA * 2) + (value(this.world.positions, edgeB * 2) - value(this.world.positions, edgeA * 2)) * t, ey = value(this.world.positions, edgeA * 2 + 1) + (value(this.world.positions, edgeB * 2 + 1) - value(this.world.positions, edgeA * 2 + 1)) * t;
        positions[count * 2] = center.x + (ex - center.x) * distribution.amount; positions[count * 2 + 1] = center.y + (ey - center.y) * distribution.amount; radii[count] = baseRadius * scale; seeds[count++] = paletteCoordinate;
      }
    }
    return { count, positions, radii, seeds };
  }

  private solveBody(body: SoftBody, tuning: SoftBodyTuning) {
    const target = body.restArea, softness = Math.max(0, Math.min(1, tuning.squishiness / 2));
    const previewSoftness = this.preview ? 0.42 : 1;
    const elasticEdgeScale = Math.pow(1 / (1 + tuning.boundaryElasticity * 1.65), 1.65);
    const elasticBendScale = Math.pow(1 / (1 + tuning.boundaryElasticity * 2.25), 1.9);
    const edgeStiffness = (0.20 + (1 - softness) * 0.40) * previewSoftness * elasticEdgeScale;
    const bendStiffness = clamp((0.01 + (1 - softness) * 0.09) * (this.preview ? 0.22 : 1) * elasticBendScale * tuning.shapeRigidity, 0, 0.95);
    const areaStiffness = (0.045 + (1 - softness) * 0.15) * (this.preview ? 0.32 : 1) * tuning.areaPressure * (1 + Math.sqrt(tuning.boundaryElasticity) * 0.12);
    const edgeDamping = tuning.membraneDamping * (0.012 + Math.min(4, tuning.boundaryElasticity) * 0.026);
    for (let i = 0; i < body.indices.length; i++) {
      const a = body.indices[i] as number, b = body.indices[(i + 1) % body.indices.length] as number;
      this.solveDistance(a, b, body.edgeRest[i] ?? body.edgeBase[i] ?? 1, edgeStiffness);
      this.dampMembraneVelocity(a, b, edgeDamping);
    }
    for (let i = 0; i < body.indices.length; i++) {
      this.solveDistance(
        body.indices[i] as number,
        body.indices[(i + 2) % body.indices.length] as number,
        body.bendRest[i] ?? body.bendBase[i] ?? 1,
        bendStiffness,
      );
    }
    const gradientsX = this.areaGradientX, gradientsY = this.areaGradientY;
    let currentArea = 0, denominator = 0;
    for (let i = 0; i < body.indices.length; i++) {
      const previous = body.indices[(i - 1 + body.indices.length) % body.indices.length] as number;
      const particle = body.indices[i] as number;
      const next = body.indices[(i + 1) % body.indices.length] as number;
      const particleX = value(this.world.positions, particle * 2), particleY = value(this.world.positions, particle * 2 + 1);
      const nextX = value(this.world.positions, next * 2), nextY = value(this.world.positions, next * 2 + 1);
      currentArea += particleX * nextY - particleY * nextX;
      const gx = 0.5 * (nextY - value(this.world.positions, previous * 2 + 1));
      const gy = 0.5 * (value(this.world.positions, previous * 2) - nextX);
      gradientsX[i] = gx; gradientsY[i] = gy; denominator += gx * gx + gy * gy;
    }
    currentArea *= 0.5;
    if (denominator > 1e-6) {
      const lambda = -(currentArea - target) / denominator * areaStiffness, maxCorrection = tuning.blobSize * 0.06;
      if (Math.abs(currentArea - target) >= target * 0.002) for (let i = 0; i < body.indices.length; i++) { const index = body.indices[i] as number, dx = lambda * (gradientsX[i] ?? 0), dy = lambda * (gradientsY[i] ?? 0), length = Math.hypot(dx, dy), scale = length > maxCorrection ? maxCorrection / (length + 1e-6) : 1; this.movePosition(index, dx * scale, dy * scale); }
    }
    const surface = tuning.surfaceTension * 0.06 * (this.preview ? 0.18 : 1);
    if (surface > 0) for (let i = 0; i < body.indices.length; i++) {
      const index = body.indices[i] as number;
      const previous = body.indices[(i - 1 + body.indices.length) % body.indices.length] as number;
      const next = body.indices[(i + 1) % body.indices.length] as number;
      this.movePosition(
        index,
        ((value(this.world.positions, previous * 2) + value(this.world.positions, next * 2)) * 0.5 - value(this.world.positions, index * 2)) * surface,
        ((value(this.world.positions, previous * 2 + 1) + value(this.world.positions, next * 2 + 1)) * 0.5 - value(this.world.positions, index * 2 + 1)) * surface,
      );
    }
    const membrane = 0.72 * Math.pow(1 / (1 + tuning.boundaryElasticity * 0.72), 1.35);
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
        this.movePosition(index, nx * correction, ny * correction);
        this.movePosition(a, -nx * correction * 0.035, -ny * correction * 0.035);
        this.movePosition(b, -nx * correction * 0.035, -ny * correction * 0.035);
      }
    }
  }

  private solveDistance(a: number, b: number, rest: number, stiffness: number) {
    const ao = a * 2, bo = b * 2, dx = value(this.world.positions, bo) - value(this.world.positions, ao), dy = value(this.world.positions, bo + 1) - value(this.world.positions, ao + 1), distance = Math.hypot(dx, dy);
    if (distance < 1e-6) return;
    const correction = (distance - rest) / distance * 0.5 * stiffness;
    this.movePosition(a, dx * correction, dy * correction);
    this.movePosition(b, -dx * correction, -dy * correction);
  }

  private dampMembraneVelocity(a: number, b: number, damping: number) {
    if (damping <= 0) return;
    const ao = a * 2, bo = b * 2, dx = value(this.world.positions, bo) - value(this.world.positions, ao), dy = value(this.world.positions, bo + 1) - value(this.world.positions, ao + 1), distance = Math.hypot(dx, dy);
    if (distance < 1e-6) return;
    const nx = dx / distance, ny = dy / distance;
    const velocityAX = value(this.world.positions, ao) - value(this.world.particles.previousPositions, ao), velocityAY = value(this.world.positions, ao + 1) - value(this.world.particles.previousPositions, ao + 1);
    const velocityBX = value(this.world.positions, bo) - value(this.world.particles.previousPositions, bo), velocityBY = value(this.world.positions, bo + 1) - value(this.world.particles.previousPositions, bo + 1);
    const impulse = ((velocityBX - velocityAX) * nx + (velocityBY - velocityAY) * ny) * damping * 0.5;
    this.world.particles.previousPositions[ao] = value(this.world.particles.previousPositions, ao) - nx * impulse;
    this.world.particles.previousPositions[ao + 1] = value(this.world.particles.previousPositions, ao + 1) - ny * impulse;
    this.world.particles.previousPositions[bo] = value(this.world.particles.previousPositions, bo) + nx * impulse;
    this.world.particles.previousPositions[bo + 1] = value(this.world.particles.previousPositions, bo + 1) + ny * impulse;
  }

  private integrate(dt: number) {
    const damping = 0.996 - this.viscosity * 0.01;
    const acceleration = this.gravity * dt * dt;
    const previous = this.world.particles.previousPositions;
    for (let particle = 0; particle < this.world.count; particle++) {
      if ((this.world.inverseMasses[particle] ?? 0) <= 0) {
        previous[particle * 2] = value(this.world.positions, particle * 2);
        previous[particle * 2 + 1] = value(this.world.positions, particle * 2 + 1);
        continue;
      }
      const offset = particle * 2, x = value(this.world.positions, offset), y = value(this.world.positions, offset + 1);
      const velocityX = (x - value(previous, offset)) * damping;
      const velocityY = (y - value(previous, offset + 1)) * damping;
      previous[offset] = x;
      previous[offset + 1] = y;
      this.world.positions[offset] = x + velocityX;
      this.world.positions[offset + 1] = y + velocityY + acceleration;
    }
  }

  private solveWalls() {
    const left = 0, right = this.width, top = -160, bottom = this.height;
    const friction = 0.74 + this.viscosity * 0.12;
    const previous = this.world.particles.previousPositions;
    for (let particle = 0; particle < this.world.count; particle++) {
      if ((this.world.inverseMasses[particle] ?? 0) <= 0) continue;
      const offset = particle * 2, radius = this.world.radii[particle] ?? 1;
      if (value(this.world.positions, offset) < left + radius) {
        this.world.positions[offset] = left + radius;
        if (value(this.world.positions, offset) - value(previous, offset) < 0) previous[offset] = value(this.world.positions, offset);
      } else if (value(this.world.positions, offset) > right - radius) {
        this.world.positions[offset] = right - radius;
        if (value(this.world.positions, offset) - value(previous, offset) > 0) previous[offset] = value(this.world.positions, offset);
      }
      if (value(this.world.positions, offset + 1) < top + radius) {
        this.world.positions[offset + 1] = top + radius;
        if (value(this.world.positions, offset + 1) - value(previous, offset + 1) < 0) previous[offset + 1] = value(this.world.positions, offset + 1);
      } else if (value(this.world.positions, offset + 1) > bottom - radius) {
        this.world.positions[offset + 1] = bottom - radius;
        const velocityX = value(this.world.positions, offset) - value(previous, offset);
        if (value(this.world.positions, offset + 1) - value(previous, offset + 1) > 0) previous[offset + 1] = value(this.world.positions, offset + 1);
        previous[offset] = value(this.world.positions, offset) - velocityX * friction;
      }
    }
  }

  private updateGridShape() {
    let largestRadius = 4;
    for (let particle = 0; particle < this.world.count; particle++) largestRadius = Math.max(largestRadius, this.world.radii[particle] ?? 0);
    this.gridCellSize = Math.max(18, largestRadius * 6.25);
    this.gridWidth = Math.ceil(this.width / this.gridCellSize) + 2;
    this.gridHeight = Math.ceil(this.height / this.gridCellSize) + 5;
    const required = this.gridWidth * this.gridHeight;
    if (this.gridHeads.length !== required) this.gridHeads = new Int32Array(required);
  }

  private buildGrid() {
    this.gridHeads.fill(-1);
    for (let particle = 0; particle < this.world.count; particle++) {
      const offset = particle * 2;
      const gx = clamp(Math.floor(value(this.world.positions, offset) / this.gridCellSize), 0, this.gridWidth - 1);
      const gy = clamp(Math.floor(value(this.world.positions, offset + 1) / this.gridCellSize), 0, this.gridHeight - 1);
      const cell = gy * this.gridWidth + gx;
      this.gridNext[particle] = this.gridHeads[cell] ?? -1;
      this.gridHeads[cell] = particle;
    }
  }

  private forEachGridPair(visitor: (left: number, right: number) => void) {
    for (let gy = 0; gy < this.gridHeight; gy++) {
      const row = gy * this.gridWidth, nextRow = row + this.gridWidth;
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const cell = row + gx;
        if ((this.gridHeads[cell] ?? -1) === -1) continue;
        for (let left = this.gridHeads[cell] ?? -1; left !== -1; left = this.gridNext[left] ?? -1) {
          for (let right = this.gridNext[left] ?? -1; right !== -1; right = this.gridNext[right] ?? -1) visitor(left, right);
        }
        if (gx + 1 < this.gridWidth) this.forEachCellPair(cell, cell + 1, visitor);
        if (gy + 1 < this.gridHeight) {
          this.forEachCellPair(cell, nextRow + gx, visitor);
          if (gx > 0) this.forEachCellPair(cell, nextRow + gx - 1, visitor);
          if (gx + 1 < this.gridWidth) this.forEachCellPair(cell, nextRow + gx + 1, visitor);
        }
      }
    }
  }

  private forEachCellPair(leftCell: number, rightCell: number, visitor: (left: number, right: number) => void) {
    for (let left = this.gridHeads[leftCell] ?? -1; left !== -1; left = this.gridNext[left] ?? -1) {
      for (let right = this.gridHeads[rightCell] ?? -1; right !== -1; right = this.gridNext[right] ?? -1) visitor(left, right);
    }
  }

  private solveContacts(squishiness: number) {
    const softness = clamp(squishiness / 2, 0, 1);
    const sameBodyStrength = (0.14 + (1 - softness) * 0.22) * (this.preview ? 0.58 : 1);
    const otherBodyStrength = (0.42 + (1 - softness) * 0.13) * (this.preview ? 0.72 : 1);
    this.forEachGridPair((left, right) => { this.solveContactPair(left, right, sameBodyStrength, otherBodyStrength); });
  }

  private solveContactPair(left: number, right: number, sameBodyStrength: number, otherBodyStrength: number) {
    const leftFixed = (this.world.inverseMasses[left] ?? 0) <= 0, rightFixed = (this.world.inverseMasses[right] ?? 0) <= 0;
    if (leftFixed && rightFixed) return;
    const sameBody = !leftFixed && !rightFixed && (this.bodyOf[left] ?? -1) >= 0 && this.bodyOf[left] === this.bodyOf[right];
    if (sameBody && this.adjacentBoundary(left, right)) return;
    const minimum = ((this.world.radii[left] ?? 1) + (this.world.radii[right] ?? 1)) * (sameBody ? 0.88 : 1);
    const leftOffset = left * 2, rightOffset = right * 2;
    const dx = value(this.world.positions, rightOffset) - value(this.world.positions, leftOffset);
    const dy = value(this.world.positions, rightOffset + 1) - value(this.world.positions, leftOffset + 1);
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimum * minimum || distanceSquared < 1e-6) return;
    const distance = Math.sqrt(distanceSquared), normalX = dx / distance, normalY = dy / distance;
    const correction = Math.min((minimum - distance) * (sameBody ? sameBodyStrength : otherBodyStrength), Math.min(this.world.radii[left] ?? 1, this.world.radii[right] ?? 1) * 0.56);
    if (leftFixed) this.movePosition(right, normalX * correction, normalY * correction);
    else if (rightFixed) this.movePosition(left, -normalX * correction, -normalY * correction);
    else {
      this.movePosition(left, -normalX * correction * 0.5, -normalY * correction * 0.5);
      this.movePosition(right, normalX * correction * 0.5, normalY * correction * 0.5);
    }
  }

  private adjacentBoundary(left: number, right: number) {
    const bodyIndex = this.bodyOf[left] ?? -1;
    if (bodyIndex < 0 || bodyIndex !== (this.bodyOf[right] ?? -2)) return false;
    const body = this.bodies[bodyIndex];
    if (!body) return false;
    const leftLocal = this.localOf[left] ?? -1, rightLocal = this.localOf[right] ?? -1;
    if (leftLocal < 0 || rightLocal < 0 || leftLocal >= body.indices.length || rightLocal >= body.indices.length) return false;
    const difference = Math.abs(leftLocal - rightLocal);
    return Math.min(difference, body.indices.length - difference) <= 1;
  }

  private settleContactVelocities() {
    const damping = 0.18 + this.viscosity * 0.36;
    const previous = this.world.particles.previousPositions;
    this.forEachGridPair((left, right) => {
      if ((this.world.inverseMasses[left] ?? 0) <= 0 || (this.world.inverseMasses[right] ?? 0) <= 0) return;
      const leftOffset = left * 2, rightOffset = right * 2;
      const dx = value(this.world.positions, rightOffset) - value(this.world.positions, leftOffset);
      const dy = value(this.world.positions, rightOffset + 1) - value(this.world.positions, leftOffset + 1);
      const minimum = ((this.world.radii[left] ?? 1) + (this.world.radii[right] ?? 1)) * 1.03;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimum * minimum || distanceSquared < 1e-6) return;
      const distance = Math.sqrt(distanceSquared), normalX = dx / distance, normalY = dy / distance;
      const relativeX = (value(this.world.positions, rightOffset) - value(previous, rightOffset)) - (value(this.world.positions, leftOffset) - value(previous, leftOffset));
      const relativeY = (value(this.world.positions, rightOffset + 1) - value(previous, rightOffset + 1)) - (value(this.world.positions, leftOffset + 1) - value(previous, leftOffset + 1));
      const normalVelocity = relativeX * normalX + relativeY * normalY;
      if (normalVelocity >= 0) return;
      const impulse = -normalVelocity * damping * 0.5;
      previous[leftOffset] = value(previous, leftOffset) + normalX * impulse;
      previous[leftOffset + 1] = value(previous, leftOffset + 1) + normalY * impulse;
      previous[rightOffset] = value(previous, rightOffset) - normalX * impulse;
      previous[rightOffset + 1] = value(previous, rightOffset + 1) - normalY * impulse;
    });
  }

  private applyViscosity() {
    if (this.viscosity <= 0.001) return;
    const blendBase = 0.045 + this.viscosity * 0.155;
    const previous = this.world.particles.previousPositions;
    this.forEachGridPair((left, right) => {
      if ((this.world.inverseMasses[left] ?? 0) <= 0 || (this.world.inverseMasses[right] ?? 0) <= 0 || this.bodyOf[left] !== this.bodyOf[right] || this.adjacentBoundary(left, right)) return;
      const leftOffset = left * 2, rightOffset = right * 2;
      const dx = value(this.world.positions, rightOffset) - value(this.world.positions, leftOffset);
      const dy = value(this.world.positions, rightOffset + 1) - value(this.world.positions, leftOffset + 1);
      const range = ((this.world.radii[left] ?? 1) + (this.world.radii[right] ?? 1)) * 2.85;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= range * range || distanceSquared < 1e-6) return;
      const weight = 1 - Math.sqrt(distanceSquared) / range;
      const velocityLeftX = value(this.world.positions, leftOffset) - value(previous, leftOffset), velocityLeftY = value(this.world.positions, leftOffset + 1) - value(previous, leftOffset + 1);
      const velocityRightX = value(this.world.positions, rightOffset) - value(previous, rightOffset), velocityRightY = value(this.world.positions, rightOffset + 1) - value(previous, rightOffset + 1);
      const blend = blendBase * weight * weight, impulseX = (velocityRightX - velocityLeftX) * blend, impulseY = (velocityRightY - velocityLeftY) * blend;
      previous[leftOffset] = value(previous, leftOffset) - impulseX;
      previous[leftOffset + 1] = value(previous, leftOffset + 1) - impulseY;
      previous[rightOffset] = value(previous, rightOffset) + impulseX;
      previous[rightOffset + 1] = value(previous, rightOffset + 1) + impulseY;
    });
  }

  private syncVelocities(dt: number) {
    const previous = this.world.particles.previousPositions;
    for (let particle = 0; particle < this.world.count; particle++) {
      const offset = particle * 2;
      this.world.velocities[offset] = (value(this.world.positions, offset) - value(previous, offset)) / Math.max(1e-6, dt);
      this.world.velocities[offset + 1] = (value(this.world.positions, offset + 1) - value(previous, offset + 1)) / Math.max(1e-6, dt);
    }
  }

  private applyPlasticity(dt: number, plasticFlow: number) {
    const rate = Math.max(0, plasticFlow) * 0.55 * dt;
    if (rate <= 0) return;
    for (const body of this.bodies) for (let i = 0; i < body.indices.length; i++) {
      const a = body.indices[i] as number, edge = body.indices[(i + 1) % body.indices.length] as number, bend = body.indices[(i + 2) % body.indices.length] as number;
      const edgeLength = this.particleDistance(a, edge), bendLength = this.particleDistance(a, bend), edgeBase = body.edgeBase[i] ?? edgeLength, bendBase = body.bendBase[i] ?? bendLength;
      body.edgeRest[i] = clamp((body.edgeRest[i] ?? edgeLength) + (edgeLength - (body.edgeRest[i] ?? edgeLength)) * rate, edgeBase * 0.68, edgeBase * 1.52);
      body.bendRest[i] = clamp((body.bendRest[i] ?? bendLength) + (bendLength - (body.bendRest[i] ?? bendLength)) * rate, bendBase * 0.65, bendBase * 1.58);
    }
  }

  private particleDistance(a: number, b: number) { return Math.hypot(value(this.world.positions, b * 2) - value(this.world.positions, a * 2), value(this.world.positions, b * 2 + 1) - value(this.world.positions, a * 2 + 1)); }

  private movePosition(index: number, dx: number, dy: number) {
    if ((this.world.inverseMasses[index] ?? 0) <= 0) return;
    const offset = index * 2;
    this.world.positions[offset] = value(this.world.positions, offset) + dx;
    this.world.positions[offset + 1] = value(this.world.positions, offset + 1) + dy;
  }
  private center(body: SoftBody) {
    let x = 0, y = 0;
    for (const index of body.indices) { x += value(this.world.positions, index * 2); y += value(this.world.positions, index * 2 + 1); }
    for (const index of body.interiorIndices) { x += value(this.world.positions, index * 2); y += value(this.world.positions, index * 2 + 1); }
    const count = body.indices.length + body.interiorIndices.length;
    return { x: x / Math.max(1, count), y: y / Math.max(1, count) };
  }
  private boundaryCenter(body: SoftBody) {
    let x = 0, y = 0;
    for (const index of body.indices) { x += value(this.world.positions, index * 2); y += value(this.world.positions, index * 2 + 1); }
    return { x: x / Math.max(1, body.indices.length), y: y / Math.max(1, body.indices.length) };
  }
  private random() {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 4294967296;
  }
}

function pointBuffers(count: number) {
  return { positions: new Float32Array(count * 2), radii: new Float32Array(count), seeds: new Float32Array(count) };
}
function fillerDistribution(index: number, count: number, phaseOffset: number) {
  const phase = (index * 0.6180339887498949 + phaseOffset) % 1;
  const area = (index + 0.5) / Math.max(1, count);
  return { amount: Math.sqrt(area) * 0.985, phase };
}

export interface SoftBodyPoint { readonly x: number; readonly y: number }
type Point = SoftBodyPoint;
export function softBodyNodeRadiusForDensity(density: number) { const t = Math.max(0, Math.min(1, (density - 0.35) / (2.5 - 0.35))); return 22 + (8.5 - 22) * Math.sqrt(t); }
function boundaryCountForSize(size: number, density: number) { return Math.max(12, Math.min(128, Math.round(Math.PI * 2 * size / (softBodyNodeRadiusForDensity(density) * 1.32)))); }
function boundaryCountForPerimeter(perimeter: number, density: number) { return Math.max(12, Math.min(128, Math.round(perimeter / (softBodyNodeRadiusForDensity(density) * 1.32)))); }
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
function pointDistance(a: Point, b: Point) { return Math.hypot(b.x - a.x, b.y - a.y); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function catmull(p0: number, p1: number, p2: number, p3: number, t: number) { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function value(array: Float32Array, index: number) { return array[index] ?? 0; }

export function prepareSoftBodyDrawBlueprint(
  points: readonly Point[],
  smoothing: number,
  density: number,
  width: number,
  height: number,
): SoftBodyDrawBlueprint | undefined {
  if (points.length < 5) return undefined;
  const optimized = optimizeDrawnShape(points, smoothing);
  const boundaryCount = boundaryCountForPerimeter(polylineLength(optimized), density);
  const outline = resampleClosed(optimized, boundaryCount);
  if (outline.length !== boundaryCount) return undefined;
  if (area(outline) < 0) outline.reverse();
  let centerX = 0, centerY = 0;
  for (const point of outline) { centerX += point.x; centerY += point.y; }
  centerX /= outline.length; centerY /= outline.length;
  let radius = 0;
  for (const point of outline) radius += pointDistance(point, { x: centerX, y: centerY });
  radius = clamp(radius / outline.length, 18, 86);
  const restArea = Math.max(Math.abs(area(outline)), Math.PI * radius * radius * 0.35);
  const clampedCenterX = clamp(centerX, radius + 10, width - radius - 10);
  const clampedCenterY = clamp(centerY, radius + 10, height - radius - 10);
  const offsetX = clampedCenterX - centerX, offsetY = clampedCenterY - centerY;
  const translated = outline.map(point => Object.freeze({ x: point.x + offsetX, y: point.y + offsetY }));
  return Object.freeze({
    outline: Object.freeze(translated),
    centerX: clampedCenterX,
    centerY: clampedCenterY,
    radius,
    restArea,
  });
}

function optimizeDrawnShape(points: readonly Point[], smoothing: number): Point[] {
  const normalizedSmoothing = clamp(smoothing, 0, 1), minSpacing = 3 + normalizedSmoothing * 8;
  const cleaned: Point[] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || pointDistance(previous, point) >= minSpacing) cleaned.push({ x: point.x, y: point.y });
  }
  if (cleaned.length < 5) return cleaned;
  const first = cleaned[0] as Point, last = cleaned[cleaned.length - 1] as Point;
  if (pointDistance(first, last) < minSpacing) cleaned.pop();
  let smoothed = cleaned;
  const passes = Math.round(normalizedSmoothing * 4), cut = 0.18 + normalizedSmoothing * 0.14;
  for (let pass = 0; pass < passes; pass++) {
    const nextShape: Point[] = [];
    for (let index = 0; index < smoothed.length; index++) {
      const a = smoothed[index] as Point, b = smoothed[(index + 1) % smoothed.length] as Point;
      nextShape.push(
        { x: a.x + (b.x - a.x) * cut, y: a.y + (b.y - a.y) * cut },
        { x: a.x + (b.x - a.x) * (1 - cut), y: a.y + (b.y - a.y) * (1 - cut) },
      );
    }
    smoothed = nextShape;
  }
  if (normalizedSmoothing <= 0.01) return smoothed;
  const relaxation = normalizedSmoothing * 0.18;
  return smoothed.map((point, index) => {
    const previous = smoothed[(index + smoothed.length - 1) % smoothed.length] as Point;
    const next = smoothed[(index + 1) % smoothed.length] as Point;
    return {
      x: point.x + ((previous.x + point.x + next.x) / 3 - point.x) * relaxation,
      y: point.y + ((previous.y + point.y + next.y) / 3 - point.y) * relaxation,
    };
  });
}
