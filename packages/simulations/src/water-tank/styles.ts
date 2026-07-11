import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const WATER_TANK_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'clear-lagoon',
  renderLayers: [
    'particles',
    'density',
    'obstacles'
  ],
  passes: [
    'primitive',
    'densityMetaball',
    'bloom'
  ],
  qualities: [
    'raw'
  ],
  styles: [
    s('clear-lagoon', 'Clear Lagoon', 'Bright teal water with white foam.', [
      12122111,
      5101823,
      741258,
      16777215
    ], 201759),
    s('deep-pool', 'Deep Pool', 'Deep blue water with pale surface highlights.', [
      8246268,
      165063,
      536393,
      14742270
    ], 132631),
    s('glacier-milk', 'Glacier Milk', 'Milky glacial cyan and white water.', [
      15793663,
      10875900,
      6333946,
      16777215
    ], 463135),
    s('toxic-rinse', 'Toxic Rinse', 'Green chemical rinse with mint foam.', [
      15531211,
      2278750,
      1332013,
      11006928
    ], 266762),
    s('violet-tide', 'Violet Tide', 'Purple water with cyan specular edges.', [
      15324671,
      11032055,
      3223169,
      6809849
    ], 525594),
    s('ink-wash', 'Ink Wash', 'Grey-black liquid over a paper-white tank.', [
      14870768,
      4674921,
      132631,
      9684477
    ], 16317180),
    s('sunlit-creek', 'Sunlit Creek', 'Golden sunlight over clear creek water.', [
      16710083,
      3718648,
      1013358,
      16708551
    ], 529166),
    s('rose-water', 'Rose Water', 'Translucent rose water with white highlights.', [
      16770278,
      16478597,
      10424889,
      15792639
    ], 1312523),
    s('storm-drain', 'Storm Drain', 'Steel-grey runoff with blue reflections.', [
      13358561,
      6583435,
      1120295,
      3718648
    ], 198418),
    s('biolume-bay', 'Biolume Bay', 'Bioluminescent green-cyan tidal water.', [
      14285213,
      2282478,
      413243,
      15793658
    ], 135439)
  ]
});
export function waterColor3(color: number): readonly [
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
export function waterColor4(color: number): readonly [
  number,
  number,
  number,
  number
] {
  const c = waterColor3(color);
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
