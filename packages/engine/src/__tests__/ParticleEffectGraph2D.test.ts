import { describe, expect, it } from 'vitest';
import {
  PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION,
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  defineParticleEffect2D,
  particleGraph2D,
  particleOnce2D,
  type ParticleArchetype2D,
  type ParticleEffectDefinition2D,
} from '../index.js';

const archetype: ParticleArchetype2D = {
  id: 'spark',
  spawn: { shape: 'point', spread: 0 },
  motion: { gravity: 10, drag: 0.1 },
  lifecycle: { lifetime: 1 },
  appearance: {
    size: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    intensity: { start: 1, end: 0 },
  },
};

const legacy: ParticleEffectDefinition2D = {
  id: 'test-effect',
  capacity: { min: 16, default: 32, max: 64, previewMax: 16 },
  archetypes: [archetype],
  modules: { motion: true, lifecycle: true },
  renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
};

describe('ParticleEffectGraph2D', () => {
  it('adapts legacy effects into a validated manual-emitter graph', () => {
    const graph = adaptParticleEffectDefinition2D(legacy);
    expect(graph.schemaVersion).toBe(PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION);
    expect(graph.emitters[0]).toMatchObject({ id: 'spark', archetypeId: 'spark', timeline: { manual: true } });
    expect(compileParticleEffect2D(graph).legacyDefinition.id).toBe('test-effect');
  });

  it('compiles deterministic emitter and archetype ids', () => {
    const graph = defineParticleEffect2D({
      schemaVersion: PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION,
      id: 'composed-effect',
      parameters: [{ id: 'power', kind: 'number', defaultValue: 2, min: 0, max: 10 }],
      archetypes: [archetype],
      emitters: [{
        id: 'burst', archetypeId: 'spark', timeline: particleOnce2D(12), source: { kind: 'ring', radius: 4 },
        initialization: { power: { kind: 'parameter', parameterId: 'power' } },
        transform: { space: 'effect' }, limits: { importance: 'primary', maxPerFrame: 32 },
      }],
      graph: { root: particleGraph2D.sequence(particleGraph2D.delay(0.1, particleGraph2D.emit('burst'))) },
      renderRecipes: legacy.renderRecipes,
      capacity: legacy.capacity,
      quality: { defaultTier: 'basic' },
    });
    const first = compileParticleEffect2D(graph);
    const second = compileParticleEffect2D(graph);
    expect(first.emitterIds).toEqual({ burst: 0 });
    expect(first.graphHash).toMatch(/^[0-9a-f]{8}$/);
    expect(first.abiHash).toMatch(/^[0-9a-f]{8}$/);
    expect(first.graphHash).toBe(second.graphHash);
    expect(first.instructions).toEqual(second.instructions);
    expect(first.report).toMatchObject({ emitterCount: 1, archetypeCount: 1, requiredStateTargets: 2 });
  });

  it('rejects unbounded and invalid compositions', () => {
    const base = adaptParticleEffectDefinition2D(legacy);
    expect(() => defineParticleEffect2D({ ...base, emitters: [{ ...base.emitters[0]!, timeline: { loop: true } }] })).toThrow('unbounded loop');
    expect(() => defineParticleEffect2D({ ...base, graph: { root: { kind: 'repeat', count: 0, child: particleGraph2D.emit('spark') } } })).toThrow('repeat must be bounded');
    expect(() => defineParticleEffect2D({ ...base, graph: { root: particleGraph2D.emit('missing') } })).toThrow('unknown emitter');
  });

  it('rejects recursive graph depth and unknown parameter bindings', () => {
    const base = adaptParticleEffectDefinition2D(legacy);
    expect(() => defineParticleEffect2D({
      ...base,
      emitters: [{ ...base.emitters[0]!, initialization: { power: { kind: 'parameter', parameterId: 'missing' } } }],
    })).toThrow('unknown parameter');
  });
});
