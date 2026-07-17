import { describe, expect, it } from 'vitest';
import {
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  hydrateCompiledParticleProgram2D,
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
    expect(program.webgl2.simulation.source).toContain('stateB.z += (stateB.w + motion.w) * uDt');
    expect(program.webgl2.simulation.source).not.toContain('stateB.w += motion.w');
    expect(program.webgl2.simulation.source).toContain('uAttractorData[16]');
    expect(program.webgl2.simulation.source).toContain('fieldIndex>=uAttractorCount');
    expect(program.webgl2.simulation.source).toContain('iteration < 6');
    expect(program.webgl2.simulation.source).not.toContain('commandIndex = 0; commandIndex < 64');
    expect(program.webgl2.simulation.source).toContain('shape == 8');
    expect(program.webgl2.simulation.source).toContain('shape == 10');
    expect(program.webgl2.simulation.source).toContain('shape == 11');
    expect(program.webgl2.simulation.source).toContain('source.x*2.0');
    expect(program.webgl2.simulation.source).toContain('uEmitterInitialization');
    expect(program.webgl2.event?.source).toContain('uMetadataState');
    expect(program.webgl2.event?.source).toContain('uParticleEventClaims');
    expect(program.webgl2.event?.source).toContain('uParticleEventA[1]');
    expect(program.webgl2.event?.source).toContain('uParticleEventB[1]');
    expect(program.webgl2.event?.source).toContain('uParticleEventC[1]');
    expect(program.webgl2.event?.source).toContain('uParticleEventD[1]');
    expect(program.webgl2.streakVertex.source).toContain('uStreakScale');
    expect(program.webgl2.eventClaimVertex?.source).toContain('gl_VertexID');
    expect(program.webgl2.eventClaimVertex?.source).toContain('priority*4194304');
    expect(program.webgl2.eventClaimVertex?.source).toContain('uArchetypePools');
    expect(program.webgl2.eventClaimVertex?.source).toContain('uParticleEventA[1]');
    expect(program.webgl2.eventClaimVertex?.source).toContain('uParticleEventC[1]');
    expect(program.webgl2.eventClaimVertex?.source).toContain('precision highp int');
    expect(program.webgl2.eventClaimFragment?.source).toContain('precision highp int');
    for (const shader of [program.webgl2.simulation, program.webgl2.event, program.webgl2.vertex, program.webgl2.streakVertex, program.webgl2.fragment]) {
      expect(shader?.source).toContain('precision highp int');
    }
    expect(program.webgl2.eventClaimVertex?.source).toContain('(int(c.w+.5)&2)==0');
    expect(program.webgl2.eventClaimFragment?.source).toContain('outClaim');
    expect(program.webgl2.event?.source).toContain('int(c.w+.5)|2');
    expect(program.webgpu.simulation.source).toContain('@compute @workgroup_size(256)');
    expect(program.webgpu.simulation.source).toContain('iteration < 6u');
    expect(program.webgpu.simulation.source).toContain('archetypeMotion[archetype]');
    expect(program.webgpu.simulation.source).toContain('archetypeForce[archetype]');
    expect(program.webgpu.simulation.source).toContain('emitterInitialization[emitter]');
    expect(program.webgpu.simulation.source).toContain('turbulenceAngle');
    expect(program.webgpu.simulation.source).toContain('stateB[i].angularVelocity + motion.w');
    expect(program.webgpu.simulation.source).toContain('frame.attractorCount');
    expect(program.webgpu.simulation.source).toContain('archetypeCollision[archetype]');
    expect(program.webgpu.simulation.source).toContain('circleColliders[collider]');
    expect(program.webgpu.simulation.source).toContain('capsuleColliderA[collider]');
    expect(program.webgpu.simulation.source).toContain('stateC[i].flags=f32');
    expect(program.webgpu.simulation.source).toContain('shape == 9u');
    expect(program.webgpu.simulation.source).toContain('shape == 11u');
    expect(program.webgpu.event?.source).toContain('atomicAdd');
    expect(program.webgpu.event?.source).toContain('appendEvents');
    expect(program.webgpu.event?.source).toContain('eventParameters');
    expect(program.webgpu.eventResolve?.source).toContain('resolveEvents');
    expect(program.webgpu.eventResolve?.source).toContain('record.targetSlot%poolCount');
    expect(program.webgpu.eventResolve?.source).toContain('parametersD');
    expect(program.webgpu.render.source).toContain('fn particleStreakVertex');
    expect(program.webgpu.render.source).toContain('@fragment fn particleFragment');
    expect(program.webgpu.render.source).toContain('archetypeSize[archetype]');
    expect(program.reflection).toMatchObject({ stateTargets: 3, usesCollisions: true, usesEvents: true, usesTurbulence: true });
    expect(program.renderPasses.ultra.map((entry) => entry.kind)).toEqual(['points', 'streaks', 'trails', 'bloom']);
  });

  it('deduplicates generated programs through stable source hashes', () => {
    const effect = compileParticleEffect2D(adaptParticleEffectDefinition2D(definition));
    expect(compileParticleProgram2D(effect).webgl2.simulation.hash).toBe(compileParticleProgram2D(effect).webgl2.simulation.hash);
  });

  it('matches the reviewed backend shader golden', () => {
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    expect({
      webgl2: {
        simulation: program.webgl2.simulation.source,
        event: program.webgl2.event?.source,
        eventClaimVertex: program.webgl2.eventClaimVertex?.source,
        eventClaimFragment: program.webgl2.eventClaimFragment?.source,
        vertex: program.webgl2.vertex.source,
        streakVertex: program.webgl2.streakVertex.source,
        fragment: program.webgl2.fragment.source,
      },
      webgpu: {
        simulation: program.webgpu.simulation.source,
        event: program.webgpu.event?.source,
        eventResolve: program.webgpu.eventResolve?.source,
        render: program.webgpu.render.source,
      },
      reflection: program.reflection,
    }).toMatchSnapshot();
  });

  it('hydrates validated build artifacts without regenerating shaders', () => {
    const compiled = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    const artifact: unknown = JSON.parse(JSON.stringify(compiled));
    const hydrated = hydrateCompiledParticleProgram2D(artifact);
    expect(hydrated.webgl2.simulation.source).toBe(compiled.webgl2.simulation.source);
    expect(Object.isFrozen(hydrated)).toBe(true);
    expect(Object.isFrozen(hydrated.effect.source.archetypes)).toBe(true);
  });

  it('rejects stale or corrupted build artifacts', () => {
    const compiled = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    const stale = JSON.parse(JSON.stringify(compiled)) as { effect: { compilerVersion: number } };
    stale.effect.compilerVersion += 1;
    expect(() => hydrateCompiledParticleProgram2D(stale)).toThrow('compiler version');
    const corrupted = JSON.parse(JSON.stringify(compiled)) as { webgl2: { simulation: { source: string } } };
    corrupted.webgl2.simulation.source += '\n// corrupt';
    expect(() => hydrateCompiledParticleProgram2D(corrupted)).toThrow('shader hash mismatch');
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

  it('compiles only graph-selected extensions and enforces their declared order on both backends', () => {
    const base = adaptParticleEffectDefinition2D(definition);
    const alpha = {
      id: 'alpha-module', supports: ['webgl2', 'webgpu'] as const, cpuReference: () => undefined,
      glslSimulation: 'stateA.x += 1.0;', wgslSimulation: 'stateA[i].position.x += 1.0;',
    };
    const beta = {
      id: 'beta-module', supports: ['webgl2', 'webgpu'] as const, runsAfter: ['alpha-module'], cpuReference: () => undefined,
      glslSimulation: 'stateA.y += 2.0;', wgslSimulation: 'stateA[i].position.y += 2.0;', wgslRender: 'out.color.rgb *= 0.5;',
    };
    const unused = {
      id: 'unused-module', supports: ['webgl2', 'webgpu'] as const, cpuReference: () => undefined,
      glslSimulation: 'stateA.x += 99.0;', wgslSimulation: 'stateA[i].position.x += 99.0;',
    };
    expect(() => compileParticleProgram2D(compileParticleEffect2D({ ...base, customModules: ['beta-module', 'alpha-module'] }), [alpha, beta])).toThrow('must run after');
    const program = compileParticleProgram2D(compileParticleEffect2D({ ...base, customModules: ['alpha-module', 'beta-module'] }), [unused, beta, alpha]);
    expect(program.webgl2.simulation.source.indexOf('stateA.x += 1.0;')).toBeLessThan(program.webgl2.simulation.source.indexOf('stateA.y += 2.0;'));
    expect(program.webgl2.simulation.source).not.toContain('99.0');
    expect(program.webgpu.simulation.source).not.toContain('99.0');
    expect(program.webgpu.render.source).toContain('out.color.rgb *= 0.5;');
  });
});
