import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createSoftBodyBlobConfig, SOFT_BODY_BLOB_DEFAULTS, SOFT_BODY_BLOB_STYLE_MANIFEST, softBodyBlobDefinition, SoftBodyModel } from '../index.js';
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
    expect(model.packMesh().vertexCount).toBeGreaterThan((body?.indices.length ?? 0) * 3);
    model.addFixture([{ x: 80, y: 120 }, { x: 100, y: 120 }], 8);
    const basic = model.packBasicVisualLayers(1.15);
    expect(basic.nodes.count).toBe((body?.indices.length ?? 0) + (body?.interiorIndices.length ?? 0));
    expect(basic.fixtures.count).toBeGreaterThan(1);
    expect(model.packBuildFixtures()).toMatchObject({ count: 1 });
    expect(basic.fillers.count).toBeGreaterThan(20);
    expect(model.packVisualPoints(1.15).count).toBeGreaterThan(basic.nodes.count + 20);
    expect(new Set(basic.nodes.seeds)).toEqual(new Set([0]));
  });
  it('keeps neighboring membrane nodes connected under sustained gravity', () => {
    const model = new SoftBodyModel();
    model.reset(800, 600, 42);
    model.configure({ gravity: 1250, solverIterations: 2, substeps: 2, collisionSoftness: 0.85, constraintPasses: 7, openTop: true });
    const body = model.addBlob(300, 120, 52, 1);
    expect(body).toBeDefined();
    const tuning = { squishiness: 0.78, surfaceTension: 0.28, areaPressure: 1, plasticFlow: 0.18, boundaryElasticity: 0.8, membraneDamping: 0.28, constraintPasses: 7 };
    for (let frame = 0; frame < 180; frame++) model.step(1 / 60, tuning);
    const indices = body?.indices ?? [], radius = model.world.radii[indices[0] ?? 0] ?? 1;
    let maximumGap = 0;
    for (let index = 0; index < indices.length; index++) {
      const a = (indices[index] ?? 0) * 2, b = (indices[(index + 1) % indices.length] ?? 0) * 2;
      maximumGap = Math.max(maximumGap, Math.hypot((model.world.positions[b] ?? 0) - (model.world.positions[a] ?? 0), (model.world.positions[b + 1] ?? 0) - (model.world.positions[a + 1] ?? 0)));
    }
    expect(maximumGap).toBeLessThan(radius * 2.25);
  });
  it('preserves maintained settings and bounds', () => {
    expect(createSoftBodyBlobConfig()).toEqual(SOFT_BODY_BLOB_DEFAULTS);
    expect(() => createSoftBodyBlobConfig({
      squishiness: 3
    })).toThrow('outside its supported range');
  });
});
