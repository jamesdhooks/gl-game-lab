import { describe, expect, it } from 'vitest';
import type { GpuFieldMesh2D } from '@hooksjam/gl-game-lab-engine';
import { fieldMeshRequiresUpload } from '../GpuFieldMeshPass.js';

function mesh(revision?: number): GpuFieldMesh2D {
  return {
    vertexCount: 3,
    positions: new Float32Array(6),
    cells: new Float32Array(6),
    facets: new Float32Array(3),
    ...(revision === undefined ? {} : { revision }),
  };
}

describe('GpuFieldMeshPass upload policy', () => {
  it('retains static mesh buffers until the mesh identity or revision changes', () => {
    const staticMesh = mesh();
    expect(fieldMeshRequiresUpload(undefined, undefined, staticMesh)).toBe(true);
    expect(fieldMeshRequiresUpload(staticMesh, undefined, staticMesh)).toBe(false);
    expect(fieldMeshRequiresUpload(staticMesh, undefined, mesh())).toBe(true);

    let revision = 1;
    const dynamicMesh: GpuFieldMesh2D = {
      ...mesh(),
      get revision() { return revision; },
    };
    expect(fieldMeshRequiresUpload(dynamicMesh, 1, dynamicMesh)).toBe(false);
    revision = 2;
    expect(fieldMeshRequiresUpload(dynamicMesh, 1, dynamicMesh)).toBe(true);
  });
});
