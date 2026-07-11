import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const LAVA_LAMP_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'classic-wax',
  renderLayers: [
    'particles',
    'density',
    'far-depth'
  ],
  passes: [
    'primitive',
    'densityMetaball',
    'raymarch',
    'bloom'
  ],
  qualities: [
    'raw'
  ],
  styles: [
    s('classic-wax', 'Classic Wax', 'Warm cream and orange wax in a dark lamp.', [
      16773542,
      16734751,
      4722694,
      16758531
    ], 1180675),
    s('violet-magma', 'Violet Magma', 'Pink-violet wax with a deep amethyst body.', [
      16747775,
      8141549,
      1970237,
      15772668
    ], 590614),
    s('toxic-honey', 'Toxic Honey', 'Acid honey and leafy green thermal layers.', [
      16449402,
      8702998,
      1057290,
      16776171
    ], 397318),
    s('solar-core', 'Solar Core', 'White-hot wax cooling through amber and red.', [
      16777215,
      16756736,
      6688768,
      16727296
    ], 1311488),
    s('blue-paraffin', 'Blue Paraffin', 'Icy paraffin with blue-violet shadows.', [
      14678527,
      3718648,
      731722,
      8490232
    ], 133143),
    s('rose-quartz', 'Rose Quartz', 'Translucent rose wax with cream highlights.', [
      16765404,
      16478597,
      4853792,
      16361684
    ], 1312267),
    s('mint-plasma', 'Mint Plasma', 'Mint-white plasma over deep green glass.', [
      15400948,
      3462041,
      539698,
      6220500
    ], 135438),
    s('ember-smoke', 'Ember Smoke', 'Orange embers moving through smoky wax.', [
      16772565,
      15357964,
      1841431,
      7893356
    ], 525829),
    s('neon-grape', 'Neon Grape', 'Cyan and magenta wax against ultraviolet depth.', [
      2282478,
      14239471,
      3018853,
      15792639
    ], 458773),
    s('copper-oil', 'Copper Oil', 'Cream and copper oil with oxidized teal glints.', [
      16708551,
      11817737,
      2101256,
      1357990
    ], 722178)
  ]
});
export function lavaColor3(color: number): readonly [
  number,
  number,
  number
] {
  return [
    ((color >>> 16) & 255) / 255,
    ((color >>> 8) & 255) / 255,
    (color & 255) / 255
  ];
}
export function lavaColor4(color: number): readonly [
  number,
  number,
  number,
  number
] {
  const c = lavaColor3(color);
  return [
    c[0],
    c[1],
    c[2],
    1
  ];
}
function s(id: string, name: string, description: string, palette: readonly number[], background: number) {
  return Object.freeze({
    id,
    name,
    description,
    palette: Object.freeze(palette),
    background,
    passes: Object.freeze([
      'densityMetaball'
    ])
  });
}
