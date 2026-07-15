import { describe, expect, it } from 'vitest';
import { validateInstancedSegmentBatch } from '../InstancedSegmentRenderer.js';

describe('InstancedSegmentRenderer', () => {
  it('accepts packed capsule segment data with optional palette seeds', () => {
    expect(() => validateInstancedSegmentBatch({
      count: 2,
      segments: new Float32Array(8),
      styles: new Float32Array(4),
      colorSeeds: new Float32Array(2),
      endRadii: new Float32Array(2),
    })).not.toThrow();
  });

  it('rejects incomplete packed data', () => {
    expect(() => validateInstancedSegmentBatch({ count: 2, segments: new Float32Array(4), styles: new Float32Array(4) })).toThrow('geometry');
    expect(() => validateInstancedSegmentBatch({ count: 2, segments: new Float32Array(8), styles: new Float32Array(4), colorSeeds: new Float32Array(1) })).toThrow('color seeds');
    expect(() => validateInstancedSegmentBatch({ count: 2, segments: new Float32Array(8), styles: new Float32Array(4), endRadii: new Float32Array(1) })).toThrow('end radii');
  });
});
