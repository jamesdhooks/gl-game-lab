import { describe, expect, it } from 'vitest';
import {
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  validateParticleShaderBindings2D,
  type ParticleEffectDefinition2D,
} from '../index.js';

const definition: ParticleEffectDefinition2D = {
  id: 'compiler-test', capacity: { min: 4, default: 16, max: 64, previewMax: 8 },
  archetypes: [{
    id: 'spark', spawn: { shape: 'point', spread: 0 }, motion: { gravity: 9.8, drag: 0.1, turbulence: 0.2 },
    lifecycle: { lifetime: 1 }, appearance: { size: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } },
    collision: { bounds: true, restitution: 0.5, friction: 0.1 },
    events: [{ trigger: 'death', childArchetypeId: 'spark', probability: 0.2, count: 2, maxGeneration: 1 }],
  }],
  modules: { motion: true, lifecycle: true, collisions: true, events: true, turbulence: true },
  renderRecipes: {
    defaultTier: 'enhanced',
    recipes: [
      { tier: 'basic', points: true, blend: 'additive' },
      { tier: 'enhanced', points: true, streaks: true, blend: 'additive' },
      { tier: 'ultra', points: true, streaks: true, trails: true, bloom: true, blend: 'additive' },
    ],
  },
};

describe('ParticleEffectCompiler2D', () => {
  it('generates executable WebGL2 and WebGPU variants with reflection', () => {
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    expect(program.webgl2.simulation.source).toContain('layout(location=2) out vec4 outMetadata');
    expect(program.webgl2.simulation.source).toContain('stateB.xy += vec2');
    expect(program.webgl2.event?.source).toContain('uMetadataState');
    expect(program.webgpu.simulation.source).toContain('@compute @workgroup_size(256)');
    expect(program.reflection).toMatchObject({ stateTargets: 3, usesCollisions: true, usesEvents: true, usesTurbulence: true });
    expect(program.renderPasses.ultra.map((entry) => entry.kind)).toEqual(['points', 'streaks', 'trails', 'bloom']);
  });

  it('deduplicates generated programs through stable source hashes', () => {
    const effect = compileParticleEffect2D(adaptParticleEffectDefinition2D(definition));
    expect(compileParticleProgram2D(effect).webgl2.simulation.hash).toBe(compileParticleProgram2D(effect).webgl2.simulation.hash);
  });

  it('validates reflected bindings and compiler extensions', () => {
    const effect = compileParticleEffect2D(adaptParticleEffectDefinition2D(definition));
    const program = compileParticleProgram2D(effect);
    const names = new Set(program.reflection.bindings.filter((entry) => entry.required).map((entry) => entry.name));
    expect(() => validateParticleShaderBindings2D(program.reflection, names)).not.toThrow();
    names.delete('uDt');
    expect(() => validateParticleShaderBindings2D(program.reflection, names)).toThrow('uDt');
    const extension = { id: 'same', supports: ['webgl2'] as const, cpuReference: () => undefined, glslSimulation: 'stateA.x += 0.0;' };
    expect(() => compileParticleProgram2D(effect, [extension, extension])).toThrow('duplicate');
  });
});
