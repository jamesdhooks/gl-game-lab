import { describe, expect, it } from 'vitest';
import {
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  evaluateParticleModuleExtensionsReference2D,
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
    expect(program.webgl2.streakVertex.source).toContain('min(desiredLength,max(size,length(b.xy)*max(0.0,a.z)))');
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
    expect(program.webgpu.render.source).toContain('-direction*backward*streakLength');
    expect(program.webgpu.render.source).toContain('@fragment fn particleFragment');
    expect(program.webgpu.render.source).toContain('archetypeSize[archetype]');
    expect(program.reflection).toMatchObject({ stateTargets: 3, usesCollisions: true, usesEvents: true, usesTurbulence: true });
    expect(program.renderPasses.ultra.map((entry) => entry.kind)).toEqual(['points', 'streaks', 'trails', 'bloom']);
  });

  it('deduplicates generated programs through stable source hashes', () => {
    const effect = compileParticleEffect2D(adaptParticleEffectDefinition2D(definition));
    expect(compileParticleProgram2D(effect).webgl2.simulation.hash).toBe(compileParticleProgram2D(effect).webgl2.simulation.hash);
  });

  it('compiles ordered render layers with independent appearance controls', () => {
    const base = adaptParticleEffectDefinition2D(definition);
    const program = compileParticleProgram2D(compileParticleEffect2D({
      ...base,
      renderRecipes: {
        defaultTier: 'enhanced',
        recipes: base.renderRecipes.recipes.map((recipe) => recipe.tier !== 'enhanced' ? recipe : ({
            tier: 'enhanced', points: true, streaks: true, blend: 'additive' as const,
            layers: [
              { id: 'halo', kind: 'halo' as const, sizeScale: 2.5, intensityScale: 0.2, alphaScale: 0.3 },
              { id: 'tail', kind: 'streak' as const, lengthScale: 1.8 },
              { id: 'core', kind: 'core' as const, sizeScale: 0.7, intensityScale: 1.4 },
            ],
          })),
      },
    }));
    expect(program.renderPasses.enhanced).toMatchObject([
      { id: 'enhanced.halo', kind: 'points', layerKind: 'halo', sizeScale: 2.5, intensityScale: 0.2, alphaScale: 0.3 },
      { id: 'enhanced.tail', kind: 'streaks', layerKind: 'streak', lengthScale: 1.8 },
      { id: 'enhanced.core', kind: 'points', layerKind: 'core', sizeScale: 0.7, intensityScale: 1.4 },
    ]);
    expect(program.webgl2.vertex.source).toContain('uLayerSizeScale');
    expect(program.webgl2.fragment.source).toContain('uLayerKind');
  });

  it('fires collision events once unless the effect explicitly enables retriggering', () => {
    const base = adaptParticleEffectDefinition2D(definition);
    const collisionEvent = { trigger: 'collision' as const, childArchetypeId: 'spark', probability: 1, count: 1, maxGeneration: 1 };
    const once = compileParticleProgram2D(compileParticleEffect2D({
      ...base,
      archetypes: [{ ...base.archetypes[0]!, events: [collisionEvent] }],
    }));
    expect(once.webgl2.eventClaimVertex?.source).toContain('(int(c.w+.5)&2)==0');
    expect(once.webgl2.event?.source).toContain('(int(c.w+.5)&1)!=0))c.w=float(int(c.w+.5)|2)');
    expect(once.webgpu.event?.source).toContain('(flags & 2u) == 0u');
    expect(once.webgpu.event?.source).toContain('flags = flags | 2u;');

    const repeating = compileParticleProgram2D(compileParticleEffect2D({
      ...base,
      archetypes: [{ ...base.archetypes[0]!, events: [{ ...collisionEvent, retrigger: true }] }],
    }));
    expect(repeating.webgl2.eventClaimVertex?.source).toContain('if(speed>=eventC.x && (true)');
    expect(repeating.webgl2.event?.source).not.toContain('(int(c.w+.5)&1)!=0))c.w=float(int(c.w+.5)|2)');
    expect(repeating.webgpu.event?.source).not.toContain('(flags & 2u) == 0u');
    expect(repeating.webgpu.event?.source).not.toContain('flags = flags | 2u;');
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

  it('executes selected CPU extension references in compiler order with typed parameters', () => {
    const base = adaptParticleEffectDefinition2D(definition);
    const first = {
      id: 'first-module', supports: ['webgl2', 'webgpu'] as const,
      parameters: { amount: 'number' } as const,
      cpuReference: (state: Float32Array, parameters: Readonly<Record<string, number | boolean | readonly [number, number] | readonly [number, number, number, number]>>) => { state[0] = (state[0] ?? 0) + Number(parameters.amount); },
      glslSimulation: 'stateA.x += 1.0;', wgslSimulation: 'stateA[i].position.x += 1.0;',
    };
    const second = {
      id: 'second-module', supports: ['webgl2', 'webgpu'] as const, runsAfter: ['first-module'],
      parameters: { enabled: 'boolean', axis: 'vector2' } as const,
      cpuReference: (state: Float32Array, parameters: Readonly<Record<string, number | boolean | readonly [number, number] | readonly [number, number, number, number]>>) => { if (parameters.enabled) state[0] = (state[0] ?? 0) * (parameters.axis as readonly [number, number])[0]; },
      glslSimulation: 'stateA.x *= 2.0;', wgslSimulation: 'stateA[i].position.x *= 2.0;',
    };
    const effect = compileParticleEffect2D({ ...base, customModules: ['first-module', 'second-module'] });
    const state = new Float32Array([1]);
    evaluateParticleModuleExtensionsReference2D(effect, [second, first], state, { amount: 2, enabled: true, axis: [3, 0] }, 1 / 60);
    expect(state[0]).toBe(9);
    expect(() => evaluateParticleModuleExtensionsReference2D(effect, [first, second], state, { amount: 2, enabled: true, axis: [3, 0, 1, 1] }, 1 / 60)).toThrow('axis must be vector2');
  });

  it('generates deterministic backend declarations for typed extension resources', () => {
    const base = adaptParticleEffectDefinition2D(definition);
    const extension = {
      id: 'resource-module', supports: ['webgl2', 'webgpu'] as const, cpuReference: () => undefined,
      glslSimulation: 'stateA.x += uBias;', glslFragment: 'outColor.rgb *= texture(uRamp, vec2(vAge, .5)).rgb;',
      wgslSimulation: 'stateA[i].position.x += uBias;', wgslFragment: 'color = vec4<f32>(color.rgb * textureLoad(uRamp, vec2<i32>(0, 0), 0).rgb, color.a);',
      bindings: [
        { name: 'uBias', kind: 'uniform' as const, dataType: 'f32', required: true, stages: ['simulation'] as const },
        { name: 'uRamp', kind: 'texture' as const, dataType: 'rgba8unorm', required: true, stages: ['render'] as const },
      ],
    };
    const program = compileParticleProgram2D(compileParticleEffect2D({ ...base, customModules: [extension.id] }), [extension]);
    expect(program.webgl2.simulation.source).toContain('uniform float uBias;');
    expect(program.webgl2.vertex.source).toContain('uniform sampler2D uRamp;');
    expect(program.webgpu.simulation.source).toContain('@group(1) @binding(0) var<uniform> uBias: f32;');
    expect(program.webgpu.render.source).toContain('@group(1) @binding(0) var uRamp: texture_2d<f32>;');
    const corruptedArtifact = JSON.parse(JSON.stringify(program)) as { reflection: { bindings: Array<{ name: string; stages?: string[] }> } };
    corruptedArtifact.reflection.bindings.find((binding) => binding.name === 'uRamp')!.stages = ['event'];
    expect(() => hydrateCompiledParticleProgram2D(corruptedArtifact)).toThrow('extension binding');
    const invalid = { ...extension, bindings: [{ name: 'particles', kind: 'storage' as const, dataType: 'vec4', required: true, stages: ['simulation'] as const }] };
    expect(() => compileParticleProgram2D(compileParticleEffect2D({ ...base, customModules: [invalid.id] }), [invalid])).toThrow('not WebGL2-compatible');
    const optionalResource = { ...extension, supports: ['webgpu'] as const, bindings: [{ name: 'optionalTexture', kind: 'texture' as const, dataType: 'rgba8unorm', required: false, stages: ['render'] as const }] };
    expect(() => compileParticleProgram2D(compileParticleEffect2D({ ...base, fallbackPolicy: 'fail', customModules: [optionalResource.id] }), [optionalResource])).toThrow('requires an explicit fallback provider');
  });
});
