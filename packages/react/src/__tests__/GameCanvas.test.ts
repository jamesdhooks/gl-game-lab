import { describe, expect, it } from 'vitest';
import { normalizeFixedFrameCapture } from '../GameCanvas.js';

describe('normalizeFixedFrameCapture', () => {
  it('provides a deterministic sixty-hertz default', () => {
    expect(normalizeFixedFrameCapture({ frameNumber: 120 })).toEqual({
      frameNumber: 120,
      fixedDeltaSeconds: 1 / 60,
    });
  });

  it('rejects unsafe capture bounds', () => {
    expect(() => normalizeFixedFrameCapture({ frameNumber: 0 })).toThrow('between 1 and 10000');
    expect(() => normalizeFixedFrameCapture({ frameNumber: 1, fixedDeltaSeconds: 0.5 })).toThrow('at most 0.25');
  });
});
