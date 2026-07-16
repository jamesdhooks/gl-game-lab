import { describe, expect, it } from 'vitest';
import {
  PARTICLE_EFFECT_COMMAND_CAPACITY,
  PARTICLE_EFFECT_STATE_LAYOUT,
  ParticleCommandQueue2D,
  resolveParticleRenderRecipe2D,
  validateParticleSettingBindings2D,
  validateParticleEffectDefinition2D,
  type ParticleEffectDefinition2D,
} from '../index.js';

const definition: ParticleEffectDefinition2D = {
  id: 'test-effect',
  capacity: { min: 128, default: 256, max: 1024, previewMax: 256 },
  modules: { motion: true, lifecycle: true, events: true },
  archetypes: [
    {
      id: 'primary',
      spawn: { shape: 'radial', spread: Math.PI * 2 },
      motion: { gravity: 360, drag: 0.3 },
      lifecycle: { lifetime: 2 },
      appearance: {
        size: { start: 2, end: 0.5 },
        alpha: { start: 1, end: 0 },
        intensity: { start: 1, end: 0.2 },
      },
      events: [{ trigger: 'death', childArchetypeId: 'sparkle', probability: 0.5, count: 8, maxGeneration: 1 }],
    },
    {
      id: 'sparkle',
      spawn: { shape: 'radial', spread: Math.PI * 2 },
      motion: { gravity: 240, drag: 0.8 },
      lifecycle: { lifetime: 0.6 },
      appearance: {
        size: { start: 1, end: 0 },
        alpha: { start: 1, end: 0 },
        intensity: { start: 2, end: 0 },
      },
    },
  ],
  renderRecipes: {
    defaultTier: 'enhanced',
    recipes: [
      { tier: 'basic', points: true, blend: 'additive' },
      { tier: 'enhanced', points: true, streaks: true, blend: 'additive' },
    ],
  },
};

describe('ParticleEffects2D', () => {
  it('defines a versioned common state layout and command ceiling', () => {
    expect(PARTICLE_EFFECT_STATE_LAYOUT.position).toEqual(['positionX', 'positionY', 'age', 'lifetime']);
    expect(PARTICLE_EFFECT_STATE_LAYOUT.metadata).toEqual(['archetypeId', 'generation', 'colorSeed', 'flags']);
    expect(PARTICLE_EFFECT_COMMAND_CAPACITY).toBe(64);
  });

  it('accepts referenced child archetypes and unique render tiers', () => {
    expect(validateParticleEffectDefinition2D(definition)).toBe(definition);
  });

  it('rejects invalid capacity, duplicate archetypes, and unknown event children', () => {
    expect(() => validateParticleEffectDefinition2D({ ...definition, capacity: { ...definition.capacity, default: 2048 } })).toThrow('capacity policy');
    expect(() => validateParticleEffectDefinition2D({ ...definition, archetypes: [definition.archetypes[0]!, definition.archetypes[0]!] })).toThrow('duplicate archetype');
    expect(() => validateParticleEffectDefinition2D({
      ...definition,
      archetypes: [{ ...definition.archetypes[0]!, events: [{ trigger: 'death', childArchetypeId: 'missing', probability: 1, count: 1, maxGeneration: 1 }] }],
    })).toThrow('unknown child archetype');
  });

  it('packs commands into a stable allocation-free 16-float batch', () => {
    const queue = new ParticleCommandQueue2D(definition);
    queue.setCapacity(128);
    expect(queue.enqueue({
      archetypeId: 'primary', count: 24, position: [10, 20], inheritedVelocity: [2, 3],
      direction: 1, spread: 2, power: 300, seed: 7, paletteSeed: 9,
      shape: 'spiral', lifetimeScale: 3.5, lifetimeVariability: 0.4,
    })).toBe(true);
    const first = queue.drain();
    expect(first.count).toBe(1);
    expect(first.particleCount).toBe(24);
    expect(first.data.slice(0, 15)).toEqual(new Float32Array([0, 0, 24, 7, 10, 20, 2, 3, 1, 2, 300, 3.5, 7, 9, 0.4]));
    queue.enqueue({ archetypeId: 'sparkle', count: 4, position: [0, 0], inheritedVelocity: [0, 0], direction: 0, spread: 1, power: 4, seed: 1, paletteSeed: 2 });
    expect(queue.drain()).toBe(first);
    expect(() => queue.setCapacity(64)).toThrow('outside the effect policy');
  });

  it('resolves render recipes and validates contextual setting bindings', () => {
    expect(resolveParticleRenderRecipe2D(definition, 'basic').points).toBe(true);
    expect(() => resolveParticleRenderRecipe2D(definition, 'ultra')).toThrow('does not define render tier');
    expect(validateParticleSettingBindings2D(definition, [
      { parameter: 'motion.gravity', persistedKey: 'gravity', label: 'Gravity', section: 'Physics' },
      { parameter: 'appearance.size', persistedKey: 'sparkleSize', label: 'Sparkle Size', section: 'Sparkle', archetypeId: 'sparkle' },
    ])).toHaveLength(2);
    expect(() => validateParticleSettingBindings2D(definition, [
      { parameter: 'appearance.size', persistedKey: 'size', label: 'Size', section: 'Rendering', archetypeId: 'missing' },
    ])).toThrow('unknown archetype');
  });
});
