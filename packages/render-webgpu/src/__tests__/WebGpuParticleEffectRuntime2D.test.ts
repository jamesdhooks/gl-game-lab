import { describe, expect, it, vi } from 'vitest';
import { adaptParticleEffectDefinition2D, compileParticleEffect2D, compileParticleProgram2D, type GpuRenderTarget2D, type ParticleEffectDefinition2D } from '@hooksjam/gl-game-lab-engine';
import { WebGpuParticleEffectRuntimeBackend2D, type ParticleWebGpuBuffer2D, type ParticleWebGpuDevice2D } from '../index.js';

class Buffer implements ParticleWebGpuBuffer2D { destroy = vi.fn(); constructor(readonly label?:string){} }

function deviceFixture() {
  const dispatchWorkgroups = vi.fn(), submit = vi.fn(), writeBuffer = vi.fn();
  const buffers:Buffer[]=[]; const device: ParticleWebGpuDevice2D = {
    queue: { writeBuffer, submit },
    createBuffer: (options) => { const buffer=new Buffer(options.label);buffers.push(buffer);return buffer; },
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createTexture: () => ({ createView: () => ({}), destroy: vi.fn() }),
    createSampler: () => ({}),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups, end: vi.fn() }),
      beginRenderPass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() }),
      finish: () => ({}),
    }),
  };
  return { device, dispatchWorkgroups, submit, writeBuffer, buffers };
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
    fixture.writeBuffer.mockClear();
    resource.emit({ instanceId: 1, emitterIndex: 0, count: 40, positionX: 10, positionY: 20, direction: 0, spread: 1, power: 30, seed: 8, importance: 3 });
    resource.update(1 / 60, 1);
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(2);
    expect(fixture.dispatchWorkgroups).toHaveBeenCalledWith(2);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    resource.render({ width: 384, height: 384 } as GpuRenderTarget2D, 'basic');
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0]![4]).toMatchObject({ paletteCount: 1 });
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
    fixture.writeBuffer.mockClear();
    resource.setEventParameters?.(0, 0, { count: 7, probability: 0.5, basePower: 120, lifetimeVariability: 0.4 });
    const eventUpload = fixture.writeBuffer.mock.calls.find((call) => (call[0] as Buffer).label?.includes('event-parameters'));
    expect(eventUpload).toBeDefined();
    const eventValues = eventUpload?.[2] as Float32Array;
    expect(eventValues[0]).toBe(0.5); expect(eventValues[1]).toBe(7); expect(eventValues[11]).toBe(120); expect(eventValues[12]).toBeCloseTo(0.4);
    fixture.writeBuffer.mockClear();
    resource.emit({ instanceId: 1, emitterIndex: 0, count: 1, positionX: 0, positionY: 0, direction: 0, spread: 0, power: 0, seed: 1, importance: 3 });
    resource.update(1, 1);
    expect(fixture.dispatchWorkgroups.mock.calls).toEqual([[2], [2], [6]]);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    expect(resource.diagnostics()).toMatchObject({ eventCount: 1, eventAttempts: 1, simulationPasses: 1, archetypes: { spark: { activeEstimate: 1 } }, eventAttemptsByTrigger: { death: 1 }, eventAttemptsByPriority: { primary: 1 } });
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

  it('clears all GPU-resident particle state and resets the active estimate', () => {
    const fixture = deviceFixture();
    const backend = new WebGpuParticleEffectRuntimeBackend2D(fixture.device, { render: vi.fn() });
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    const resource = backend.create(program, 16);
    resource.emit({ instanceId: 1, emitterIndex: 0, count: 4, positionX: 0, positionY: 0, direction: 0, spread: 0, power: 1, seed: 2, importance: 2 });
    resource.update(1 / 60, 1);
    fixture.writeBuffer.mockClear();
    resource.clear();
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(3);
    expect(fixture.writeBuffer.mock.calls.every((call) => (call[2] as Float32Array).byteLength === 16 * 4 * 4)).toBe(true);
    expect(resource.diagnostics().activeEstimate).toBe(0);
    resource.dispose();
  });

  it('uploads dynamic attractors once per revision and forwards their count in the frame', () => {
    const fixture=deviceFixture(),backend=new WebGpuParticleEffectRuntimeBackend2D(fixture.device,{render:vi.fn()});
    const program=compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))),resource=backend.create(program,16);
    fixture.writeBuffer.mockClear();
    const fields={revision:1,attractors:[{x:8,y:9,strength:2,softening:4,falloff:'inverse' as const,tangentialStrength:3,radius:50,envelope:'smooth' as const,velocity:[6,7] as const,velocityCoupling:.5}]};
    resource.setForceFields?.(fields);resource.setForceFields?.(fields);
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(1);
    const upload=fixture.writeBuffer.mock.calls[0]![2] as Float32Array;
    expect([...upload.slice(0,12)]).toEqual([8,9,2,50,4,1,3,2,6,7,.5,0]);
    resource.update(1/60,1);
    const frameCall=fixture.writeBuffer.mock.calls.find((call)=>(call[2] as ArrayBufferView).byteLength===32);
    expect(new Uint32Array((frameCall?.[2] as Uint8Array).buffer)[6]).toBe(1);
    resource.dispose();
  });

  it('uploads circle wrap domains as backend-neutral policy data',()=>{
    const fixture=deviceFixture(),backend=new WebGpuParticleEffectRuntimeBackend2D(fixture.device,{render:vi.fn()});
    const program=compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))),resource=backend.create(program,16);
    fixture.writeBuffer.mockClear();
    resource.setDomain?.({revision:1,shape:'circle',behavior:'wrap',center:[100,80],radius:70,margin:4,damping:.9});
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(1);
    const values=[...(fixture.writeBuffer.mock.calls[0]![2] as Float32Array)];
    expect(values.slice(0,6)).toEqual([100,80,70,0,1,3]);expect(values[6]).toBeCloseTo(.9);expect(values[7]).toBe(4);
    resource.dispose();
  });

  it('encodes annulus commands and uploads runtime emitter geometry',()=>{
    const fixture=deviceFixture(),backend=new WebGpuParticleEffectRuntimeBackend2D(fixture.device,{render:vi.fn()});
    const base=adaptParticleEffectDefinition2D(definition),graph={...base,emitters:base.emitters.map((emitter)=>({
      ...emitter,source:{kind:'annulus' as const,innerRadius:10,radius:20},
      initialization:{directionMode:'tangent-ccw' as const,radialPowerExponent:-.5},
    }))};
    const program=compileParticleProgram2D(compileParticleEffect2D(graph)),resource=backend.create(program,16);
    fixture.writeBuffer.mockClear();resource.setEmitterSource?.(0,{innerRadius:12,radius:24});
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(1);
    resource.emit({instanceId:1,emitterIndex:0,count:4,positionX:0,positionY:0,direction:0,spread:0,power:1,seed:2,importance:2});
    resource.update(1/60,1);
    const commandCall=fixture.writeBuffer.mock.calls.find((call)=>call[4]===16);
    expect(((commandCall?.[2] as Float32Array)[3]??0)%32).toBe(10);resource.dispose();
  });

  it('uploads palette, bound motion and appearance parameters, and render configuration', () => {
    const fixture = deviceFixture(), render = vi.fn(), backend = new WebGpuParticleEffectRuntimeBackend2D(fixture.device, { render });
    const base = adaptParticleEffectDefinition2D(definition), graph = {
      ...base,
      parameters: [
        { id: 'gravity', kind: 'number' as const, defaultValue: 10, min: -100, max: 100 },
        { id: 'size', kind: 'number' as const, defaultValue: 1, min: 0, max: 10 },
        { id: 'restitution', kind: 'number' as const, defaultValue: 0.5, min: 0, max: 1 },
      ],
      moduleBindings: [
        { parameterId: 'gravity', target: 'archetype.spark.motion.gravity' },
        { parameterId: 'size', target: 'archetype.spark.appearance.size.start' },
        { parameterId: 'restitution', target: 'archetype.spark.collision.restitution' },
      ],
    };
    const resource = backend.create(compileParticleProgram2D(compileParticleEffect2D(graph)), 16);
    fixture.writeBuffer.mockClear();
    resource.setPalette({ revision: 2, colors: [[1, 0, 0], [0, 1, 0]] });
    resource.setParameters?.({ gravity: 25, size: 4, restitution: 0.75 });
    resource.setViewport?.({ width: 320, height: 180, dpr: 2 });
    resource.setRenderParameters?.({ pointScale: 3, intensity: 1.5, streakScale: 0.75, paletteTransition: 0.4, colorMode: 'over-life' });
    resource.render({ width: 320, height: 180 } as GpuRenderTarget2D, 'enhanced');
    const labels = fixture.writeBuffer.mock.calls.map((call) => (call[0] as Buffer).label);
    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('palette'), expect.stringContaining('motion'), expect.stringContaining('appearance-size'), expect.stringContaining('collision-profiles'), expect.stringContaining('render-config')]));
    expect(render.mock.calls[0]![4]).toMatchObject({ paletteCount: 2 });
    resource.dispose();
  });

  it('uploads collider profiles and dynamic circle/capsule geometry without falling back', () => {
    const fixture = deviceFixture(), backend = new WebGpuParticleEffectRuntimeBackend2D(fixture.device, { render: vi.fn() });
    const colliderDefinition: ParticleEffectDefinition2D = {
      ...definition,
      archetypes: [{ ...definition.archetypes[0]!, collision: { bounds: true, circles: true, capsules: true, restitution: 0.8, friction: 0.1, lifetimeLoss: 0.2 } }],
      modules: { ...definition.modules, collisions: true },
    };
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(colliderDefinition)));
    const resource = backend.create(program, 16);
    fixture.writeBuffer.mockClear();
    resource.setColliders?.({ revision: 2, circles: [{ x: 10, y: 20, radius: 4, mode: 'kill' }], capsules: [{ ax: 1, ay: 2, bx: 8, by: 9, radius: 3 }] });
    resource.setColliders?.({ revision: 2, circles: [], capsules: [] });
    expect(fixture.writeBuffer).toHaveBeenCalledTimes(4);
    const uploads = Object.fromEntries(fixture.writeBuffer.mock.calls.map((call) => [(call[0] as Buffer).label, call[2] as Float32Array]));
    expect([...uploads[Object.keys(uploads).find((key) => key.includes('collider-counts'))!]!.slice(0, 2)]).toEqual([1, 1]);
    expect([...uploads[Object.keys(uploads).find((key) => key.includes('circle-colliders'))!]!.slice(0, 4)]).toEqual([10, 20, 4, 1]);
    expect([...uploads[Object.keys(uploads).find((key) => key.includes('capsule-colliders-a'))!]!.slice(0, 4)]).toEqual([1, 2, 8, 9]);
    expect([...uploads[Object.keys(uploads).find((key) => key.includes('capsule-colliders-b'))!]!.slice(0, 2)]).toEqual([3, 0]);
    resource.dispose();
  });

  it('invalidates resident resources after device loss or validation failure', () => {
    const fixture = deviceFixture(), backend = new WebGpuParticleEffectRuntimeBackend2D(fixture.device, { render: vi.fn() });
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))), resource = backend.create(program, 16);
    backend.invalidate(new Error('validation failed'));
    expect(() => resource.update(1 / 60, 1)).toThrow('validation failed');
    expect(() => backend.create(program, 16)).toThrow('validation failed');
    resource.dispose();
  });
});
