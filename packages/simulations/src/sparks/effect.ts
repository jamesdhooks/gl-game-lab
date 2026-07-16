import {
  validateParticleEffectDefinition2D,
  validateParticleSettingBindings2D,
  type ParticleEffectDefinition2D,
  type ParticleSettingBinding2D,
} from '@hooksjam/gl-game-lab-engine';

export const SPARKS_PARTICLE_EFFECT: ParticleEffectDefinition2D = validateParticleEffectDefinition2D({
  id: 'sparks',
  capacity: {
    min: 128 * 128,
    default: 256 * 256,
    max: 768 * 768,
    previewMax: 256 * 256,
    commandCapacity: 64,
  },
  archetypes: [
    {
      id: 'core',
      spawn: { shape: 'point', spread: Math.PI * 2 },
      motion: { gravity: 760, drag: 0.08, inheritedVelocity: 0.018 },
      lifecycle: { lifetime: 0.26, lifetimeVariability: 0.18, killMargin: 160 },
      appearance: {
        size: { start: 1, end: 0.25, exponent: 1.4 },
        alpha: { start: 1, end: 0, exponent: 2.4 },
        intensity: { start: 1, end: 0.2 },
        paletteMode: 'seeded',
      },
    },
    {
      id: 'primary',
      spawn: { shape: 'cone', spread: Math.PI * 0.9 },
      motion: { gravity: 760, drag: 0.08, turbulence: 0.22, inheritedVelocity: 0.18 },
      lifecycle: { lifetime: 1.15, lifetimeVariability: 0.32, killMargin: 160 },
      appearance: {
        size: { start: 1, end: 0.3 },
        length: { start: 1, end: 0.18 },
        alpha: { start: 1, end: 0, exponent: 1.22 },
        intensity: { start: 1, end: 0.18 },
        paletteMode: 'seeded',
      },
      collision: { bounds: true, capsules: true, restitution: 0.58, friction: 0.18, lifetimeLoss: 0.12 },
      events: [{ trigger: 'collision', childArchetypeId: 'bounce', probability: 0.24, count: 4, maxGeneration: 1, priority: 'secondary' }],
    },
    {
      id: 'bounce',
      spawn: { shape: 'cone', spread: Math.PI * 0.7 },
      motion: { gravity: 760, drag: 0.08, turbulence: 0.3, inheritedVelocity: 0.4 },
      lifecycle: { lifetime: 0.72, lifetimeVariability: 0.35, killMargin: 160 },
      appearance: {
        size: { start: 0.75, end: 0.18 },
        length: { start: 0.75, end: 0.1 },
        alpha: { start: 1, end: 0, exponent: 1.18 },
        intensity: { start: 0.9, end: 0.12 },
        paletteMode: 'generation',
      },
      collision: { bounds: true, capsules: true, restitution: 0.5, friction: 0.22, lifetimeLoss: 0.2 },
    },
  ],
  modules: { motion: true, lifecycle: true, collisions: true, events: true, turbulence: true },
  renderRecipes: {
    defaultTier: 'enhanced',
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
  { parameter: 'motion.turbulence', persistedKey: 'sparkTurbulence', label: 'Turbulence', section: 'Physics' },
  { parameter: 'collision.restitution', persistedKey: 'bounceRestitution', label: 'Restitution', section: 'Physics' },
  { parameter: 'collision.friction', persistedKey: 'surfaceFriction', label: 'Surface Friction', section: 'Physics' },
  { parameter: 'render.trailPersistence', persistedKey: 'trailFade', label: 'Trail Fade', section: 'Rendering', tiers: ['ultra'] },
  { parameter: 'appearance.size', persistedKey: 'coreSparkSize', label: 'Core Size', section: 'Core Sparks', archetypeId: 'core' },
  { parameter: 'appearance.size', persistedKey: 'primarySparkSize', label: 'Primary Size', section: 'Primary Sparks', archetypeId: 'primary' },
  { parameter: 'appearance.length', persistedKey: 'primarySparkLength', label: 'Primary Length', section: 'Primary Sparks', archetypeId: 'primary' },
  { parameter: 'appearance.size', persistedKey: 'bounceSparkSize', label: 'Bounce Size', section: 'Bounce Sparks', archetypeId: 'bounce' },
  { parameter: 'appearance.length', persistedKey: 'bounceSparkLength', label: 'Bounce Length', section: 'Bounce Sparks', archetypeId: 'bounce' },
];

export const SPARKS_PARTICLE_SETTING_BINDINGS = validateParticleSettingBindings2D(SPARKS_PARTICLE_EFFECT, bindings);
