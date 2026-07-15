import type { ExperienceStyle, ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const SPLASH_MPM_STYLE_MANIFEST: ExperienceStyleManifest = {
  defaultStyleId: 'clear-splash',
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
    s('clear-splash', 'Clear Splash', [
      201759,
      36824,
      13498367,
      16777215
    ], 133138),
    s('moon-pool', 'Moon Pool', [
      463135,
      5995770,
      14412542,
      6809849
    ], 66324),
    s('green-glass', 'Green Glass', [
      201226,
      1357930,
      14285213,
      15793658
    ], 133126),
    s('rose-fountain', 'Rose Fountain', [
      1574155,
      16478597,
      16770278,
      16777215
    ], 524806),
    s('ink-depth', 'Ink Depth', [
      16317180,
      3359061,
      14412542,
      959977
    ], 16317180),
    s('storm-surge', 'Storm Surge', [
      132631,
      4674921,
      14870768,
      3718648
    ], 66313),
    s('amber-fizz', 'Amber Fizz', [
      1838853,
      16096779,
      16772565,
      16777215
    ], 459521),
    s('violet-current', 'Violet Current', [
      1247010,
      9133302,
      15772668,
      16777215
    ], 328204),
    s('arctic-glow', 'Arctic Glow', [
      15531775,
      440020,
      11006928,
      16777215
    ], 15662335),
    s('toxic-lagoon', 'Toxic Lagoon', [
      398087,
      8702998,
      2282478,
      16707722
    ], 132866)
  ]
};
function s(id: string, name: string, palette: readonly number[], background: number): ExperienceStyle {
  return {
    id,
    name,
    description: `${name} particle-grid water treatment.`,
    palette,
    background,
    passes: [
      'densityMetaball'
    ]
  };
}
export function splashRgb(n: number): readonly [
  number,
  number,
  number
] {
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255
  ];
}
export function splashRgba(n: number): readonly [
  number,
  number,
  number,
  number
] {
  return [
    ...splashRgb(n),
    1
  ];
}

const SPLASH_POINT_SCALES: Readonly<Record<string, number>> = Object.freeze({
  'clear-splash': 1,
  'moon-pool': 1.08,
  'green-glass': 0.94,
  'rose-fountain': 1.04,
  'ink-depth': 0.9,
  'storm-surge': 1.12,
  'amber-fizz': 1.02,
  'violet-current': 1.06,
  'arctic-glow': 0.96,
  'toxic-lagoon': 1.1,
});

export function splashPointScale(styleId: string): number {
  return SPLASH_POINT_SCALES[styleId] ?? 1;
}
