import { describe, expect, it } from 'vitest';
import {
  PARTICLE_EFFECT_COMMAND_CAPACITY,
  PARTICLE_EFFECT_STATE_LAYOUT,
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
});
