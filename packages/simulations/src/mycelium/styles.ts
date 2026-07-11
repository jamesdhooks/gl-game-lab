import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const MYCELIUM_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'synaptic-fungus',
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
    s('synaptic-fungus', 'Synaptic Fungus', 'Electric neural mycelium over deep violet substrate.', [
      8141549,
      10980346,
      2282478,
      440020,
      15772668,
      15485081,
      16777215,
      12891645
    ], 525594),
    s('rot-bloom', 'Rot Bloom', 'Warm compost, amber spores, and green hyphae.', [
      3560212,
      8702998,
      14285213,
      16708551,
      16096779,
      11817737,
      7877903,
      10741301
    ], 1051397),
    s('arctic-lichen', 'Arctic Lichen', 'Pale ice threads and cold mineral glow.', [
      14742270,
      6809849,
      947344,
      9684477,
      1920728,
      16777215,
      12248829,
      3718648
    ], 463133),
    s('black-paper', 'Black Paper', 'Inky high-resolution lattice on paper-white substrate.', [
      0,
      1118481,
      3359061,
      6583435,
      1976635,
      4674921,
      988970,
      9741240
    ], 16183783),
    s('coral-mycorrhiza', 'Coral Mycorrhiza', 'Warm reef oranges, pinks, and mineral teal growth.', [
      16739179,
      16478597,
      16622767,
      16772565,
      3003583,
      1357990,
      16347926,
      16436245
    ], 1181450),
    s('toxic-orchid', 'Toxic Orchid', 'Venom greens split through violet orchid filaments.', [
      4988309,
      8266446,
      12616956,
      15772668,
      12513892,
      8702998,
      2278750,
      15531211
    ], 591383),
    s('ember-ash', 'Ember Ash', 'Charcoal substrate with ember red and molten gold veins.', [
      986895,
      2696484,
      8330525,
      14427686,
      16347926,
      16436245,
      16772565,
      7877903
    ], 328451),
    s('deep-sea-bloom', 'Deep Sea Bloom', 'Bioluminescent cyan, kelp green, and abyssal blues.', [
      132631,
      988970,
      1981066,
      2450411,
      440020,
      6220500,
      8702998,
      14285213
    ], 132108),
    s('bone-spore', 'Bone Spore', 'Dry bone, umber shadows, and ghostly lichen whites.', [
      1841431,
      4472892,
      7893356,
      14078929,
      16119284,
      11051678,
      5722958,
      16710888
    ], 789001),
    s('infrared-moss', 'Infrared Moss', 'False-color magenta foliage over electric moss greens.', [
      1332013,
      2278750,
      8843180,
      15793652,
      12458077,
      15485081,
      16361684,
      8330525
    ], 397322)
  ]
});
export function myceliumColor3(color: number): readonly [
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
