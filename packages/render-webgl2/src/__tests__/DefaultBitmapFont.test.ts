import { describe, expect, it } from 'vitest';
import { createDefaultBitmapFontAtlas } from '../DefaultBitmapFont.js';

describe('default bitmap font', () => {
  it('provides a unique, populated atlas for game HUD text', () => {
    const atlas = createDefaultBitmapFontAtlas();
    const rows = Math.ceil(atlas.characters.length / atlas.columns);
    expect(new Set(atlas.characters).size).toBe(atlas.characters.length);
    expect(atlas.pixels).toHaveLength(atlas.columns * atlas.glyphWidth * rows * atlas.glyphHeight * 4);
    expect(atlas.pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });
});
