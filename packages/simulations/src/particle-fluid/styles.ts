import type { ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';
export const PARTICLE_FLUID_STYLE_MANIFEST: ExperienceStyleManifest = Object.freeze({
  defaultStyleId: 'haxiomic-cyan',
  renderLayers: [
    'particles',
    'glow'
  ],
  passes: [
    'primitive',
    'bloom'
  ],
  qualities: [
    'raw'
  ],
  styles: [
    s('haxiomic-cyan', 'Haxiomic Cyan', 'Reference-inspired blue and cyan current.', [
      2228254,
      97023,
      10611967,
      16777215
    ], 0),
    s('magenta-current', 'Magenta Current', 'Hot magenta ink with cyan highlights.', [
      2293785,
      16723926,
      8255999,
      16777215
    ], 327687),
    s('phosphor-stream', 'Phosphor Stream', 'Green phosphor flow with yellow-white cores.', [
      135943,
      7208792,
      15531930,
      16777215
    ], 1796),
    s('ember-wake', 'Ember Wake', 'Orange fire wakes and ivory sparks.', [
      2033154,
      16739098,
      16773304,
      16777215
    ], 459265),
    s('ultraviolet-rift', 'Ultraviolet Rift', 'Violet currents and pink-white turbulence.', [
      1049385,
      9133302,
      15772668,
      16777215
    ], 196618),
    s('arctic-spark', 'Arctic Spark', 'Icy particles with crisp white velocity flashes.', [
      267809,
      9300479,
      16777215,
      8246268
    ], 1803),
    s('laser-red', 'Laser Red', 'Red coherent streams with pale collision cores.', [
      2162694,
      16716360,
      16766687,
      16777215
    ], 393219),
    s('blueprint-ink', 'Blueprint Ink', 'Technical blue ink on a deep drafting field.', [
      463135,
      5153279,
      14478591,
      16777215
    ], 133143),
    s('solar-flare', 'Solar Flare', 'Gold plasma with hot ivory and orange wakes.', [
      1837056,
      16436245,
      16776171,
      16739098
    ], 328192),
    s('deep-sea-ion', 'Deep Sea Ion', 'Dark ocean teal with ionized aqua streaks.', [
      4886,
      1372633,
      14286840,
      6809849
    ], 2059)
  ]
});
export function particleFluidColor3(color: number): readonly [
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
      'primitive'
    ])
  });
}
