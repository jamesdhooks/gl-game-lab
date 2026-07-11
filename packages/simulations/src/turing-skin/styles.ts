import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const TURING_SKIN_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'leopard-gold',
  renderLayers: [
    'field',
    'glow'
  ],
  passes: [
    'fieldVisualize',
    'paletteMap',
    'bloom'
  ],
  qualities: [
    'raw'
  ],
  styles: [
    s('leopard-gold', 'Leopard Gold', 'Warm activator spots over ink-dark chemistry.', [
      16762967,
      2036480,
      16742938,
      16773826
    ], 525827),
    s('zebra-ghost', 'Zebra Ghost', 'Cold monochrome bands with spectral edges.', [
      16317439,
      2963272,
      9425919,
      16777215
    ], 329483),
    s('coral-morph', 'Coral Morph', 'Reef-pink morphogens blooming through teal inhibitor.', [
      16736143,
      3532498,
      16764782,
      16777215
    ], 463892),
    s('ink-paper', 'Ink Paper', 'Black morphogen skin on a light laboratory plate.', [
      1118481,
      7041664,
      0,
      4674921
    ], 16052194),
    s('poison-dart', 'Poison Dart', 'Blue, gold, and black amphibian warning colors.', [
      988970,
      959977,
      16436245,
      16317180
    ], 132631),
    s('manta-rose', 'Manta Rose', 'Soft rose morphogens over deep sea violet.', [
      4988309,
      16478597,
      16502760,
      3718648
    ], 459801),
    s('lichen-map', 'Lichen Map', 'Olive, chartreuse, and bone tones for organic maps.', [
      3560212,
      8702998,
      15531211,
      11051678
    ], 461572),
    s('thermal-hide', 'Thermal Hide', 'False-color heat skin with red-yellow boundaries.', [
      1973067,
      8266446,
      15680580,
      16707722
    ], 262930),
    s('snow-leopard', 'Snow Leopard', 'Pale fur fields with smoky charcoal pigment.', [
      16317180,
      13358561,
      3359061,
      988970
    ], 725024),
    s('reef-tiger', 'Reef Tiger', 'Aquatic tiger stripes in teal, orange, and pearl.', [
      1013358,
      3003583,
      16347926,
      16776171
    ], 200975)
  ]
});
export function turingColor3(color: number): readonly [
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
function s(id: string, name: string, description: string, palette: readonly number[], background: number) {
  return Object.freeze({
    id,
    name,
    description,
    palette: Object.freeze(palette),
    background,
    passes: Object.freeze([
      'fieldVisualize'
    ])
  });
}
