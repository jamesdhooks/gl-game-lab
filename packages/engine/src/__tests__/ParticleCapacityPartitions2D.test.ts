import { describe, expect, it } from 'vitest';
import {
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  resolveParticleArchetypePartitions2D,
  type ParticleEffectDefinition2D,
} from '../index.js';

function effect(capacityPolicies?: ReturnType<typeof compileParticleEffect2D>['source']['archetypeCapacity']) {
  const archetype = (id: string) => ({
    id,
    spawn: { shape: 'point' as const, spread: 0 },
    motion: { gravity: 0, drag: 0 }, lifecycle: { lifetime: 1 },
    appearance: { size: { start: 1, end: 1 }, alpha: { start: 1, end: 1 }, intensity: { start: 1, end: 1 } },
  });
  const definition: ParticleEffectDefinition2D = {
    id: 'partitions', capacity: { min: 16, default: 16, max: 64, previewMax: 16 },
    archetypes: [archetype('primary'), archetype('cosmetic')],
    modules: { motion: true, lifecycle: true },
    renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
  };
  const graph = adaptParticleEffectDefinition2D(definition);
  return compileParticleEffect2D({ ...graph, ...(capacityPolicies === undefined ? {} : { archetypeCapacity: capacityPolicies }) });
}

describe('resolveParticleArchetypePartitions2D', () => {
  it('covers capacity with stable contiguous default pools', () => {
    expect(resolveParticleArchetypePartitions2D(effect(), 17)).toEqual([
      { archetypeId: 'primary', archetypeIndex: 0, start: 0, count: 9, overflow: 'reserve-priority' },
      { archetypeId: 'cosmetic', archetypeIndex: 1, start: 9, count: 8, overflow: 'recycle-oldest' },
    ]);
  });

  it('honors reservations and gives unassigned capacity to priority pools', () => {
    const policies = [
      { archetypeId: 'primary', share: 0.25, reserved: 5, overflow: 'reserve-priority' as const },
      { archetypeId: 'cosmetic', share: 0.25, overflow: 'drop-new' as const },
    ];
    expect(resolveParticleArchetypePartitions2D(effect(policies), 16)).toEqual([
      { archetypeId: 'primary', archetypeIndex: 0, start: 0, count: 12, overflow: 'reserve-priority' },
      { archetypeId: 'cosmetic', archetypeIndex: 1, start: 12, count: 4, overflow: 'drop-new' },
    ]);
  });

  it('rejects reservations larger than runtime capacity', () => {
    const policies = [
      { archetypeId: 'primary', share: 0.5, reserved: 12, overflow: 'reserve-priority' as const },
      { archetypeId: 'cosmetic', share: 0.5, reserved: 12, overflow: 'drop-new' as const },
    ];
    expect(() => effect(policies)).toThrow('require 24 slots');
  });
});
