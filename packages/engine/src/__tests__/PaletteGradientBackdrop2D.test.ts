import { describe, expect, it } from 'vitest';
import type { Backdrop2DOptions } from '../Render2D.js';
import { applyPaletteGradientBackdrop2D } from '../PaletteGradientBackdrop2D.js';

describe('applyPaletteGradientBackdrop2D', () => {
  it('uses the Ball Pit gradient recipe by default', () => {
    const renderer = new RecordingRenderer();
    applyPaletteGradientBackdrop2D(renderer, {
      background: 0x102030,
      palette: [0xff0000, 0x00ff00, 0x0000ff, 0xffffff],
    });

    expect(renderer.clearColor).toEqual([16 / 255, 32 / 255, 48 / 255, 1]);
    expect(renderer.backdrop).toEqual({
      base: [16 / 255, 32 / 255, 48 / 255, 1],
      palette: [
        [1, 0, 0, 1],
        [0, 1, 0, 1],
        [0, 0, 1, 1],
        [1, 1, 1, 1],
      ],
      tier: 0.55,
      blendStrength: 0.12,
    });
  });

  it('can retain only the palette clear color for full-screen scene renderers', () => {
    const renderer = new RecordingRenderer();
    applyPaletteGradientBackdrop2D(renderer, { background: 0x000000, palette: [0xffffff] }, { enabled: false });
    expect(renderer.clearColor).toEqual([0, 0, 0, 1]);
    expect(renderer.backdrop).toBeUndefined();
  });
});

class RecordingRenderer {
  clearColor: readonly [number, number, number, number] | undefined;
  backdrop: Backdrop2DOptions | undefined;
  setClearColor(color: readonly [number, number, number, number]): void { this.clearColor = color; }
  setBackdrop(options: Backdrop2DOptions | undefined): void { this.backdrop = options; }
}
