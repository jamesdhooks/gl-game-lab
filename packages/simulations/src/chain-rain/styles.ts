import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const CHAIN_RAIN_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'ice-thread',
  renderLayers: [
    'primitive',
    'body',
    'density'
  ],
  passes: [
    'paletteMap',
    'primitive',
    'body',
    'bloom'
  ],
  qualities: [
    'raw'
  ],
  styles: [
    s('ice-thread', 'Ice Thread', 'Crisp cyan ropes over a cold night field.', [
      7530751,
      15137791,
      7907583,
      16777215
    ], 329750),
    s('ember-cord', 'Ember Cord', 'Molten orange chain bodies with hot ivory highlights.', [
      16742938,
      16773304,
      16726831,
      16762967
    ], 1443587),
    s('violet-silk', 'Violet Silk', 'Purple rope strands with electric blue speculars.', [
      11889919,
      7791871,
      16740302,
      14206719
    ], 590618),
    s('acid-wire', 'Acid Wire', 'Toxic lime ropes with pale mint secondary color.', [
      12255017,
      14221288,
      3145640,
      16121722
    ], 397318),
    s('copper-serpent', 'Copper Serpent', 'Burnished copper snakes with teal oxidation glints.', [
      11817737,
      16347926,
      16708551,
      1357990
    ], 1181444),
    s('moss-rope', 'Moss Rope', 'Forest greens, fern highlights, and damp bark shadows.', [
      1467700,
      2278750,
      12318672,
      8736014
    ], 397320),
    s('bubblegum-snake', 'Bubblegum Snake', 'Playful pink, peach, mint, and sky candy snakes.', [
      16478597,
      16361684,
      16639626,
      6809849
    ], 1640730),
    s('carbon-fiber', 'Carbon Fiber', 'Graphite bodies with silver and electric blue seams.', [
      988970,
      6583435,
      14870768,
      3718648
    ], 132631),
    s('coral-chain', 'Coral Chain', 'Reef coral snakes with lagoon-blue highlights.', [
      16739179,
      16622767,
      3003583,
      16708551
    ], 1050378),
    s('royal-python', 'Royal Python', 'Deep indigo, gold, and pearl snake bodies.', [
      3223169,
      6514417,
      16436245,
      16776171
    ], 460563)
  ]
});
export function chainColor4(color: number, alpha = 1): readonly [
  number,
  number,
  number,
  number
] {
  return [
    ((color >>> 16) & 255) / 255,
    ((color >>> 8) & 255) / 255,
    (color & 255) / 255,
    alpha
  ];
}
export function chainColor3(color: number): readonly [
  number,
  number,
  number
] {
  const c = chainColor4(color);
  return [
    c[0],
    c[1],
    c[2]
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
      'paletteMap'
    ])
  });
}
