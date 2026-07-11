import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const SOFT_BODY_BLOB_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'candy-cytoplasm',
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
    s('candy-cytoplasm', 'Candy Cytoplasm', 'Pink blob membranes with bright cyan interiors.', [
      16740270,
      8255999,
      16765286,
      12124010
    ], 1050647),
    s('lagoon-gel', 'Lagoon Gel', 'Aquatic teal bodies with pale foam highlights.', [
      2155458,
      14155767,
      4891647,
      11924554
    ], 201746),
    s('mango-amoeba', 'Mango Amoeba', 'Warm orange skins with soft peach centers.', [
      16751918,
      16767144,
      16734781,
      16771164
    ], 1444611),
    s('plasma-bruise', 'Plasma Bruise', 'Deep violet blobs with magenta-blue contrast.', [
      13524223,
      6740479,
      16732079,
      11010043
    ], 722456),
    s('chlorophyll-gel', 'Chlorophyll Gel', 'Leafy green amoebas with sunlight yellow interiors.', [
      1483594,
      8843180,
      16707722,
      1013358
    ], 266506),
    s('blood-orange', 'Blood Orange', 'Red-orange membranes with citrus pulp highlights.', [
      12131356,
      16734751,
      16762967,
      16775085
    ], 1246211),
    s('ink-jelly', 'Ink Jelly', 'Dark ink blobs with blue glass and pale rim light.', [
      988970,
      1920728,
      9684477,
      16317180
    ], 132631),
    s('orchid-cells', 'Orchid Cells', 'Orchid purple, rose, and cream cellular blobs.', [
      8266446,
      12616956,
      16020150,
      16773618
    ], 853527),
    s('slime-lab', 'Slime Lab', 'Radioactive lab slime with sterile white speculars.', [
      8702998,
      14285213,
      2282478,
      16777215
    ], 397318),
    s('milk-tea', 'Milk Tea', 'Soft caramel, cream, and tapioca-brown blobs.', [
      9584654,
      14251782,
      16570790,
      16776171
    ], 1182212)
  ]
});
export function blobColor4(color: number, alpha = 1): readonly [
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
export function blobColor3(color: number): readonly [
  number,
  number,
  number
] {
  const c = blobColor4(color);
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
