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
    expect(model.world.constraintCount).toBeGreaterThan(body?.indices.length ?? 0);
    expect(model.packMesh().vertexCount).toBeGreaterThan((body?.indices.length ?? 0) * 3);
    model.addFixture([{ x: 80, y: 120 }, { x: 100, y: 120 }], 8);
    const basic = model.packBasicVisualLayers(1.15);
    expect(basic.nodes.count).toBe((body?.indices.length ?? 0) + (body?.interiorIndices.length ?? 0));
    expect(basic.fixtures.count).toBe(2);
    expect(basic.fillers.count).toBeGreaterThan(20);
    expect(basic.fillers.count).toBeLessThan(model.packVisualPoints(1.15).count - model.world.count);
    expect(new Set(basic.nodes.seeds)).toEqual(new Set([0]));
  });
  it('preserves maintained settings and bounds', () => {
    expect(createSoftBodyBlobConfig()).toEqual(SOFT_BODY_BLOB_DEFAULTS);
    expect(() => createSoftBodyBlobConfig({
      squishiness: 3
    })).toThrow('outside its supported range');
  });
});
