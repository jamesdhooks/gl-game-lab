import { describe, expect, it } from 'vitest';
import {
  ParticleEffectLibrary2D,
  adaptParticleEffectDefinition2D,
  parseParticleEffect2D,
  particleGraph2D,
  resolveParticleParameters2D,
  resolveParticlePersistedSettings2D,
  serializeParticleEffect2D,
  type ParticleEffectDefinition2D,
} from '../index.js';

const legacy: ParticleEffectDefinition2D = {
  id: 'child', capacity: { min: 1, default: 4, max: 16, previewMax: 4 },
  archetypes: [{ id: 'particle', spawn: { shape: 'point', spread: 0 }, motion: { gravity: 0, drag: 0 }, lifecycle: { lifetime: 1 }, appearance: { size: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } } }],
  modules: { motion: true, lifecycle: true }, renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
};

describe('ParticleEffectAuthoring2D', () => {
  it('round trips graph assets with stable serialization', () => {
    const graph = adaptParticleEffectDefinition2D(legacy);
    const first = serializeParticleEffect2D(graph);
    expect(serializeParticleEffect2D(parseParticleEffect2D(first))).toBe(first);
  });

  it('orders referenced effects before their parents', () => {
    const child = adaptParticleEffectDefinition2D(legacy);
    const parent = { ...adaptParticleEffectDefinition2D({ ...legacy, id: 'parent' }), graph: { root: particleGraph2D.effect('child') } };
    const library = new ParticleEffectLibrary2D();
    library.register(child);
    library.register(parent);
    expect(library.diagnostics()).toMatchObject({ effectCount: 2, referenceCount: 1, compilationOrder: ['child', 'parent'] });
  });

  it('rejects missing and recursive effect references', () => {
    const library = new ParticleEffectLibrary2D();
    const parent = { ...adaptParticleEffectDefinition2D({ ...legacy, id: 'parent' }), graph: { root: particleGraph2D.effect('missing') } };
    expect(() => library.register(parent)).toThrow('Unknown referenced');

    const first = { ...adaptParticleEffectDefinition2D({ ...legacy, id: 'first' }), graph: { root: particleGraph2D.effect('second') } };
    const second = { ...adaptParticleEffectDefinition2D({ ...legacy, id: 'second' }), graph: { root: particleGraph2D.effect('first') } };
    const cyclic = new ParticleEffectLibrary2D();
    expect(() => cyclic.register(first)).toThrow('Unknown referenced');
    const seeded = new ParticleEffectLibrary2D();
    seeded.register(adaptParticleEffectDefinition2D({ ...legacy, id: 'second' }));
    seeded.register(first);
    expect(() => seeded.replace(second)).toThrow('Recursive particle effect');
  });

  it('resolves, clamps, and validates parameter overrides', () => {
    const graph = { ...adaptParticleEffectDefinition2D(legacy), parameters: [{ id: 'power', kind: 'number' as const, defaultValue: 2, min: 0, max: 4 }] };
    expect(resolveParticleParameters2D(graph, { power: 20 })).toEqual({ power: 4 });
    expect(() => resolveParticleParameters2D(graph, { missing: 1 })).toThrow('Unknown particle parameter');
  });

  it('migrates persisted aliases and reports unknown values visibly', () => {
    const graph = {
      ...adaptParticleEffectDefinition2D(legacy),
      parameters: [{ id: 'rate', kind: 'number' as const, defaultValue: 10, min: 0, max: 100 }],
      persistedBindings: [{ parameterId: 'rate', key: 'emissionRate', aliases: ['legacyRate'] }],
    };
    const resolution = resolveParticlePersistedSettings2D(graph, { legacyRate: 42, obsolete: 3 });
    expect(resolution.parameters.rate).toBe(42);
    expect(resolution.migratedAliases).toEqual([{ from: 'legacyRate', to: 'emissionRate' }]);
    expect(resolution.unknownKeys).toEqual(['obsolete']);
  });
});
