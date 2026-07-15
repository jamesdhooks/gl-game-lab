import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createSoftBodyBlobConfig, prepareSoftBodyDrawBlueprint, SOFT_BODY_BLOB_DEFAULTS, SOFT_BODY_BLOB_STYLE_MANIFEST, softBodyBlobDefinition, SoftBodyModel, type SoftBody, type SoftBodyTuning } from '../index.js';

const DEFAULT_TUNING: SoftBodyTuning = Object.freeze({
  blobSize: 42,
  squishiness: 0.78,
  surfaceTension: 0.28,
  areaPressure: 1,
  plasticFlow: 0.18,
  boundaryElasticity: 0.8,
  shapeRigidity: 1,
  membraneDamping: 0.28,
  constraintPasses: 7,
});

describe('Soft Body Blob', () => {
  it('registers draw, build, interact, and ten styles', () => {
    const definition = new ExperienceRegistry().register(softBodyBlobDefinition).get('soft-body-blob');
    expect(definition.modes?.map(mode => mode.id)).toEqual([
      'draw',
      'build',
      'interact'
    ]);
    expect(SOFT_BODY_BLOB_STYLE_MANIFEST.styles).toHaveLength(10);
  });
  it('builds a closed constrained body and GPU mesh', () => {
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    const body = model.addBlob(300, 150, 42, 1);
    expect(body?.indices.length).toBeGreaterThan(12);
    expect(body?.edgeRest).toHaveLength(body?.indices.length ?? 0);
    expect(body?.bendRest).toHaveLength(body?.indices.length ?? 0);
    const mesh = model.packMesh();
    expect(mesh.vertexCount).toBeGreaterThan((body?.indices.length ?? 0) * 3);
    expect(mesh.edgeFactors.slice(0, 3)).toEqual(new Float32Array([0, 0.25, 0.25]));
    model.addFixture([{ x: 80, y: 120 }, { x: 100, y: 120 }], 8);
    const basic = model.packBasicVisualLayers(1.15);
    expect(basic.nodes.count).toBe((body?.indices.length ?? 0) + (body?.interiorIndices.length ?? 0));
    expect(basic.fixtures.count).toBeGreaterThan(1);
    expect(model.packBuildFixtures()).toMatchObject({ count: 1 });
    expect(basic.fillers.count).toBeGreaterThan(20);
    const visual = model.packVisualPoints(1.15);
    expect(visual.count).toBeGreaterThan(20);
    expectFillerCoverage(basic.fillers.positions, 0, basic.fillers.count, model, body);
    expectFillerCoverage(visual.positions, 0, visual.count, model, body);
    const halfScale = model.packBasicVisualLayers(1.15, 0.5).fillers;
    expect(halfScale.radii[0]).toBeCloseTo((model.world.radii[body?.indices[0] ?? 0] ?? 0) * 0.5, 4);
    expect(model.packBasicVisualLayers(1.15, 0).fillers.count).toBe(0);
    expect(model.packVisualPoints(1.15, 4, 0).count).toBe(0);
    expect(new Set(basic.nodes.seeds)).toEqual(new Set([0]));
  });
  it('centers visual fillers on the membrane instead of settled interior nodes', () => {
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    const body = model.addBlob(300, 180, 60, 1);
    expect(body).toBeDefined();
    for (const index of body?.interiorIndices ?? []) model.world.positions[index * 2 + 1] = (model.world.positions[index * 2 + 1] ?? 0) + 90;
    const boundaryCenterX = (body?.indices ?? []).reduce((sum, index) => sum + (model.world.positions[index * 2] ?? 0), 0) / (body?.indices.length ?? 1);
    const boundaryCenterY = (body?.indices ?? []).reduce((sum, index) => sum + (model.world.positions[index * 2 + 1] ?? 0), 0) / (body?.indices.length ?? 1);
    const fillers = model.packBasicVisualLayers(1).fillers;
    const mesh = model.packMesh();
    expect(fillers.positions[0]).toBeCloseTo(boundaryCenterX, 4);
    expect(fillers.positions[1]).toBeCloseTo(boundaryCenterY, 4);
    expect(mesh.positions[0]).toBeCloseTo(boundaryCenterX, 4);
    expect(mesh.positions[1]).toBeCloseTo(boundaryCenterY, 4);
    const firstBoundary = body?.indices[0] ?? 0;
    const rawRadius = Math.hypot((model.world.positions[firstBoundary * 2] ?? 0) - boundaryCenterX, (model.world.positions[firstBoundary * 2 + 1] ?? 0) - boundaryCenterY);
    const skinRadius = Math.hypot((mesh.positions[2] ?? 0) - boundaryCenterX, (mesh.positions[3] ?? 0) - boundaryCenterY);
    expect(skinRadius).toBeGreaterThan(rawRadius + (model.world.radii[firstBoundary] ?? 0) * 0.9);
  });
  it('assigns successive drawn bodies across the complete active palette', () => {
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    for (let index = 0; index < 4; index++) model.addBlob(120 + index * 160, 180, 42, 1);
    const basicSeeds = [...new Set(model.packBasicVisualLayers(1).nodes.seeds)].sort();
    const enhancedSeeds = [...new Set(model.packMesh().colorSeeds)].sort();
    const ultraCoordinates = [...new Set(model.packVisualPoints(1, 4).seeds)].map(value => Number(value.toFixed(3))).sort();
    expect(basicSeeds).toEqual([0, 1, 2, 3]);
    expect(enhancedSeeds).toEqual([0, 1, 2, 3]);
    expect(ultraCoordinates).toEqual([0, 0.333, 0.667, 1]);
  });
  it('keeps neighboring membrane nodes connected under sustained gravity', () => {
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    model.configure({ gravity: 1250, solverIterations: 2, substeps: 2, collisionSoftness: 0.85, constraintPasses: 7, openTop: true });
    const body = model.addBlob(300, 120, 52, 1);
    expect(body).toBeDefined();
    for (let frame = 0; frame < 180; frame++) model.step(1 / 60, DEFAULT_TUNING);
    const indices = body?.indices ?? [], radius = model.world.radii[indices[0] ?? 0] ?? 1;
    let maximumGap = 0;
    for (let index = 0; index < indices.length; index++) {
      const a = (indices[index] ?? 0) * 2, b = (indices[(index + 1) % indices.length] ?? 0) * 2;
      maximumGap = Math.max(maximumGap, Math.hypot((model.world.positions[b] ?? 0) - (model.world.positions[a] ?? 0), (model.world.positions[b + 1] ?? 0) - (model.world.positions[a + 1] ?? 0)));
    }
    expect(maximumGap).toBeLessThan(radius * 2.25);
  });
  it('collides the visible membrane with the actual viewport edges', () => {
    const model = new SoftBodyModel(true);
    model.reset(200, 200, 42);
    model.configure({ gravity: 0, contactFriction: 0, substeps: 1 });
    const body = model.addBlob(40, 100, 24, 2.5);
    expect(body).toBeDefined();
    const previous = model.world.particles.previousPositions;
    for (const index of [...(body?.indices ?? []), ...(body?.interiorIndices ?? [])]) {
      model.world.positions[index * 2] = (model.world.positions[index * 2] ?? 0) - 80;
      previous[index * 2] = model.world.positions[index * 2] ?? 0;
    }

    model.step(1 / 60, { ...DEFAULT_TUNING, areaPressure: 0, surfaceTension: 0, constraintPasses: 2 });

    const minimumVisibleEdge = Math.min(...(body?.indices ?? []).map((index) =>
      (model.world.positions[index * 2] ?? 0) - (model.world.radii[index] ?? 0)));
    expect(minimumVisibleEdge).toBeGreaterThanOrEqual(-0.001);
    expect(minimumVisibleEdge).toBeLessThan(0.5);
  });
  it('uses the original resampled draw blueprint and preserves authored area', () => {
    const gesture = Array.from({ length: 48 }, (_, index) => {
      const angle = index / 48 * Math.PI * 2;
      return { x: 320 + Math.cos(angle) * 86, y: 220 + Math.sin(angle) * (52 + Math.cos(angle * 3) * 8) };
    });
    const blueprint = prepareSoftBodyDrawBlueprint(gesture, 0.45, 1, 800, 600);
    expect(blueprint).toBeDefined();
    expect(blueprint?.outline.length).toBeGreaterThan(12);
    expect(blueprint?.restArea).toBeGreaterThan(Math.PI * (blueprint?.radius ?? 0) ** 2 * 0.34);
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    const body = blueprint ? model.addBlob(blueprint.centerX, blueprint.centerY, blueprint.radius, 1, blueprint.outline, blueprint.restArea) : undefined;
    expect(body?.restArea).toBeCloseTo(blueprint?.restArea ?? 0, 4);
  });
  it('distributes interior particles with the original seeded golden-angle layout', () => {
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    const body = model.addBlob(300, 180, 60, 1);
    expect(body).toBeDefined();
    const quadrants = new Set<string>();
    let maximumRadius = 0;
    for (const index of body?.interiorIndices ?? []) {
      const x = (model.world.positions[index * 2] ?? 0) - 300, y = (model.world.positions[index * 2 + 1] ?? 0) - 180;
      maximumRadius = Math.max(maximumRadius, Math.hypot(x, y));
      quadrants.add(`${x >= 0 ? 1 : -1},${y >= 0 ? 1 : -1}`);
    }
    expect(quadrants.size).toBe(4);
    expect(maximumRadius).toBeLessThan(60 * 0.78);
  });
  it('makes area pressure restore authored volume', () => {
    const lowPressure = deformedModel('compress');
    const highPressure = deformedModel('compress');
    for (let frame = 0; frame < 24; frame++) {
      lowPressure.model.step(1 / 60, { ...DEFAULT_TUNING, areaPressure: 0, surfaceTension: 0 });
      highPressure.model.step(1 / 60, { ...DEFAULT_TUNING, areaPressure: 2, surfaceTension: 0 });
    }
    expect(Math.abs(bodyArea(highPressure.model, highPressure.body) - highPressure.body.restArea)).toBeLessThan(Math.abs(bodyArea(lowPressure.model, lowPressure.body) - lowPressure.body.restArea));
  });

  it('makes surface tension smooth local membrane roughness', () => {
    const noTension = deformedModel('compress');
    const highTension = deformedModel('compress');
    for (let frame = 0; frame < 8; frame++) {
      noTension.model.step(1 / 60, { ...DEFAULT_TUNING, areaPressure: 0, surfaceTension: 0 });
      highTension.model.step(1 / 60, { ...DEFAULT_TUNING, areaPressure: 0, surfaceTension: 1 });
    }
    expect(boundaryRoughness(highTension.model, highTension.body)).toBeLessThan(boundaryRoughness(noTension.model, noTension.body));
  });

  it('makes squishiness, boundary elasticity, and shape passes independently control membrane retention', () => {
    const lowSquish = deformedModel('stretch');
    const highSquish = deformedModel('stretch');
    const lowElasticity = deformedModel('stretch');
    const highElasticity = deformedModel('stretch');
    const fewPasses = deformedModel('stretch');
    const manyPasses = deformedModel('stretch');
    lowSquish.model.step(1 / 60, { ...DEFAULT_TUNING, squishiness: 0, boundaryElasticity: 0, constraintPasses: 2 });
    highSquish.model.step(1 / 60, { ...DEFAULT_TUNING, squishiness: 2, boundaryElasticity: 0, constraintPasses: 2 });
    lowElasticity.model.step(1 / 60, { ...DEFAULT_TUNING, squishiness: 0.78, boundaryElasticity: 0, constraintPasses: 2 });
    highElasticity.model.step(1 / 60, { ...DEFAULT_TUNING, squishiness: 0.78, boundaryElasticity: 10, constraintPasses: 2 });
    fewPasses.model.step(1 / 60, { ...DEFAULT_TUNING, squishiness: 0, boundaryElasticity: 0, constraintPasses: 2 });
    manyPasses.model.step(1 / 60, { ...DEFAULT_TUNING, squishiness: 0, boundaryElasticity: 0, constraintPasses: 14 });
    expect(edgeStrain(lowSquish.model, lowSquish.body)).toBeLessThan(edgeStrain(highSquish.model, highSquish.body));
    expect(edgeStrain(lowElasticity.model, lowElasticity.body)).toBeLessThan(edgeStrain(highElasticity.model, highElasticity.body));
    expect(edgeStrain(manyPasses.model, manyPasses.body)).toBeLessThan(edgeStrain(fewPasses.model, fewPasses.body));
  });

  it('makes Shape Rigidity directly control the restored bend constraint', () => {
    const flexible = deformedModel('stretch');
    const rigid = deformedModel('stretch');
    for (let frame = 0; frame < 6; frame++) {
      flexible.model.step(1 / 60, { ...DEFAULT_TUNING, boundaryElasticity: 4.63, shapeRigidity: 0 });
      rigid.model.step(1 / 60, { ...DEFAULT_TUNING, boundaryElasticity: 4.63, shapeRigidity: 20 });
    }
    expect(bendStrain(rigid.model, rigid.body)).toBeLessThan(bendStrain(flexible.model, flexible.body));
  });
  it('makes plastic flow alter rest shape while zero flow remains elastic', () => {
    const elastic = deformedModel('stretch');
    const plastic = deformedModel('stretch');
    for (let frame = 0; frame < 45; frame++) {
      elastic.model.step(1 / 60, { ...DEFAULT_TUNING, plasticFlow: 0, boundaryElasticity: 8 });
      plastic.model.step(1 / 60, { ...DEFAULT_TUNING, plasticFlow: 1, boundaryElasticity: 8 });
    }
    expect(restShapeDrift(elastic.body)).toBe(0);
    expect(restShapeDrift(plastic.body)).toBeGreaterThan(0.002);
  });
  it('uses gravity, viscosity, membrane damping, and substeps independently', () => {
    const still = dynamicModel();
    const falling = dynamicModel();
    const inviscid = dynamicModel();
    const viscous = dynamicModel();
    const undamped = dynamicModel(), damped = dynamicModel();
    const oneSubstep = deformedModel('stretch'), fiveSubsteps = deformedModel('stretch');
    still.model.configure({ gravity: 0, contactFriction: 0, substeps: 1 });
    falling.model.configure({ gravity: 1800, contactFriction: 0, substeps: 1 });
    inviscid.model.configure({ gravity: 0, contactFriction: 0, substeps: 2 });
    viscous.model.configure({ gravity: 0, contactFriction: 1, substeps: 2 });
    undamped.model.configure({ gravity: 0, contactFriction: 0, substeps: 2 });
    damped.model.configure({ gravity: 0, contactFriction: 0, substeps: 2 });
    oneSubstep.model.configure({ gravity: 0, contactFriction: 0, substeps: 1 });
    fiveSubsteps.model.configure({ gravity: 0, contactFriction: 0, substeps: 5 });
    seedAlternatingVelocity(inviscid.model, inviscid.body, 4);
    seedAlternatingVelocity(viscous.model, viscous.body, 4);
    seedAlternatingVelocity(undamped.model, undamped.body, 4);
    seedAlternatingVelocity(damped.model, damped.body, 4);
    const stillStart = bodyCenterY(still.model, still.body);
    const fallingStart = bodyCenterY(falling.model, falling.body);
    for (let frame = 0; frame < 12; frame++) {
      still.model.step(1 / 60, { ...DEFAULT_TUNING, membraneDamping: 0 });
      falling.model.step(1 / 60, { ...DEFAULT_TUNING, membraneDamping: 0 });
      inviscid.model.step(1 / 60, { ...DEFAULT_TUNING, membraneDamping: 0 });
      viscous.model.step(1 / 60, { ...DEFAULT_TUNING, membraneDamping: 0 });
      undamped.model.step(1 / 60, { ...DEFAULT_TUNING, membraneDamping: 0 });
      damped.model.step(1 / 60, { ...DEFAULT_TUNING, membraneDamping: 1 });
    }
    oneSubstep.model.step(1 / 60, { ...DEFAULT_TUNING, constraintPasses: 2 });
    fiveSubsteps.model.step(1 / 60, { ...DEFAULT_TUNING, constraintPasses: 2 });
    expect(bodyCenterY(falling.model, falling.body) - fallingStart).toBeGreaterThan(bodyCenterY(still.model, still.body) - stillStart + 4);
    expect(meanSpeed(viscous.model, viscous.body)).toBeLessThan(meanSpeed(inviscid.model, inviscid.body));
    expect(meanSpeed(damped.model, damped.body)).toBeLessThan(meanSpeed(undamped.model, undamped.body));
    expect(edgeStrain(fiveSubsteps.model, fiveSubsteps.body)).toBeLessThan(edgeStrain(oneSubstep.model, oneSubstep.body));
  });

  it('uses density, blob size, draw smoothing, and interaction radius', () => {
    const still = dynamicModel();
    expect(still.model.pickBodies(500, 180, 16)).toHaveLength(0);
    expect(still.model.pickBodies(500, 180, 280)).toContain(0);
    const sparse = new SoftBodyModel(), dense = new SoftBodyModel();
    sparse.reset(800, 600, 7); dense.reset(800, 600, 7);
    const sparseBody = sparse.addBlob(300, 180, 42, 0.35), denseBody = dense.addBlob(300, 180, 68, 2.5);
    expect(denseBody?.indices.length ?? 0).toBeGreaterThan(sparseBody?.indices.length ?? 0);
    expect(denseBody?.restArea ?? 0).toBeGreaterThan(sparseBody?.restArea ?? 0);
    const roughGesture = Array.from({ length: 32 }, (_, index) => {
      const angle = index / 32 * Math.PI * 2, noise = index % 2 === 0 ? 14 : -14;
      return { x: 320 + Math.cos(angle) * (72 + noise), y: 240 + Math.sin(angle) * (72 + noise) };
    });
    const unsmoothed = prepareSoftBodyDrawBlueprint(roughGesture, 0, 1, 800, 600);
    const smoothed = prepareSoftBodyDrawBlueprint(roughGesture, 1, 1, 800, 600);
    expect(smoothed?.outline.length).not.toBe(unsmoothed?.outline.length);
  });
  it('preserves maintained settings and bounds', () => {
    expect(createSoftBodyBlobConfig()).toEqual(SOFT_BODY_BLOB_DEFAULTS);
    expect(() => createSoftBodyBlobConfig({
      squishiness: 3
    })).toThrow('outside its supported range');
  });
});

function dynamicModel(): { readonly model: SoftBodyModel; readonly body: SoftBody } {
  const model = new SoftBodyModel();
  model.reset(800, 600, 42);
  const body = model.addBlob(300, 180, 60, 1);
  if (!body) throw new Error('Expected soft body fixture');
  return { model, body };
}

function deformedModel(kind: 'compress' | 'stretch'): { readonly model: SoftBodyModel; readonly body: SoftBody } {
  const result = dynamicModel();
  const centerX = 300, centerY = 180, previous = result.model.world.particles.previousPositions;
  for (const [local, index] of result.body.indices.entries()) {
    const offset = index * 2;
    let x = result.model.world.positions[offset] ?? centerX;
    let y = result.model.world.positions[offset + 1] ?? centerY;
    if (kind === 'compress') {
      x = centerX + (x - centerX) * 0.42;
      const radialNoise = local % 2 === 0 ? 7 : -7;
      y += radialNoise;
    } else if (local === 0) x += 44;
    result.model.world.positions[offset] = x;
    result.model.world.positions[offset + 1] = y;
    previous[offset] = x;
    previous[offset + 1] = y;
  }
  return result;
}

function bodyArea(model: SoftBodyModel, body: SoftBody): number {
  let area = 0;
  for (let local = 0; local < body.indices.length; local++) {
    const left = (body.indices[local] ?? 0) * 2, right = (body.indices[(local + 1) % body.indices.length] ?? 0) * 2;
    area += (model.world.positions[left] ?? 0) * (model.world.positions[right + 1] ?? 0) - (model.world.positions[left + 1] ?? 0) * (model.world.positions[right] ?? 0);
  }
  return Math.abs(area * 0.5);
}

function boundaryRoughness(model: SoftBodyModel, body: SoftBody): number {
  let total = 0;
  for (let local = 0; local < body.indices.length; local++) {
    const previous = (body.indices[(local + body.indices.length - 1) % body.indices.length] ?? 0) * 2;
    const current = (body.indices[local] ?? 0) * 2, next = (body.indices[(local + 1) % body.indices.length] ?? 0) * 2;
    total += Math.hypot((model.world.positions[current] ?? 0) - ((model.world.positions[previous] ?? 0) + (model.world.positions[next] ?? 0)) * 0.5, (model.world.positions[current + 1] ?? 0) - ((model.world.positions[previous + 1] ?? 0) + (model.world.positions[next + 1] ?? 0)) * 0.5);
  }
  return total / body.indices.length;
}

function edgeStrain(model: SoftBodyModel, body: SoftBody): number {
  let total = 0;
  for (let local = 0; local < body.indices.length; local++) {
    const left = (body.indices[local] ?? 0) * 2, right = (body.indices[(local + 1) % body.indices.length] ?? 0) * 2;
    const length = Math.hypot((model.world.positions[right] ?? 0) - (model.world.positions[left] ?? 0), (model.world.positions[right + 1] ?? 0) - (model.world.positions[left + 1] ?? 0));
    total += Math.abs(length - (body.edgeRest[local] ?? length));
  }
  return total / body.indices.length;
}

function bendStrain(model: SoftBodyModel, body: SoftBody): number {
  let total = 0;
  for (let local = 0; local < body.indices.length; local++) {
    const left = (body.indices[local] ?? 0) * 2, right = (body.indices[(local + 2) % body.indices.length] ?? 0) * 2;
    const length = Math.hypot((model.world.positions[right] ?? 0) - (model.world.positions[left] ?? 0), (model.world.positions[right + 1] ?? 0) - (model.world.positions[left + 1] ?? 0));
    total += Math.abs(length - (body.bendRest[local] ?? length));
  }
  return total / body.indices.length;
}

function restShapeDrift(body: SoftBody): number {
  let total = 0;
  for (let local = 0; local < body.edgeRest.length; local++) total += Math.abs((body.edgeRest[local] ?? 0) - (body.edgeBase[local] ?? 0));
  return total / Math.max(1, body.edgeRest.length);
}

function seedAlternatingVelocity(model: SoftBodyModel, body: SoftBody, amount: number) {
  const previous = model.world.particles.previousPositions;
  for (const [local, index] of [...body.indices, ...body.interiorIndices].entries()) {
    const offset = index * 2;
    previous[offset] = (model.world.positions[offset] ?? 0) - (local % 2 === 0 ? amount : -amount);
  }
}

function bodyCenterY(model: SoftBodyModel, body: SoftBody): number {
  const indices = [...body.indices, ...body.interiorIndices];
  return indices.reduce((sum, index) => sum + (model.world.positions[index * 2 + 1] ?? 0), 0) / indices.length;
}

function meanSpeed(model: SoftBodyModel, body: SoftBody): number {
  const indices = [...body.indices, ...body.interiorIndices];
  return indices.reduce((sum, index) => sum + Math.hypot(model.world.velocities[index * 2] ?? 0, model.world.velocities[index * 2 + 1] ?? 0), 0) / indices.length;
}

function expectFillerCoverage(positions: Float32Array, start: number, count: number, model: SoftBodyModel, body: SoftBody | undefined, expectCenter = true) {
  if (!body) throw new Error('Expected soft body fixture');
  const centerX = body.indices.reduce((sum, index) => sum + (model.world.positions[index * 2] ?? 0), 0) / body.indices.length;
  const centerY = body.indices.reduce((sum, index) => sum + (model.world.positions[index * 2 + 1] ?? 0), 0) / body.indices.length;
  const extent = body.indices.reduce((maximum, index) => Math.max(maximum, Math.hypot((model.world.positions[index * 2] ?? 0) - centerX, (model.world.positions[index * 2 + 1] ?? 0) - centerY)), 0);
  const distances = Array.from({ length: count }, (_, local) => {
    const offset = (start + local) * 2;
    return Math.hypot((positions[offset] ?? 0) - centerX, (positions[offset + 1] ?? 0) - centerY);
  });
  expect(distances.filter(distance => distance < 0.01)).toHaveLength(expectCenter ? 1 : 0);
  expect(Math.max(...distances)).toBeGreaterThan(extent * 0.85);
  expect(distances.filter(distance => distance < extent * 0.25).length).toBeLessThan(count * 0.1);
}
