import { describe, expect, it, vi } from 'vitest';
import {
  adaptParticleEffectDefinition2D, compileParticleEffect2D, compileParticleProgram2D,
  type Gpu2DService, type GpuParticleSystem2D, type GpuUniformBinder2D,
  type GpuUniformEncoder2D, type ParticleEffectDefinition2D,
} from '@hooksjam/gl-game-lab-engine';
import { WebGLParticleEffectRuntimeBackend2D } from '../WebGLParticleEffectRuntime2D.js';

const definition: ParticleEffectDefinition2D = {
  id: 'webgl-extension-test', capacity: { min: 4, default: 16, max: 32, previewMax: 8 },
  archetypes: [{ id: 'spark', spawn: { shape: 'point', spread: 0 }, motion: { gravity: 0, drag: 0 }, lifecycle: { lifetime: 1 }, appearance: { size: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } } }],
  modules: { motion: true, lifecycle: true },
  renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, streaks: true, blend: 'additive' }] },
};

describe('WebGLParticleEffectRuntimeBackend2D extension bindings', () => {
  it('binds typed simulation and render uniforms without changing pass counts', () => {
    const calls: string[] = [];
    const uniformTexture = vi.fn();
    const encoder: GpuUniformEncoder2D = {
      uniform1f: (location, value) => { if (location.name.startsWith('uCustom')) calls.push(`${location.name}:${value}`); },
      uniform1i: vi.fn(), uniform1ui: vi.fn(), uniform2f: vi.fn(), uniform3fv: vi.fn(), uniform4fv: vi.fn(), uniformMatrix4fv: vi.fn(), uniformTexture,
    };
    const run = (bindings?: GpuUniformBinder2D): void => bindings?.(encoder, (name) => ({ name }));
    const particles: GpuParticleSystem2D = {
      capacity: 16, width: 4, height: 4, generation: 1,
      clear: vi.fn(), uploadSeed: vi.fn(), step: vi.fn(),
      stepBatch: (_batch, bindings) => run(typeof bindings === 'function' ? bindings : undefined),
      stepEvents: vi.fn(),
      render: (_target, bindings) => run(typeof bindings === 'function' ? bindings : undefined),
      renderPass: vi.fn(), beginTrails: () => ({ width: 1, height: 1 }), compositeTrails: vi.fn(), clearTrails: vi.fn(),
      debugReadback: () => ({ positions: new Float32Array(), velocities: new Float32Array(), metadata: new Float32Array() }),
      diagnostics: () => ({ commandCapacity: 64, queuedCommands: 0, droppedCommands: 0, spawnedParticles: 0, simulationPasses: 0, eventPasses: 0, renderPasses: 0, uploadBytes: 0, contextGeneration: 1, rebuildCount: 0 }),
      dispose: vi.fn(),
    };
    let particleOptions: Parameters<Gpu2DService['createParticleSystem']>[1] | undefined;
    const gpu = { createParticleSystem: (_id: string, options: Parameters<Gpu2DService['createParticleSystem']>[1]) => {
      particleOptions = options;
      return particles;
    } } as unknown as Gpu2DService;
    const base = adaptParticleEffectDefinition2D(definition);
    const extension = {
      id: 'gain-module', supports: ['webgl2', 'webgpu'] as const, cpuReference: () => undefined,
      glslSimulation: 'stateA.xy += vec2(uCustomSimulation);', glslVertex: 'vIntensity *= uCustomRender;', glslFragment: 'outColor.rgb *= texture(uCustomTexture, vec2(.5)).rgb;',
      wgslSimulation: 'stateA[i].position += vec2<f32>(uCustomSimulation);', wgslVertex: 'out.color.rgb *= uCustomRender;', wgslFragment: 'color = vec4<f32>(color.rgb * textureLoad(uCustomTexture, vec2<i32>(0), 0).rgb, color.a);',
      bindings: [
        { name: 'uCustomSimulation', kind: 'uniform' as const, dataType: 'f32', required: true, stages: ['simulation'] as const },
        { name: 'uCustomRender', kind: 'uniform' as const, dataType: 'f32', required: true, stages: ['render'] as const },
        { name: 'uCustomTexture', kind: 'texture' as const, dataType: 'rgba8unorm', required: true, stages: ['render'] as const },
      ],
    };
    const program = compileParticleProgram2D(compileParticleEffect2D({ ...base, customModules: [extension.id] }), [extension]);
    const resource = new WebGLParticleEffectRuntimeBackend2D(gpu).create(program, 16);
    const texture = { width: 2, height: 2 };
    resource.setExtensionBindings?.({ uCustomSimulation: 2, uCustomRender: 0.5, uCustomTexture: texture });
    resource.update(1 / 60, 1);
    resource.render({ width: 64, height: 64 }, 'basic');
    expect(particleOptions?.renderPasses).toHaveProperty('basic.streaks');
    expect(calls).toEqual(['uCustomSimulation:2', 'uCustomRender:0.5']);
    expect(uniformTexture).toHaveBeenCalledWith({ name: 'uCustomTexture' }, texture, 8);
  });
});
