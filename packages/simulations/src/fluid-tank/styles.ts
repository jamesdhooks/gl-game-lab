import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const FLUID_TANK_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'bounded-cyan',
  renderLayers: [
    'fluid'
  ],
  passes: [
    'gpuFluid',
    'paletteMap',
    'normalLighting',
    'bloom',
    'sunrays',
    'composite'
  ],
  qualities: [
    'raw'
  ],
  styles: [
    s('bounded-cyan', 'Bounded Cyan', 'Bright teal dye and glassy tank edges.', [
      7733222,
      10354676,
      12381439
    ], 131590),
    s('webgl-fluid-glow', 'WebGL Fluid Glow', 'High-energy dye with surface shading, bloom, and sunray-style light shafts.', [
      3733759,
      6842367,
      16732120,
      16773286
    ], 131850),
    s('nebula-oil', 'Nebula Oil', 'Cosmic ink ribbons and oily glow.', [
      6049279,
      16732120,
      16758891
    ], 328202),
    s('thermal-bloom', 'Thermal Bloom', 'Hot bloom with dense pressure contrast.', [
      3346943,
      16724821,
      16773258
    ], 459265),
    s('aurora-borealis', 'Aurora Borealis', 'Arctic greens, teals, and violet ribbons.', [
      65443,
      53247,
      10309119
    ], 67600),
    s('deep-ocean', 'Deep Ocean', 'Abyssal navy and bioluminescent cyan.', [
      13224,
      59608,
      16765286
    ], 2068),
    s('lava-lamp', 'Lava Lamp', 'Molten orange and cherry dye.', [
      16718336,
      16743424,
      16772608
    ], 852736),
    s('forest-moss', 'Forest Moss', 'Earthy moss green and warm ochre.', [
      2980352,
      9420544,
      13150283
    ], 132609),
    s('ink-wash', 'Ink Wash', 'Black India ink through warm paper dye.', [
      197379,
      2042167,
      7041664,
      16317180
    ], 328965),
    s('candy-diffusion', 'Candy Diffusion', 'Pink, lemon, and aqua dye streams.', [
      16478597,
      16361684,
      16707722,
      6809849
    ], 1181718),
    s('copper-patina', 'Copper Patina', 'Molten copper oxidizing into turquoise edges.', [
      7877903,
      15357964,
      16436245,
      1357990
    ], 1050372),
    s('__random__', 'Random', 'A randomized fluid palette.', [
      6750193,
      687615,
      16735716,
      16773792
    ], 131590)
  ]
});
export function fluidColor3(color: number): readonly [
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
      'gpuFluid'
    ])
  });
}
