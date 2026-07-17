import {
  validateParticleEffectDefinition2D,
  validateParticleSettingBindings2D,
  adaptParticleEffectDefinition2D,
  defineParticleEffect2D,
  particleGraph2D,
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
      events: [{ trigger: 'collision', retrigger: false, childArchetypeId: 'bounce', probability: 0.24, count: 4, maxGeneration: 1, priority: 'secondary' }],
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
      { tier: 'basic', points: true, streaks: true, blend: 'additive' },
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

const sparksGraphBase = adaptParticleEffectDefinition2D(SPARKS_PARTICLE_EFFECT);
const sparksEmitter = (
  id: string,
  archetypeId: string,
  importance: 'critical' | 'primary' | 'secondary',
  source: { readonly kind: 'point' } | { readonly kind: 'disc'; readonly radius: number } | { readonly kind: 'cone'; readonly spread: number } | { readonly kind: 'pinwheel'; readonly arms: number; readonly turns: number } | { readonly kind: 'shower'; readonly width: number },
) => ({
  id, archetypeId, timeline: { manual: true as const }, source,
  transform: { space: 'scene' as const }, limits: { importance, maxPerFrame: 500_000 },
});

/** Authoring graph used by the compiled particle runtime; legacy exports remain stable during visual-parity migration. */
export const SPARKS_PARTICLE_GRAPH = defineParticleEffect2D({
  ...sparksGraphBase,
  parameters: [
    { id: 'gravity', kind: 'number', defaultValue: 760, min: 0, max: 4000 },
    { id: 'air-drag', kind: 'number', defaultValue: 0.08, min: 0, max: 4 },
    { id: 'turbulence', kind: 'number', defaultValue: 0.22, min: 0, max: 4 },
    { id: 'restitution', kind: 'number', defaultValue: 0.58, min: 0, max: 1 },
    { id: 'friction', kind: 'number', defaultValue: 0.18, min: 0, max: 1 },
    { id: 'collision-life-loss', kind: 'number', defaultValue: 0.12, min: 0, max: 1 },
    { id: 'core-size', kind: 'number', defaultValue: 1, min: 0.02, max: 10 },
    { id: 'core-size-variability', kind: 'number', defaultValue: 0.56, min: 0, max: 2 },
    { id: 'core-intensity', kind: 'number', defaultValue: 3.65, min: 0, max: 8 },
    { id: 'primary-size', kind: 'number', defaultValue: 1, min: 0, max: 3 },
    { id: 'primary-size-variability', kind: 'number', defaultValue: 0.56, min: 0, max: 2 },
    { id: 'primary-length', kind: 'number', defaultValue: 1, min: 0, max: 12 },
    { id: 'primary-length-variability', kind: 'number', defaultValue: 0.38, min: 0, max: 2 },
    { id: 'bounce-size', kind: 'number', defaultValue: 0.42, min: 0.02, max: 3 },
    { id: 'bounce-size-variability', kind: 'number', defaultValue: 0.72, min: 0, max: 2 },
    { id: 'bounce-length', kind: 'number', defaultValue: 0.72, min: 0, max: 12 },
    { id: 'bounce-length-variability', kind: 'number', defaultValue: 0.52, min: 0, max: 2 },
  ],
  emitters: [
    sparksEmitter('core-contact', 'core', 'critical', { kind: 'disc', radius: 1 }),
    sparksEmitter('welding', 'primary', 'primary', { kind: 'cone', spread: Math.PI * 0.9 }),
    sparksEmitter('pinwheel', 'primary', 'primary', { kind: 'pinwheel', arms: 4, turns: 1 }),
    sparksEmitter('shower', 'primary', 'primary', { kind: 'shower', width: 1 }),
    sparksEmitter('collision-bounce', 'bounce', 'secondary', { kind: 'point' }),
  ],
  graph: {
    root: particleGraph2D.parallel(
      particleGraph2D.gate({ kind: 'signal', signal: 'weld' }, particleGraph2D.parallel(particleGraph2D.emit('core-contact'), particleGraph2D.emit('welding'))),
      particleGraph2D.gate({ kind: 'signal', signal: 'pinwheel' }, particleGraph2D.emit('pinwheel')),
      particleGraph2D.gate({ kind: 'signal', signal: 'shower' }, particleGraph2D.emit('shower')),
      particleGraph2D.gate({ kind: 'particle-collision', archetypeId: 'primary' }, particleGraph2D.emit('collision-bounce')),
    ),
  },
  persistedBindings: [
    { parameterId: 'gravity', key: 'gravity' }, { parameterId: 'air-drag', key: 'airDrag' }, { parameterId: 'turbulence', key: 'sparkTurbulence' },
    { parameterId: 'restitution', key: 'bounceRestitution' }, { parameterId: 'friction', key: 'surfaceFriction' },
    { parameterId: 'collision-life-loss', key: 'bounceLifeDecay' },
    { parameterId: 'core-size', key: 'coreSparkSize' }, { parameterId: 'core-size-variability', key: 'coreSparkSizeVariability' }, { parameterId: 'core-intensity', key: 'coreSparkIntensity' },
    { parameterId: 'primary-size', key: 'primarySparkSize' }, { parameterId: 'primary-size-variability', key: 'primarySparkSizeVariability' },
    { parameterId: 'primary-length', key: 'primarySparkLength' }, { parameterId: 'primary-length-variability', key: 'primarySparkLengthVariability' },
    { parameterId: 'bounce-size', key: 'bounceSparkSize' }, { parameterId: 'bounce-size-variability', key: 'bounceSparkSizeVariability' },
    { parameterId: 'bounce-length', key: 'bounceSparkLength' }, { parameterId: 'bounce-length-variability', key: 'bounceSparkLengthVariability' },
  ],
  moduleBindings: [
    ...['core','primary','bounce'].flatMap((id) => [
      { target: `archetype.${id}.motion.gravity`, parameterId: 'gravity' }, { target: `archetype.${id}.motion.drag`, parameterId: 'air-drag' },
    ]),
    { target: 'archetype.primary.motion.turbulence', parameterId: 'turbulence' }, { target: 'archetype.bounce.motion.turbulence', parameterId: 'turbulence' },
    { target: 'archetype.primary.collision.restitution', parameterId: 'restitution' }, { target: 'archetype.bounce.collision.restitution', parameterId: 'restitution' },
    { target: 'archetype.primary.collision.friction', parameterId: 'friction' }, { target: 'archetype.bounce.collision.friction', parameterId: 'friction' },
    { target: 'archetype.primary.collision.lifetimeLoss', parameterId: 'collision-life-loss' }, { target: 'archetype.bounce.collision.lifetimeLoss', parameterId: 'collision-life-loss' },
    { target: 'archetype.core.appearance.size.start', parameterId: 'core-size' }, { target: 'archetype.core.appearance.size.variability', parameterId: 'core-size-variability' },
    { target: 'archetype.core.appearance.intensity.start', parameterId: 'core-intensity' },
    { target: 'archetype.primary.appearance.size.start', parameterId: 'primary-size' }, { target: 'archetype.primary.appearance.length.start', parameterId: 'primary-length' },
    { target: 'archetype.primary.appearance.size.variability', parameterId: 'primary-size-variability' }, { target: 'archetype.primary.appearance.length.variability', parameterId: 'primary-length-variability' },
    { target: 'archetype.bounce.appearance.size.start', parameterId: 'bounce-size' }, { target: 'archetype.bounce.appearance.size.variability', parameterId: 'bounce-size-variability' },
    { target: 'archetype.bounce.appearance.length.start', parameterId: 'bounce-length' }, { target: 'archetype.bounce.appearance.length.variability', parameterId: 'bounce-length-variability' },
  ],
});
