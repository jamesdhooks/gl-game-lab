import type {
  CompiledParticleProgram2D,
  GpuRenderTarget2D,
  ParticleDomain2D,
  ParticleEffectBackendDiagnostics2D,
  ParticleEffectBackendResource2D,
  ParticleEffectRuntimeBackend2D,
  ParticleForceFieldSet2D,
  ParticlePalette2D,
  ParticleRenderTier2D,
  ParticleRuntimeEmission2D,
} from '@hooksjam/gl-game-lab-engine';
import { ParticleEventWindowScheduler2D, planParticleSpawnCommands2D, resolveParticleArchetypePartitions2D } from '@hooksjam/gl-game-lab-engine';

const COMMAND_CAPACITY = 64;
const COMMAND_FLOATS = 16;
const STORAGE_COPY_USAGE = 0x80 | 0x08;
const UNIFORM_COPY_USAGE = 0x40 | 0x08;

export interface ParticleWebGpuBuffer2D { destroy(): void }
export interface ParticleWebGpuShaderModule2D {}
export interface ParticleWebGpuBindGroup2D {}
export interface ParticleWebGpuComputePipeline2D { getBindGroupLayout(index: number): unknown }
export interface ParticleWebGpuComputePass2D { setPipeline(pipeline: ParticleWebGpuComputePipeline2D): void; setBindGroup(index: number, bindGroup: ParticleWebGpuBindGroup2D): void; dispatchWorkgroups(count: number): void; end(): void }
export interface ParticleWebGpuCommandEncoder2D { beginComputePass(options?: Readonly<Record<string, unknown>>): ParticleWebGpuComputePass2D; finish(): unknown }
export interface ParticleWebGpuDevice2D {
  readonly queue: { writeBuffer(buffer: ParticleWebGpuBuffer2D, offset: number, data: ArrayBufferView, dataOffset?: number, size?: number): void; submit(commands: readonly unknown[]): void };
  createBuffer(options: { readonly label?: string; readonly size: number; readonly usage: number }): ParticleWebGpuBuffer2D;
  createShaderModule(options: { readonly label?: string; readonly code: string }): ParticleWebGpuShaderModule2D;
  createComputePipeline(options: { readonly label?: string; readonly layout: 'auto'; readonly compute: { readonly module: ParticleWebGpuShaderModule2D; readonly entryPoint: string } }): ParticleWebGpuComputePipeline2D;
  createBindGroup(options: { readonly label?: string; readonly layout: unknown; readonly entries: readonly { readonly binding: number; readonly resource: { readonly buffer: ParticleWebGpuBuffer2D } }[] }): ParticleWebGpuBindGroup2D;
  createCommandEncoder(options?: { readonly label?: string }): ParticleWebGpuCommandEncoder2D;
}

export type WebGpuParticleEffectRender2D = (
  program: CompiledParticleProgram2D,
  state: readonly [ParticleWebGpuBuffer2D, ParticleWebGpuBuffer2D, ParticleWebGpuBuffer2D],
  target: GpuRenderTarget2D,
  tier: ParticleRenderTier2D,
) => void;

export interface WebGpuParticleEffectRuntimeOptions2D { readonly render: WebGpuParticleEffectRender2D }

export class WebGpuParticleEffectRuntimeBackend2D implements ParticleEffectRuntimeBackend2D {
  readonly kind = 'webgpu';
  private serial = 0;
  constructor(private readonly device: ParticleWebGpuDevice2D, private readonly options: WebGpuParticleEffectRuntimeOptions2D) {}
  create(program: CompiledParticleProgram2D, capacity: number): ParticleEffectBackendResource2D {
    return new WebGpuParticleEffectResource2D(this.device, `particle-effect.${program.effect.source.id}.${this.serial++}`, program, capacity, this.options.render);
  }
}

class WebGpuParticleEffectResource2D implements ParticleEffectBackendResource2D {
  private readonly stateA: ParticleWebGpuBuffer2D;
  private readonly stateB: ParticleWebGpuBuffer2D;
  private readonly stateC: ParticleWebGpuBuffer2D;
  private readonly commands: ParticleWebGpuBuffer2D;
  private readonly frame: ParticleWebGpuBuffer2D;
  private readonly motion: ParticleWebGpuBuffer2D;
  private readonly sources: ParticleWebGpuBuffer2D;
  private readonly forces: ParticleWebGpuBuffer2D;
  private readonly attractors: ParticleWebGpuBuffer2D;
  private readonly domain: ParticleWebGpuBuffer2D;
  private readonly emitterInitialization: ParticleWebGpuBuffer2D;
  private readonly pools: ParticleWebGpuBuffer2D;
  private readonly eventQueue: ParticleWebGpuBuffer2D | undefined;
  private readonly eventCounters: ParticleWebGpuBuffer2D | undefined;
  private readonly pipeline: ParticleWebGpuComputePipeline2D;
  private readonly bindGroup: ParticleWebGpuBindGroup2D;
  private readonly eventPipeline: ParticleWebGpuComputePipeline2D | undefined;
  private readonly eventResolvePipeline: ParticleWebGpuComputePipeline2D | undefined;
  private readonly eventBindGroup: ParticleWebGpuBindGroup2D | undefined;
  private readonly eventResolveBindGroup: ParticleWebGpuBindGroup2D | undefined;
  private readonly commandData = new Float32Array(COMMAND_CAPACITY * COMMAND_FLOATS);
  private readonly preparedCommandData = new Float32Array(COMMAND_CAPACITY * COMMAND_FLOATS);
  private readonly poolData: Float32Array;
  private readonly poolCursor: Int32Array;
  private readonly poolQueued: Int32Array;
  private readonly frameData = new ArrayBuffer(32);
  private readonly frameFloats = new Float32Array(this.frameData);
  private readonly frameUints = new Uint32Array(this.frameData);
  private readonly frameBytes = new Uint8Array(this.frameData);
  private readonly zeroEventCounters: Uint32Array;
  private readonly attractorData = new Float32Array(16 * 12);
  private readonly domainData = new Float32Array([0, 0, 1, 1, 0, 0, 1, 0]);
  private attractorCount = 0;
  private forceFieldRevision = -1;
  /** Reused reset payload. Clearing is an authoring/lifecycle action, never a per-frame allocation. */
  private readonly zeroState: Float32Array;
  private readonly submissions: unknown[] = [undefined];
  private readonly eventWindows: ParticleEventWindowScheduler2D;
  private commandCount = 0;
  private preparedCommandCount = 0;
  private particleCount = 0;
  private spawnedParticles = 0;
  private droppedCommands = 0;
  private admittedCommands = 0;
  private droppedParticles = 0;
  private truncatedCommands = 0;
  private simulationPasses = 0;
  private renderPasses = 0;
  private eventPasses = 0;
  private uploadBytes = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private simulationTime = 0;
  private disposed = false;

  constructor(
    private readonly device: ParticleWebGpuDevice2D,
    id: string,
    private readonly program: CompiledParticleProgram2D,
    private readonly capacity: number,
    private readonly renderEffect: WebGpuParticleEffectRender2D,
  ) {
    const stateBytes = capacity * 4 * Float32Array.BYTES_PER_ELEMENT;
    this.zeroState = new Float32Array(capacity * 4);
    this.stateA = device.createBuffer({ label: `${id}.state-a`, size: stateBytes, usage: STORAGE_COPY_USAGE });
    this.stateB = device.createBuffer({ label: `${id}.state-b`, size: stateBytes, usage: STORAGE_COPY_USAGE });
    this.stateC = device.createBuffer({ label: `${id}.state-c`, size: stateBytes, usage: STORAGE_COPY_USAGE });
    this.commands = device.createBuffer({ label: `${id}.commands`, size: this.commandData.byteLength, usage: STORAGE_COPY_USAGE });
    this.frame = device.createBuffer({ label: `${id}.frame`, size: this.frameData.byteLength, usage: UNIFORM_COPY_USAGE });
    const motionData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    program.effect.source.archetypes.forEach((archetype, index) => {
      motionData[index * 4] = archetype.motion.gravity; motionData[index * 4 + 1] = archetype.motion.drag;
      motionData[index * 4 + 2] = archetype.motion.turbulence ?? 0; motionData[index * 4 + 3] = archetype.motion.angularVelocity ?? 0;
    });
    this.motion = device.createBuffer({ label: `${id}.motion`, size: motionData.byteLength, usage: STORAGE_COPY_USAGE });
    device.queue.writeBuffer(this.motion, 0, motionData);
    const forceData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    program.effect.source.archetypes.forEach((archetype, index) => {
      forceData[index * 4] = archetype.motion.radialAcceleration ?? 0; forceData[index * 4 + 1] = archetype.motion.tangentialAcceleration ?? 0;
      forceData[index * 4 + 2] = archetype.motion.radialFalloff === 'inverse-square' ? 2 : archetype.motion.radialFalloff === 'inverse' ? 1 : 0;
      forceData[index * 4 + 3] = archetype.motion.maxSpeed ?? 0;
    });
    this.forces = device.createBuffer({ label: `${id}.forces`, size: forceData.byteLength, usage: STORAGE_COPY_USAGE });
    device.queue.writeBuffer(this.forces, 0, forceData);
    this.attractors = device.createBuffer({ label: `${id}.attractors`, size: this.attractorData.byteLength, usage: STORAGE_COPY_USAGE });
    device.queue.writeBuffer(this.attractors, 0, this.attractorData);
    this.domain = device.createBuffer({ label: `${id}.domain`, size: this.domainData.byteLength, usage: STORAGE_COPY_USAGE });
    device.queue.writeBuffer(this.domain, 0, this.domainData);
    const sourceData = new Float32Array(Math.max(1, program.effect.source.emitters.length) * 4);
    const emitterInitializationData=new Float32Array(Math.max(1,program.effect.source.emitters.length)*4);
    program.effect.source.emitters.forEach((emitter, index) => {
      const source = emitter.source,initialization=emitter.initialization,mode=initialization?.directionMode;
      sourceData[index * 4] = 'radius' in source ? source.radius ?? 0 : 'width' in source ? source.width * 0.5 : 0;
      sourceData[index * 4 + 1] = 'innerRadius' in source ? source.innerRadius ?? ('length' in source ? source.length ?? 0 : 0) : 'length' in source ? source.length ?? 0 : 'height' in source ? source.height * 0.5 : 0;
      sourceData[index * 4 + 2] = 'arc' in source ? source.arc ?? Math.PI * 2 : Math.PI * 2;
      sourceData[index * 4 + 3] = 'spread' in source ? source.spread ?? 0 : 0;
      emitterInitializationData.set([mode==='radial'?1:mode==='tangent-ccw'?2:mode==='tangent-cw'?3:0,initialization?.radialPowerExponent??0,'radius' in source?source.radius??1:1,0],index*4);
    });
    this.sources = device.createBuffer({ label: `${id}.sources`, size: sourceData.byteLength, usage: STORAGE_COPY_USAGE });
    device.queue.writeBuffer(this.sources, 0, sourceData);
    this.emitterInitialization=device.createBuffer({label:`${id}.emitter-initialization`,size:emitterInitializationData.byteLength,usage:STORAGE_COPY_USAGE});
    device.queue.writeBuffer(this.emitterInitialization,0,emitterInitializationData);
    const partitions = resolveParticleArchetypePartitions2D(program.effect, capacity);
    const poolData = new Float32Array(Math.max(1, partitions.length) * 4);
    this.poolData = poolData;
    this.poolCursor = new Int32Array(Math.max(1, partitions.length));
    this.poolQueued = new Int32Array(Math.max(1, partitions.length));
    for (const partition of partitions) {
      const offset = partition.archetypeIndex * 4;
      poolData[offset] = partition.start; poolData[offset + 1] = partition.count;
      poolData[offset + 2] = partition.overflow === 'drop-new' ? 1 : partition.overflow === 'reserve-priority' ? 2 : 0;
      this.poolCursor[partition.archetypeIndex] = partition.start;
    }
    this.pools = device.createBuffer({ label: `${id}.pools`, size: poolData.byteLength, usage: STORAGE_COPY_USAGE });
    device.queue.writeBuffer(this.pools, 0, poolData);
    this.zeroEventCounters = new Uint32Array(3 + program.effect.source.archetypes.length);
    this.eventWindows = new ParticleEventWindowScheduler2D(program);
    const module = device.createShaderModule({ label: `${id}.compute`, code: program.webgpu.simulation.source });
    this.pipeline = device.createComputePipeline({ label: `${id}.pipeline`, layout: 'auto', compute: { module, entryPoint: program.webgpu.simulation.entryPoint } });
    this.bindGroup = device.createBindGroup({
      label: `${id}.bindings`, layout: this.pipeline.getBindGroupLayout(0),
      entries: [this.stateA, this.stateB, this.stateC, this.frame, this.commands, this.motion, this.sources, this.forces, this.attractors, this.domain, this.emitterInitialization].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    if (program.webgpu.event && program.webgpu.eventResolve) {
      this.eventQueue = device.createBuffer({ label: `${id}.event-queue`, size: capacity * 3 * 16, usage: STORAGE_COPY_USAGE });
      this.eventCounters = device.createBuffer({ label: `${id}.event-counters`, size: this.zeroEventCounters.byteLength, usage: STORAGE_COPY_USAGE });
      const eventModule = device.createShaderModule({ label: `${id}.event-append`, code: program.webgpu.event.source });
      const resolveModule = device.createShaderModule({ label: `${id}.event-resolve`, code: program.webgpu.eventResolve.source });
      this.eventPipeline = device.createComputePipeline({ label: `${id}.event-append-pipeline`, layout: 'auto', compute: { module: eventModule, entryPoint: program.webgpu.event.entryPoint } });
      this.eventResolvePipeline = device.createComputePipeline({ label: `${id}.event-resolve-pipeline`, layout: 'auto', compute: { module: resolveModule, entryPoint: program.webgpu.eventResolve.entryPoint } });
      const entries = [this.stateA, this.stateB, this.stateC, this.frame, this.pools, this.eventQueue, this.eventCounters].map((buffer, binding) => ({ binding, resource: { buffer } }));
      this.eventBindGroup = device.createBindGroup({ label: `${id}.event-bindings`, layout: this.eventPipeline.getBindGroupLayout(0), entries });
      this.eventResolveBindGroup = device.createBindGroup({ label: `${id}.event-resolve-bindings`, layout: this.eventResolvePipeline.getBindGroupLayout(0), entries });
    } else {
      this.eventQueue = undefined; this.eventCounters = undefined; this.eventPipeline = undefined; this.eventResolvePipeline = undefined; this.eventBindGroup = undefined; this.eventResolveBindGroup = undefined;
    }
  }

  emit(emission: ParticleRuntimeEmission2D): void {
    this.assertUsable();
    if (this.commandCount >= COMMAND_CAPACITY) { this.droppedCommands += 1; this.droppedParticles += emission.count; return; }
    const emitter = this.program.effect.source.emitters[emission.emitterIndex];
    if (!emitter) throw new Error(`WebGPU emission references invalid emitter ${emission.emitterIndex}`);
    const archetypeId = this.program.effect.archetypeIds[emitter.archetypeId];
    const archetype = this.program.effect.source.archetypes[archetypeId ?? -1];
    if (archetypeId === undefined || !archetype) throw new Error(`WebGPU emitter references invalid archetype ${emitter.archetypeId}`);
    const poolCapacity=Math.max(0,Math.round(this.poolData[archetypeId*4+1]??0));
    const count = Math.min(Math.max(0, poolCapacity-this.poolQueued[archetypeId]!), emission.count), offset = this.commandCount * COMMAND_FLOATS;
    if (count <= 0) { this.droppedCommands += 1; this.droppedParticles += emission.count; return; }
    this.commandData[offset] = archetypeId; this.commandData[offset + 1] = 0; this.commandData[offset + 2] = count;
    this.commandData[offset + 3] = spawnShapeCode(emitter.source.kind) + 32 * Math.round(this.poolData[archetypeId * 4 + 2] ?? 0);
    this.commandData[offset + 4] = emission.positionX; this.commandData[offset + 5] = emission.positionY;
    this.commandData[offset + 6] = emission.inheritedVelocityX ?? 0; this.commandData[offset + 7] = emission.inheritedVelocityY ?? 0;
    this.commandData[offset + 8] = emission.direction; this.commandData[offset + 9] = emission.spread || archetype.spawn.spread;
    this.commandData[offset + 10] = emission.power; this.commandData[offset + 11] = archetype.lifecycle.lifetime;
    this.commandData[offset + 12] = emission.seed; this.commandData[offset + 13] = 0;
    this.commandData[offset + 14] = archetype.lifecycle.lifetimeVariability ?? 0;
    this.commandData[offset + 15] = emission.emitterIndex;
    this.commandCount += 1; this.particleCount += count; this.droppedParticles += emission.count - count;
    this.poolQueued[archetypeId] = this.poolQueued[archetypeId]! + count;
    this.admittedCommands += 1;
    if (count < emission.count) this.truncatedCommands += 1;
    if ((archetype.events?.length ?? 0) > 0) this.eventWindows.schedule(archetypeId, this.simulationTime);
  }

  setPalette(_palette: ParticlePalette2D): void { this.assertUsable(); }

  setForceFields(value: ParticleForceFieldSet2D): void {
    this.assertUsable();
    if (value.revision === this.forceFieldRevision) return;
    this.forceFieldRevision = value.revision; this.attractorData.fill(0); this.attractorCount = Math.min(16, value.attractors.length);
    for (let index = 0; index < this.attractorCount; index += 1) {
      const field = value.attractors[index]!, offset = index * 12;
      this.attractorData.set([field.x, field.y, field.strength, field.radius ?? 0, field.softening ?? 1, forceFalloffCode(field.falloff), field.tangentialStrength ?? 0, forceEnvelopeCode(field.envelope), field.velocity?.[0] ?? 0, field.velocity?.[1] ?? 0, field.velocityCoupling ?? 0, 0], offset);
    }
    this.device.queue.writeBuffer(this.attractors, 0, this.attractorData); this.uploadBytes += this.attractorData.byteLength;
  }

  setDomain(value: ParticleDomain2D): void {
    this.assertUsable(); const extents=value.halfExtents??[0,0];
    this.domainData.set([value.center[0],value.center[1],value.shape==='circle'?(value.radius??0):extents[0],value.shape==='circle'?0:extents[1],value.shape==='circle'?1:0,domainBehaviorCode(value.behavior),value.damping??1,value.margin??0]);
    this.device.queue.writeBuffer(this.domain,0,this.domainData);this.uploadBytes+=this.domainData.byteLength;
  }

  update(deltaSeconds: number, timescale: number): void {
    this.assertUsable();
    this.simulationTime += deltaSeconds * timescale;
    this.prepareCommands();
    this.frameFloats[0] = deltaSeconds * timescale; this.frameUints[1] = this.capacity;
    this.frameFloats[2] = this.viewportWidth; this.frameFloats[3] = this.viewportHeight;
    this.frameUints[4] = this.preparedCommandCount; this.frameUints[5] = 4; this.frameUints[6] = this.attractorCount;
    if (this.preparedCommandCount > 0) { const uploadFloats=this.preparedCommandCount*COMMAND_FLOATS;this.device.queue.writeBuffer(this.commands,0,this.preparedCommandData,0,uploadFloats);this.uploadBytes+=uploadFloats*Float32Array.BYTES_PER_ELEMENT; }
    this.device.queue.writeBuffer(this.frame, 0, this.frameBytes); this.uploadBytes += this.frameData.byteLength;
    const runEvents = this.eventWindows.hasActiveWindow(this.simulationTime) && this.eventCounters !== undefined;
    if (runEvents) { this.device.queue.writeBuffer(this.eventCounters!, 0, this.zeroEventCounters); this.uploadBytes += this.zeroEventCounters.byteLength; }
    const encoder = this.device.createCommandEncoder({ label: 'particle-effect.compute' }), pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bindGroup); pass.dispatchWorkgroups(Math.ceil(this.capacity / 256)); pass.end();
    if (runEvents && this.eventPipeline && this.eventResolvePipeline && this.eventBindGroup && this.eventResolveBindGroup) {
      const append = encoder.beginComputePass();
      append.setPipeline(this.eventPipeline); append.setBindGroup(0, this.eventBindGroup); append.dispatchWorkgroups(Math.ceil(this.capacity / 256)); append.end();
      const resolve = encoder.beginComputePass();
      resolve.setPipeline(this.eventResolvePipeline); resolve.setBindGroup(0, this.eventResolveBindGroup); resolve.dispatchWorkgroups(Math.ceil((this.capacity * 3) / 256)); resolve.end();
      this.eventPasses += 1;
    }
    this.eventWindows.compact(this.simulationTime);
    this.submissions[0]=encoder.finish();this.device.queue.submit(this.submissions);
    this.spawnedParticles += this.particleCount; this.commandCount = 0; this.preparedCommandCount = 0; this.particleCount = 0; this.poolQueued.fill(0); this.simulationPasses += 1;
  }

  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    this.assertUsable(); this.viewportWidth = target.width; this.viewportHeight = target.height;
    this.renderEffect(this.program, [this.stateA, this.stateB, this.stateC], target, tier); this.renderPasses += 1;
  }
  clear(): void {
    this.assertUsable();
    // WebGPU buffers are not initialized by our runtime contract. Explicitly
    // clear all resident state so reset cannot resurrect old particles.
    this.device.queue.writeBuffer(this.stateA, 0, this.zeroState);
    this.device.queue.writeBuffer(this.stateB, 0, this.zeroState);
    this.device.queue.writeBuffer(this.stateC, 0, this.zeroState);
    if (this.eventCounters) this.device.queue.writeBuffer(this.eventCounters, 0, this.zeroEventCounters);
    this.uploadBytes += this.zeroState.byteLength * 3 + (this.eventCounters ? this.zeroEventCounters.byteLength : 0);
    this.commandCount = 0; this.preparedCommandCount = 0; this.particleCount = 0;
    this.spawnedParticles = 0; this.simulationTime = 0; this.eventWindows.clear(); this.poolQueued.fill(0);
    for (let index = 0; index < this.poolCursor.length; index += 1) this.poolCursor[index] = Math.round(this.poolData[index * 4] ?? 0);
  }
  diagnostics(): ParticleEffectBackendDiagnostics2D {
    return Object.freeze({ capacity: this.capacity, activeEstimate: Math.min(this.capacity, this.spawnedParticles), queuedCommands: 0, droppedCommands: this.droppedCommands, spawnedParticles: this.spawnedParticles, droppedParticles: this.droppedParticles, eventCount: this.eventPasses, simulationPasses: this.simulationPasses, renderPasses: this.renderPasses, uploadBytes: this.uploadBytes, contextGeneration: 0, rebuildCount: 0, allocatedBytes: this.capacity * 4 * 4 * 3 + this.commandData.byteLength + this.frameData.byteLength + this.attractorData.byteLength + this.domainData.byteLength + (this.eventQueue ? this.capacity * 3 * 16 + this.zeroEventCounters.byteLength : 0), eventAttempts: 0, eventOccupiedDrops: 0, eventBudgetDrops: 0, diagnosticAccuracy: 'estimated', directCommandsAdmitted: this.admittedCommands, directCommandsTruncated: this.truncatedCommands, commandUploadBytes: this.uploadBytes, allocationsAfterWarmup: 0 });
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stateA.destroy(); this.stateB.destroy(); this.stateC.destroy(); this.commands.destroy(); this.frame.destroy(); this.motion.destroy(); this.sources.destroy(); this.forces.destroy(); this.attractors.destroy(); this.domain.destroy(); this.emitterInitialization.destroy(); this.pools.destroy(); this.eventQueue?.destroy(); this.eventCounters?.destroy(); }
  private prepareCommands(): void {
    const result = planParticleSpawnCommands2D(this.commandData, this.commandCount, this.preparedCommandData, COMMAND_CAPACITY, this.poolData, this.poolCursor);
    this.preparedCommandCount = result.commandCount;
    this.droppedParticles += result.droppedParticles;
    this.truncatedCommands += result.truncatedCommands;
  }
  private assertUsable(): void { if (this.disposed) throw new Error('WebGPU particle effect resource is disposed'); }
}

function spawnShapeCode(shape:string):number{return Math.max(0,['point','disc','line','cone','arc','ring','radial','spiral','pinwheel','shower','annulus','rectangle','path','texture-mask','mesh','particles','collision-contacts','external-points','custom'].indexOf(shape));}
function forceFalloffCode(value:import('@hooksjam/gl-game-lab-engine').ParticleForceFalloff2D|undefined):number{return value===undefined?-1:value==='constant'?0:value==='inverse'?1:2;}
function forceEnvelopeCode(value:import('@hooksjam/gl-game-lab-engine').ParticleForceEnvelope2D|undefined):number{return value===undefined||value==='none'?0:value==='linear'?1:2;}
function domainBehaviorCode(value:import('@hooksjam/gl-game-lab-engine').ParticleDomainBehavior2D):number{return value==='none'?0:value==='kill'?1:value==='bounce'?2:3;}
