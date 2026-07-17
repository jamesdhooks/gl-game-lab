import { describe, expect, it } from 'vitest';
import {
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  type ParticleEffectDefinition2D,
} from '@hooksjam/gl-game-lab-engine';
import { ParticleEventWindowScheduler } from '../ParticleEventWindowScheduler.js';

function compile(events: ParticleEffectDefinition2D['archetypes'][number]['events']) {
  const definition: ParticleEffectDefinition2D = {
    id: 'event-windows',
    capacity: { min: 4, default: 16, max: 64, previewMax: 8 },
    archetypes: [{
      id: 'particle',
      spawn: { shape: 'point', spread: 0 },
      motion: { gravity: 0, drag: 0 },
      lifecycle: { lifetime: 2, lifetimeVariability: 0.25 },
      appearance: {
        size: { start: 1, end: 1 },
        alpha: { start: 1, end: 1 },
        intensity: { start: 1, end: 1 },
      },
      ...(events === undefined ? {} : { events }),
    }],
    modules: { motion: true, lifecycle: true, events: true },
    renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
  };
  return compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
}

describe('ParticleEventWindowScheduler', () => {
  it('runs death-event passes only across the conservative lifetime interval', () => {
    const scheduler = new ParticleEventWindowScheduler(compile([{
      trigger: 'death', childArchetypeId: 'particle', probability: 1, count: 1, maxGeneration: 0,
    }]));
    scheduler.schedule(0, 10);
    expect(scheduler.hasActiveWindow(11.49)).toBe(false);
    expect(scheduler.hasActiveWindow(11.5)).toBe(true);
    expect(scheduler.hasActiveWindow(12.55)).toBe(true);
    scheduler.compact(12.56);
    expect(scheduler.hasActiveWindow(12.56)).toBe(false);
  });

  it('covers delayed age events without running continuously', () => {
    const scheduler = new ParticleEventWindowScheduler(compile([{
      trigger: 'age', childArchetypeId: 'particle', probability: 1, count: 1, maxGeneration: 0, delay: 0.75,
    }]));
    scheduler.schedule(0, 3);
    expect(scheduler.hasActiveWindow(3.74)).toBe(false);
    expect(scheduler.hasActiveWindow(3.75)).toBe(true);
    expect(scheduler.hasActiveWindow(3.81)).toBe(false);
  });

  it('merges overflow into a conservative final window', () => {
    const scheduler = new ParticleEventWindowScheduler(compile([{
      trigger: 'collision', childArchetypeId: 'particle', probability: 1, count: 1, maxGeneration: 0,
    }]), 1);
    scheduler.schedule(0, 1);
    scheduler.schedule(0, 5);
    expect(scheduler.hasActiveWindow(7.49)).toBe(true);
    expect(scheduler.hasActiveWindow(7.51)).toBe(false);
  });
});
