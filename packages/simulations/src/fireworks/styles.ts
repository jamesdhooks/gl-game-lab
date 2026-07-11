import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';

export const FIREWORKS_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'festival-night', renderLayers: ['particles', 'trails', 'glow', 'debug'],
  passes: ['trailFeedback', 'edgeGlow', 'bloom', 'colorGrade', 'chromaticAberration'], qualities: ['raw'],
  styles: [
    style('festival-night', 'Festival Night', 'Balanced jewel-tone fireworks against a blue-black sky.', [0xffffff, 0xffd166, 0xff4d6d, 0x4dffcf, 0x8fb3ff, 0xc77dff, 0xff8fab], 0x050816),
    style('gold-willow', 'Gold Willow', 'Warm champagne trails with ember-red crackle tips.', [0xfff7c2, 0xffd166, 0xff9f1c, 0xe85d04, 0xfff3b0, 0xffb703], 0x090604),
    style('neon-smoke', 'Neon Smoke', 'Electric cyan, violet, lime, and hot pink.', [0x9bffef, 0x00f5d4, 0x00bbf9, 0xfee440, 0xf15bb5, 0x9b5de5, 0xffffff], 0x02020a),
    style('peony-garden', 'Peony Garden', 'Soft floral bursts in rose, lavender, mint, and cream.', [0xfb7185, 0xc084fc, 0x86efac, 0xfffbeb], 0x080612),
    style('dragon-finale', 'Dragon Finale', 'Red-gold festival shells with smoky ember trails.', [0xdc2626, 0xf97316, 0xfacc15, 0xfff7ad], 0x0d0303),
    style('ice-comets', 'Ice Comets', 'Blue-white comet shells with cold cyan crackle.', [0x38bdf8, 0x93c5fd, 0xe0f2fe, 0xffffff], 0x020617),
    style('acid-rain', 'Acid Rain', 'Toxic lime and electric aqua sparks over black sky.', [0xbaff29, 0x22c55e, 0x22d3ee, 0xf0fdf4], 0x020803),
    style('rose-gold', 'Rose Gold', 'Champagne, rose, and pearl sparks for elegant finales.', [0xf9a8d4, 0xfbcfe8, 0xfacc15, 0xfffbeb], 0x10070d),
    style('ultraviolet', 'Ultraviolet', 'Blacklight violet bursts with cyan and magenta fringes.', [0x7e22ce, 0xc084fc, 0x22d3ee, 0xec4899], 0x05020d),
    style('paper-lanterns', 'Paper Lanterns', 'Warm lantern oranges and soft cream sparks.', [0xb45309, 0xf97316, 0xfbbf24, 0xffedd5], 0x090502),
  ],
});

export function color3(color: number): readonly [number, number, number] { return [((color >>> 16) & 255) / 255, ((color >>> 8) & 255) / 255, (color & 255) / 255]; }
function style(id: string, name: string, description: string, palette: readonly number[], background: number) { return Object.freeze({ id, name, description, palette: Object.freeze(palette), background, passes: Object.freeze(['trailFeedback', 'bloom']) }); }
