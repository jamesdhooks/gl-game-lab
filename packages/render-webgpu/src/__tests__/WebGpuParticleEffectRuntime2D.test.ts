import { describe, expect, it, vi } from 'vitest';
import { adaptParticleEffectDefinition2D, compileParticleEffect2D, compileParticleProgram2D, type GpuRenderTarget2D, type ParticleEffectDefinition2D } from '@hooksjam/gl-game-lab-engine';
import { WebGpuParticleEffectRuntimeBackend2D, type ParticleWebGpuBuffer2D, type ParticleWebGpuDevice2D } from '../index.js';

class Buffer implements ParticleWebGpuBuffer2D { destroy = vi.fn(); }

function deviceFixture() {
  const dispatchWorkgroups = vi.fn(), submit = vi.fn(), writeBuffer = vi.fn();
  const device: ParticleWebGpuDevice2D = {
    queue: { writeBuffer, submit },
    createBuffer: () => new Buffer(),
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups, end: vi.fn() }),
      finish: () => ({}),
    }),
  };
  return { device, dispatchWorkgroups, submit, writeBuffer };
}

const definition: ParticleEffectDefinition2D = {
  id: 'webgpu-test', capacity: { min: 16, default: 512, max: 1024, previewMax: 128 },
  archetypes: [{ id: 'spark', spawn: { shape: 'point', spread: 0.5 }, motion: { gravity: 10, drag: 0.1 }, lifecycle: { lifetime: 1 }, appearance: { size: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } } }],
  modules: { motion: true, lifecycle: true }, renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
};

describe('WebGpuParticleEffectRuntimeBackend2D', () => {
  it('uploads commands, dispatches compute, and delegates direct GPU rendering', () => {
    const fixture = deviceFixture(), render = vi.fn();
    const backend = new WebGpuParticleEffectRuntimeBackend2D(fixture.device, { render });
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    const resource = backend.create(program, 512);
    resource.emit({ instanceId: 1, emitterIndex: 0, count: 40, positionX: 10, positionY: 20, direction: 0, spread: 1, power: 30, seed: 8, importance: 3 });
    resource.update(1 / 60, 1);
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(4);
    expect(fixture.dispatchWorkgroups).toHaveBeenCalledWith(2);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    resource.render({ width: 384, height: 384 } as GpuRenderTarget2D, 'basic');
    expect(render).toHaveBeenCalledTimes(1);
    expect(resource.diagnostics()).toMatchObject({ spawnedParticles: 40, simulationPasses: 1, renderPasses: 1 });
    resource.dispose();
  });
});
