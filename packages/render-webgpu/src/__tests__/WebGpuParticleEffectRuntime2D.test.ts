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
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(5);
    expect(fixture.dispatchWorkgroups).toHaveBeenCalledWith(2);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    resource.render({ width: 384, height: 384 } as GpuRenderTarget2D, 'basic');
    expect(render).toHaveBeenCalledTimes(1);
    expect(resource.diagnostics()).toMatchObject({ spawnedParticles: 40, simulationPasses: 1, renderPasses: 1 });
    resource.dispose();
  });

  it('dispatches atomic append and priority resolve passes for event graphs', () => {
    const fixture = deviceFixture(), render = vi.fn();
    const backend = new WebGpuParticleEffectRuntimeBackend2D(fixture.device, { render });
    const eventDefinition: ParticleEffectDefinition2D = {
      ...definition,
      archetypes: [{
        ...definition.archetypes[0]!,
        events: [{ trigger: 'death', childArchetypeId: 'spark', probability: 1, count: 4, maxGeneration: 0, priority: 'primary' }],
      }],
      modules: { ...definition.modules, events: true },
    };
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(eventDefinition)));
    const resource = backend.create(program, 512);
    resource.emit({ instanceId: 1, emitterIndex: 0, count: 1, positionX: 0, positionY: 0, direction: 0, spread: 0, power: 0, seed: 1, importance: 3 });
    resource.update(1, 1);
    expect(fixture.dispatchWorkgroups.mock.calls).toEqual([[2], [2], [6]]);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    expect(resource.diagnostics()).toMatchObject({ eventCount: 1, simulationPasses: 1 });
    resource.dispose();
  });

  it('routes direct commands into sorted archetype partitions', () => {
    const fixture=deviceFixture(),backend=new WebGpuParticleEffectRuntimeBackend2D(fixture.device,{render:vi.fn()});
    const second={...definition.archetypes[0]!,id:'accent'};
    const program=compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D({...definition,capacity:{min:16,default:16,max:16,previewMax:16},archetypes:[definition.archetypes[0]!,second]})));
    const resource=backend.create(program,16);
    resource.emit({instanceId:1,emitterIndex:1,count:4,positionX:0,positionY:0,direction:0,spread:0,power:1,seed:2,importance:2});
    resource.update(1/60,1);
    const upload=fixture.writeBuffer.mock.calls.find((call)=>call[4]===16);
    expect(upload).toBeDefined();
    const commands=upload?.[2] as Float32Array;
    expect(commands[0]).toBe(1);
    expect(commands[1]).toBe(8);
    expect(commands[2]).toBe(4);
    resource.dispose();
  });
});
