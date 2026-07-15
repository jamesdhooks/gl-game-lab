import { describe, expect, it } from 'vitest';
import { validateDynamicTriangleMeshBatch } from '../DynamicTriangleMeshRenderer.js';
describe('DynamicTriangleMeshRenderer', () => {
  it('accepts packed triangle geometry', () => {
    expect(() => validateDynamicTriangleMeshBatch({
      vertexCount: 3,
      positions: new Float32Array(6),
      colorSeeds: new Float32Array(3)
    })).not.toThrow();
  });
  it('rejects incomplete triangles', () => {
    expect(() => validateDynamicTriangleMeshBatch({
      vertexCount: 4,
      positions: new Float32Array(8),
      colorSeeds: new Float32Array(4)
    })).toThrow('multiple of three');
  });
  it('validates optional soft-body edge factors', () => {
    expect(() => validateDynamicTriangleMeshBatch({
      vertexCount: 3,
      positions: new Float32Array(6),
      colorSeeds: new Float32Array(3),
      edgeFactors: new Float32Array(2)
    })).toThrow('edge factors');
  });
});
