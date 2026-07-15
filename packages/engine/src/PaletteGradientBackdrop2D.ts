import type { ExperienceStyle } from './Experience.js';
import type { ColorRgba, Render2DService } from './Render2D.js';

export const DEFAULT_PALETTE_GRADIENT_TIER = 0.55;
export const DEFAULT_PALETTE_GRADIENT_BLEND_STRENGTH = 0.12;

export interface PaletteGradientBackdrop2DOptions {
  /** Disables the gradient while still applying the style's clear color. */
  readonly enabled?: boolean;
  readonly tier?: number;
  readonly blendStrength?: number;
}

/**
 * Applies the shared palette-gradient background used by Ball Pit.
 *
 * Scenes with a dedicated full-screen background pass should leave this
 * disabled; ordinary particle and geometry scenes should use this helper so
 * palette selection produces the same background composition everywhere.
 */
export function applyPaletteGradientBackdrop2D(
  renderer: Pick<Render2DService, 'setClearColor' | 'setBackdrop'>,
  style: Pick<ExperienceStyle, 'background' | 'palette'>,
  options: PaletteGradientBackdrop2DOptions = {},
): void {
  const base = colorRgba(style.background);
  renderer.setClearColor(base);
  if (options.enabled === false) {
    renderer.setBackdrop(undefined);
    return;
  }
  if (style.palette.length === 0) throw new Error('Palette gradient backdrop requires at least one palette color');
  renderer.setBackdrop({
    base,
    palette: style.palette.slice(0, 4).map(colorRgba),
    tier: options.tier ?? DEFAULT_PALETTE_GRADIENT_TIER,
    blendStrength: options.blendStrength ?? DEFAULT_PALETTE_GRADIENT_BLEND_STRENGTH,
  });
}

export function paletteGradientColorRgba(color: number): ColorRgba {
  return colorRgba(color);
}

function colorRgba(color: number): ColorRgba {
  if (!Number.isSafeInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error('Palette gradient color must be a 24-bit RGB integer');
  }
  return Object.freeze([
    ((color >> 16) & 255) / 255,
    ((color >> 8) & 255) / 255,
    (color & 255) / 255,
    1,
  ]);
}
