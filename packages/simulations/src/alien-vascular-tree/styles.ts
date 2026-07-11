import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const VASCULAR_TREE_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'coral-veins',
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
    s('coral-veins', 'Coral Veins', 'Pink vascular tissue with cyan nutrient pulses.', [
      16736143,
      2282478,
      16764782,
      16777215
    ], 590858),
    s('neon-roots', 'Neon Roots', 'Electric green roots over blue-black tissue.', [
      8702998,
      3718648,
      15793652,
      12058428
    ], 132631),
    s('gold-arbor', 'Gold Arbor', 'Golden canopy and amber nutrient glow.', [
      16436245,
      16742938,
      16776171,
      16707722
    ], 1181959),
    s('arterial-red', 'Arterial Red', 'Deep crimson vessels with oxygen-bright highlights.', [
      8330525,
      14427686,
      16757922,
      16776171
    ], 524802),
    s('xeno-lymph', 'Xeno Lymph', 'Acid lymph greens against violet alien tissue.', [
      4988309,
      8702998,
      14285213,
      12616956
    ], 459791),
    s('ice-capillary', 'Ice Capillary', 'Frozen blue capillaries with white nutrient sparks.', [
      1981066,
      6333946,
      13630206,
      16777215
    ], 198678),
    s('fungal-artery', 'Fungal Artery', 'Ochre, moss, and cream vessels through dark substrate.', [
      7421714,
      13273604,
      8702998,
      16708551
    ], 854275),
    s('synthetic-plasma', 'Synthetic Plasma', 'Laboratory magenta and cyan transport channels.', [
      14362487,
      2282478,
      10980346,
      16777215
    ], 525847),
    s('blacklight-vines', 'Blacklight Vines', 'UV purple vessels with hot green nutrient glow.', [
      3018853,
      9647082,
      2278750,
      15531211
    ], 328202),
    s('bone-marrow', 'Bone Marrow', 'Warm marrow reds and bone-white transport branches.', [
      10033947,
      16347926,
      16119260,
      7893356
    ], 853252)
  ]
});
export function vascularColor3(color: number): readonly [
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
