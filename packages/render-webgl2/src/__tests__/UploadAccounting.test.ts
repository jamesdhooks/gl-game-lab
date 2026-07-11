import { describe, expect, it } from 'vitest';
import { metaballUploadBytes, segmentUploadBytes, triangleMeshUploadBytes } from '../UploadAccounting.js';

describe('active upload accounting', () => {
  it('counts active values rather than typed-array capacity', () => {
    expect(segmentUploadBytes({
      id: 'segments', count: 2, segments: new Float32Array(400), styles: new Float32Array(200),
      worldWidth: 1, worldHeight: 1, palette: [[1, 1, 1]],
    })).toBe(2 * 6 * 4);
    expect(triangleMeshUploadBytes({
      id: 'mesh', vertexCount: 3, positions: new Float32Array(600), colorSeeds: new Float32Array(300),
      worldWidth: 1, worldHeight: 1, palette: [[1, 1, 1]],
    })).toBe(3 * 3 * 4);
    expect(metaballUploadBytes({
      id: 'metaballs', count: 5, positions: new Float32Array(1_000), radii: new Float32Array(500),
      temperatures: new Float32Array(500), worldWidth: 1, worldHeight: 1, fieldScale: 1,
      particleRadiusScale: 1, threshold: 1, edgeSoftness: 1, palette: [[1, 1, 1], [0, 0, 0]],
      background: [0, 0, 0], thermalContrast: 1, refraction: 0, gloss: 0, rimLighting: 0, opacity: 1,
    })).toBe(5 * 4 * 4);
  });
});
