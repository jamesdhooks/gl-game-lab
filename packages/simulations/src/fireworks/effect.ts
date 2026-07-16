import {
  validateParticleEffectDefinition2D,
  validateParticleSettingBindings2D,
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  defineParticleEffect2D,
  particleGraph2D,
  type ParticleEffectDefinition2D,
  type ParticleSettingBinding2D,
} from '@hooksjam/gl-game-lab-engine';

export const FIREWORKS_PARTICLE_EFFECT: ParticleEffectDefinition2D = validateParticleEffectDefinition2D({
  id: 'fireworks',
  capacity: { min: 128 * 128, default: 384 * 384, max: 1024 * 1024, previewMax: 256 * 256, commandCapacity: 64 },
  archetypes: [
    {
      id: 'shell', spawn: { shape: 'point', spread: 0 },
      motion: { gravity: 360, drag: 0.34 }, lifecycle: { lifetime: 1.28, lifetimeVariability: 0.12, killMargin: 100 },
      appearance: { size: { start: 2.4, end: 1 }, length: { start: 1.2, end: 0.3 }, alpha: { start: 1, end: 0.7 }, intensity: { start: 1.8, end: 1 }, paletteMode: 'seeded' },
      events: [{ trigger: 'death', childArchetypeId: 'primary', probability: 1, count: 512, maxGeneration: 0, priority: 'primary' }],
    },
    {
      id: 'primary', spawn: { shape: 'radial', spread: Math.PI * 2 },
      motion: { gravity: 360, drag: 0.34, inheritedVelocity: 0.18 }, lifecycle: { lifetime: 2.4, lifetimeVariability: 0.28, killMargin: 140 },
      appearance: { size: { start: 1.45, end: 0.2 }, length: { start: 1.2, end: 0.1 }, alpha: { start: 1, end: 0, exponent: 1.4 }, intensity: { start: 1.4, end: 0.15 }, paletteMode: 'gradient' },
      events: [
        { trigger: 'age', childArchetypeId: 'secondary', probability: 0.42, count: 5, maxGeneration: 2, delay: 0.48, velocityInheritance: 0.32, powerScale: 0.56, priority: 'secondary' },
        { trigger: 'death', childArchetypeId: 'sparkle', probability: 0.52, count: 7, maxGeneration: 3, powerScale: 0.26, priority: 'cosmetic' },
      ],
    },
    {
      id: 'secondary', spawn: { shape: 'radial', spread: Math.PI * 1.44 },
      motion: { gravity: 360, drag: 0.42, inheritedVelocity: 0.32 }, lifecycle: { lifetime: 1.3, lifetimeVariability: 0.32, killMargin: 140 },
      appearance: { size: { start: 0.8, end: 0.12 }, length: { start: 0.7, end: 0.05 }, alpha: { start: 1, end: 0, exponent: 1.3 }, intensity: { start: 1.2, end: 0.12 }, paletteMode: 'generation' },
      events: [
        { trigger: 'age', childArchetypeId: 'secondary', probability: 0.32, count: 4, maxGeneration: 2, delay: 0.42, velocityInheritance: 0.32, powerScale: 0.56, priority: 'secondary' },
        { trigger: 'death', childArchetypeId: 'sparkle', probability: 0.52, count: 7, maxGeneration: 3, powerScale: 0.26, priority: 'cosmetic' },
      ],
    },
    {
      id: 'sparkle', spawn: { shape: 'radial', spread: Math.PI * 2 },
      motion: { gravity: 300, drag: 0.72, inheritedVelocity: 0.18 }, lifecycle: { lifetime: 0.58, lifetimeVariability: 0.38, killMargin: 140 },
      appearance: { size: { start: 0.82, end: 0 }, alpha: { start: 1, end: 0, exponent: 1.8 }, intensity: { start: 2.2, end: 0 }, flicker: 0.78, afterglow: 0.24, paletteMode: 'terminal' },
    },
  ],
  modules: { motion: true, lifecycle: true, events: true, turbulence: false, rotation: true },
  renderRecipes: {
    defaultTier: 'ultra',
    recipes: [
      { tier: 'basic', points: true, blend: 'additive' },
      { tier: 'enhanced', points: true, streaks: true, blend: 'additive' },
      { tier: 'ultra', points: true, streaks: true, trails: true, bloom: true, blend: 'additive' },
    ],
  },
});

const bindings: readonly ParticleSettingBinding2D[] = [
  { parameter: 'motion.gravity', persistedKey: 'gravity', label: 'Gravity', section: 'Physics' },
  { parameter: 'motion.drag', persistedKey: 'airDrag', label: 'Air Drag', section: 'Physics' },
  { parameter: 'spawn.power', persistedKey: 'launchPower', label: 'Launch Power', section: 'Launch', archetypeId: 'shell' },
  { parameter: 'spawn.pattern', persistedKey: 'burstPattern', label: 'Burst Pattern', section: 'Primary Burst', archetypeId: 'primary' },
  { parameter: 'events.secondary.count', persistedKey: 'secondaryCount', label: 'Children Per Event', section: 'Secondary Burst', archetypeId: 'secondary' },
  { parameter: 'events.sparkle.count', persistedKey: 'terminalSparkleCount', label: 'Sparkle Count', section: 'Terminal Sparkle', archetypeId: 'sparkle' },
  { parameter: 'appearance.size', persistedKey: 'particleSize', label: 'Spark Size', section: 'Rendering', archetypeId: 'primary' },
  { parameter: 'appearance.length', persistedKey: 'particleLength', label: 'Spark Length', section: 'Rendering', archetypeId: 'primary', tiers: ['enhanced', 'ultra'] },
  { parameter: 'render.trailPersistence', persistedKey: 'trailFade', label: 'Trail Persistence', section: 'Rendering', tiers: ['ultra'] },
];

export const FIREWORKS_PARTICLE_SETTING_BINDINGS = validateParticleSettingBindings2D(FIREWORKS_PARTICLE_EFFECT, bindings);

const fireworksGraphBase = adaptParticleEffectDefinition2D(FIREWORKS_PARTICLE_EFFECT);
const fireworksEmitter = (id: string, archetypeId: string, importance: 'critical' | 'primary' | 'secondary' | 'cosmetic') => ({
  id, archetypeId, timeline: { manual: true as const }, source: { kind: archetypeId === 'shell' ? 'point' as const : 'radial' as const },
  transform: { space: 'scene' as const },
  inheritance: { velocity: archetypeId === 'shell' ? 0 : 0.32, palette: true, seed: true, timescale: true },
  limits: { importance, maxPerFrame: archetypeId === 'primary' ? 16_384 : 4_096, maxGeneration: archetypeId === 'sparkle' ? 3 : 2 },
});

export const FIREWORKS_PARTICLE_GRAPH = defineParticleEffect2D({
  ...fireworksGraphBase,
  emitters: [
    fireworksEmitter('shell-launch', 'shell', 'critical'),
    fireworksEmitter('primary-burst', 'primary', 'primary'),
    fireworksEmitter('secondary-burst', 'secondary', 'secondary'),
    fireworksEmitter('terminal-sparkle', 'sparkle', 'cosmetic'),
  ],
  graph: {
    root: particleGraph2D.sequence(
      particleGraph2D.gate({ kind: 'signal', signal: 'launch' }, particleGraph2D.emit('shell-launch')),
      particleGraph2D.gate({ kind: 'particle-death', archetypeId: 'shell' }, particleGraph2D.emit('primary-burst')),
      particleGraph2D.gate({ kind: 'particle-age', archetypeId: 'primary', age: 0.48 }, particleGraph2D.emit('secondary-burst')),
      particleGraph2D.gate({ kind: 'particle-death', archetypeId: 'primary' }, particleGraph2D.emit('terminal-sparkle')),
    ),
  },
});

export const FIREWORKS_PARTICLE_PROGRAM = compileParticleProgram2D(compileParticleEffect2D(FIREWORKS_PARTICLE_GRAPH));

export function fireworksPatternCode(pattern: string): number {
  const index = ['peony', 'ring', 'chrysanthemum', 'willow', 'palm', 'spiral', 'crossette', 'comet'].indexOf(pattern);
  if (index < 0) throw new Error(`Unknown Fireworks burst pattern: ${pattern}`);
  return index;
}

export function fireworksColorModeCode(mode: string): number {
  const index = ['shell', 'radial-gradient', 'over-life', 'secondary-accent'].indexOf(mode);
  if (index < 0) throw new Error(`Unknown Fireworks color mode: ${mode}`);
  return index;
}
