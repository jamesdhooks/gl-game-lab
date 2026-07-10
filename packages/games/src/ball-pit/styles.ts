import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';

export const BALL_PIT_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'rainbow',
  renderLayers: ['primitive'],
  passes: ['primitive', 'bloom'],
  qualities: ['raw'],
  styles: [
    style('rainbow', 'Rainbow', 'Bright mixed ball colors.', [0x8b5cf6, 0x22d3ee, 0xff6b9d, 0x4ade80, 0xfb923c], 0x050816, ['primitive']),
    style('pastel', 'Pastel', 'Soft low-contrast colors.', [0xf0abfc, 0xbfdbfe, 0xfde68a, 0xbbf7d0], 0x111827, ['primitive']),
    style('neon', 'Neon', 'High-energy glow palette.', [0x00f5ff, 0xff00e5, 0xd8ff00, 0xff7a00], 0x020617, ['primitive', 'bloom']),
    style('ocean', 'Ocean', 'Cool blue-green palette.', [0x38bdf8, 0x0ea5e9, 0x14b8a6, 0xa7f3d0], 0x031525, ['primitive']),
    style('candy', 'Candy', 'Sweet saturated palette.', [0xfb7185, 0xf9a8d4, 0xfacc15, 0x93c5fd], 0x171124, ['primitive']),
    style('rubber-room', 'Rubber Room', 'Primary toy-bin colors with a clean arcade floor.', [0xef4444, 0x2563eb, 0xfacc15, 0x22c55e, 0xffffff], 0x07101f, ['primitive']),
    style('soda-pop', 'Soda Pop', 'Fizzy pink, orange, lime, and blue plastic balls.', [0xff4d8d, 0xff8a2a, 0xc8ff3d, 0x3ddcff, 0xfff3b0], 0x16091d, ['primitive']),
    style('moon-gym', 'Moon Gym', 'Muted lunar playground colors over a dark mat.', [0xe5e7eb, 0x94a3b8, 0x60a5fa, 0xc084fc, 0xf8fafc], 0x050713, ['primitive']),
    style('jungle-bounce', 'Jungle Bounce', 'Leaf greens, mango orange, and tropical flower accents.', [0x14532d, 0x22c55e, 0xa3e635, 0xf97316, 0xec4899], 0x061207, ['primitive']),
    style('monochrome-pop', 'Monochrome Pop', 'Graphic black, white, graphite, and one hot red accent.', [0xf8fafc, 0x111827, 0x64748b, 0xd1d5db, 0xef4444], 0xf3f0e8, ['primitive']),
  ],
});

export function rgbHexToRgba(color: number): readonly [number, number, number, number] {
  return [
    ((color >>> 16) & 0xff) / 255,
    ((color >>> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    1,
  ];
}

function style(
  id: string,
  name: string,
  description: string,
  palette: readonly number[],
  background: number,
  passes: readonly string[],
) {
  return Object.freeze({ id, name, description, palette: Object.freeze(palette), background, passes: Object.freeze(passes) });
}
