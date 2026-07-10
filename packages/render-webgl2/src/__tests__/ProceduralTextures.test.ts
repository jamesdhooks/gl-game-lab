import { describe, expect, it } from 'vitest';
import { createCirclePixels } from '../index.js';

describe('createCirclePixels', () => {
  it('builds an antialiased white circle mask', () => {
    const size = 8;
    const pixels = createCirclePixels(size);
    const centerAlpha = pixels[((4 * size + 4) * 4) + 3];
    const cornerAlpha = pixels[3];
    expect(pixels).toHaveLength(size * size * 4);
    expect(centerAlpha).toBe(255);
    expect(cornerAlpha).toBe(0);
    expect([...pixels].some((value, index) => index % 4 === 3 && value > 0 && value < 255)).toBe(true);
  });
});
