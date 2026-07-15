import type {
  MetaballBatch2D,
  SegmentBatch2D,
  TriangleMeshBatch2D,
} from '@hooksjam/gl-game-lab-engine';

const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

export function segmentUploadBytes(batch: SegmentBatch2D): number {
  return batch.count * (6 + (batch.colorSeeds ? 1 : 0) + (batch.endRadii ? 1 : 0)) * FLOAT_BYTES;
}

export function triangleMeshUploadBytes(batch: TriangleMeshBatch2D): number {
  return batch.vertexCount * (3 + (batch.edgeFactors ? 1 : 0)) * FLOAT_BYTES;
}

export function metaballUploadBytes(batch: MetaballBatch2D): number {
  return batch.count * 4 * FLOAT_BYTES;
}
