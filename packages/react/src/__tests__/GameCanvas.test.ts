import { describe, expect, it } from 'vitest';
import { normalizeFixedFrameCapture } from '../GameCanvas.js';

describe('normalizeFixedFrameCapture', () => {
  it('provides a deterministic sixty-hertz default', () => {
    expect(normalizeFixedFrameCapture({ frameNumber: 120 })).toEqual({
      frameNumber: 120,
      fixedDeltaSeconds: 1 / 60,
      inputEvents: [],
    });
  });

  it('rejects unsafe capture bounds', () => {
    expect(() => normalizeFixedFrameCapture({ frameNumber: 0 })).toThrow('between 1 and 10000');
    expect(() => normalizeFixedFrameCapture({ frameNumber: 1, fixedDeltaSeconds: 0.5 })).toThrow('at most 0.25');
    expect(() => normalizeFixedFrameCapture({
      frameNumber: 2,
      inputEvents: [
        { frameNumber: 1, event: { kind: 'pointer', phase: 'down', id: 1, x: 1, y: 1, buttons: 1 } },
        { frameNumber: 0, event: { kind: 'pointer', phase: 'up', id: 1, x: 1, y: 1, buttons: 0 } },
      ],
    })).toThrow('ordered by frame');
  });
});
