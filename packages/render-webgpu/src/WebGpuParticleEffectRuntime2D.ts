import type { CompiledParticleProgram2D, GpuRenderTarget2D, ParticleColliderSet2D, ParticleDomain2D, ParticleEmitterSourceOverride2D, ParticleViewport2D, ParticleRenderParameters2D, ParticleEffectBackendDiagnostics2D, ParticleEffectBackendResource2D, ParticleEffectRuntimeBackend2D, ParticleForceFieldSet2D, ParticlePalette2D, ParticleRenderTier2D, ParticleRuntimeEmission2D, ParticleParameterValue2D, ParticleEventParameters2D } from "@hooksjam/gl-game-lab-engine";
import { ParticleEventWindowScheduler2D, planParticleSpawnCommands2D, resolveParticleArchetypePartitions2D } from "@hooksjam/gl-game-lab-engine";

const COMMAND_CAPACITY = 64;
const COMMAND_FLOATS = 16;
const MAX_PALETTE = 16;
const MAX_COLLIDERS = 16;
const STORAGE_COPY_USAGE = 0x80 | 0x08;
const UNIFORM_COPY_USAGE = 0x40 | 0x08;
const INDIRECT_COPY_USAGE = 0x100 | 0x08;

export interface ParticleWebGpuBuffer2D {
  destroy(): void;
}
export interface ParticleWebGpuShaderModule2D {}
export interface ParticleWebGpuBindGroup2D {}
export interface ParticleWebGpuTextureView2D {}
export interface ParticleWebGpuTexture2D {
  createView(): ParticleWebGpuTextureView2D;
  destroy(): void;
}
export interface ParticleWebGpuSampler2D {}
export interface ParticleWebGpuComputePipeline2D {
  getBindGroupLayout(index: number): unknown;
}
export interface ParticleWebGpuRenderPipeline2D {
  getBindGroupLayout(index: number): unknown;
}
export interface ParticleWebGpuComputePass2D {
  setPipeline(pipeline: ParticleWebGpuComputePipeline2D): void;
  setBindGroup(index: number, bindGroup: ParticleWebGpuBindGroup2D): void;
  dispatchWorkgroups(count: number): void;
  end(): void;
}
export interface ParticleWebGpuCommandEncoder2D {
  beginComputePass(options?: Readonly<Record<string, unknown>>): ParticleWebGpuComputePass2D;
  beginRenderPass(options: ParticleWebGpuRenderPassDescriptor2D): ParticleWebGpuRenderPass2D;
  finish(): unknown;
}
export interface ParticleWebGpuRenderPass2D {
  setPipeline(pipeline: ParticleWebGpuRenderPipeline2D): void;
  setBindGroup(index: number, bindGroup: ParticleWebGpuBindGroup2D): void;
  draw(vertexCount: number, instanceCount?: number): void;
  drawIndirect(indirectBuffer: ParticleWebGpuBuffer2D, indirectOffset: number): void;
  end(): void;
}
export interface ParticleWebGpuRenderPassDescriptor2D {
  readonly colorAttachments: readonly [{
    readonly view: ParticleWebGpuTextureView2D;
    readonly clearValue?: Readonly<{ r: number; g: number; b: number; a: number }>;
    readonly loadOp: 'clear' | 'load';
    readonly storeOp: 'store';
  }];
}
export interface ParticleWebGpuDevice2D {
  readonly queue: {
    writeBuffer(buffer: ParticleWebGpuBuffer2D, offset: number, data: ArrayBufferView, dataOffset?: number, size?: number): void;
    submit(commands: readonly unknown[]): void;
  };
  createBuffer(options: { readonly label?: string; readonly size: number; readonly usage: number }): ParticleWebGpuBuffer2D;
  createShaderModule(options: { readonly label?: string; readonly code: string }): ParticleWebGpuShaderModule2D;
  createComputePipeline(options: {
    readonly label?: string;
    readonly layout: "auto";
    readonly compute: {
      readonly module: ParticleWebGpuShaderModule2D;
      readonly entryPoint: string;
    };
  }): ParticleWebGpuComputePipeline2D;
  createRenderPipeline(options: Readonly<Record<string, unknown>>): ParticleWebGpuRenderPipeline2D;
  createTexture(options: {
    readonly label?: string;
    readonly size: readonly [number, number, number];
    readonly format: string;
    readonly usage: number;
  }): ParticleWebGpuTexture2D;
  createSampler(options?: Readonly<Record<string, unknown>>): ParticleWebGpuSampler2D;
  createBindGroup(options: {
    readonly label?: string;
    readonly layout: unknown;
    readonly entries: readonly {
      readonly binding: number;
      readonly resource: { readonly buffer: ParticleWebGpuBuffer2D } | ParticleWebGpuSampler2D | ParticleWebGpuTextureView2D;
    }[];
  }): ParticleWebGpuBindGroup2D;
  createCommandEncoder(options?: { readonly label?: string }): ParticleWebGpuCommandEncoder2D;
}

export interface WebGpuParticleEffectRenderBindings2D {
  readonly state: readonly [ParticleWebGpuBuffer2D, ParticleWebGpuBuffer2D, ParticleWebGpuBuffer2D];
  readonly archetypeSize: ParticleWebGpuBuffer2D;
  readonly archetypeLength: ParticleWebGpuBuffer2D;
  readonly archetypeAlpha: ParticleWebGpuBuffer2D;
  readonly archetypeIntensity: ParticleWebGpuBuffer2D;
  readonly palette: ParticleWebGpuBuffer2D;
  readonly renderConfig: ParticleWebGpuBuffer2D;
  readonly indirectDraw: ParticleWebGpuBuffer2D;
  readonly paletteCount: number;
  readonly capacity: number;
}

export type WebGpuParticleEffectRender2D = (program: CompiledParticleProgram2D, state: readonly [ParticleWebGpuBuffer2D, ParticleWebGpuBuffer2D, ParticleWebGpuBuffer2D], target: GpuRenderTarget2D, tier: ParticleRenderTier2D, bindings: WebGpuParticleEffectRenderBindings2D) => void;

export interface WebGpuParticleEffectRuntimeOptions2D {
  readonly render: WebGpuParticleEffectRender2D;
}

export class WebGpuParticleEffectRuntimeBackend2D implements ParticleEffectRuntimeBackend2D {
  readonly kind = "webgpu";
  private serial = 0;
  private failure: Error | undefined;
  constructor(
    private readonly device: ParticleWebGpuDevice2D,
    private readonly options: WebGpuParticleEffectRuntimeOptions2D,
  ) {}
  create(program: CompiledParticleProgram2D, capacity: number): ParticleEffectBackendResource2D {
    if (this.failure) throw this.failure;
    return new WebGpuParticleEffectResource2D(this.device, `particle-effect.${program.effect.source.id}.${this.serial++}`, program, capacity, this.options.render, () => this.failure);
  }
  /** Invalidates every resource so the engine's recovery wrapper switches to WebGL2 on its next operation. */
  invalidate(reason: unknown): void {
    if (this.failure) return;
    this.failure = reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "WebGPU particle backend failed");
  }
}

class WebGpuParticleEffectResource2D implements ParticleEffectBackendResource2D {
  private readonly stateA: ParticleWebGpuBuffer2D;
  private readonly stateB: ParticleWebGpuBuffer2D;
  private readonly stateC: ParticleWebGpuBuffer2D;
  private readonly commands: ParticleWebGpuBuffer2D;
  private readonly frame: ParticleWebGpuBuffer2D;
  private readonly indirectDraw: ParticleWebGpuBuffer2D;
  private readonly motion: ParticleWebGpuBuffer2D;
  private readonly motionData: Float32Array;
  private readonly sources: ParticleWebGpuBuffer2D;
  private readonly forces: ParticleWebGpuBuffer2D;
  private readonly forceData: Float32Array;
  private readonly collisionProfiles: ParticleWebGpuBuffer2D;
  private readonly collisionProfileData: Float32Array;
  private readonly colliderCounts: ParticleWebGpuBuffer2D;
  private readonly colliderCountData = new Float32Array(4);
  private readonly circles: ParticleWebGpuBuffer2D;
  private readonly circleData = new Float32Array(MAX_COLLIDERS * 4);
  private readonly capsuleA: ParticleWebGpuBuffer2D;
  private readonly capsuleAData = new Float32Array(MAX_COLLIDERS * 4);
  private readonly capsuleB: ParticleWebGpuBuffer2D;
  private readonly capsuleBData = new Float32Array(MAX_COLLIDERS * 4);
  private readonly archetypeSize: ParticleWebGpuBuffer2D;
  private readonly archetypeLength: ParticleWebGpuBuffer2D;
  private readonly archetypeAlpha: ParticleWebGpuBuffer2D;
  private readonly archetypeIntensity: ParticleWebGpuBuffer2D;
  private readonly palette: ParticleWebGpuBuffer2D;
  private readonly renderConfig: ParticleWebGpuBuffer2D;
  private readonly sizeData: Float32Array;
  private readonly lengthData: Float32Array;
  private readonly alphaData: Float32Array;
  private readonly intensityData: Float32Array;
  private readonly paletteData = new Float32Array(MAX_PALETTE * 4);
  private readonly renderConfigData = new Float32Array(12);
  private readonly attractors: ParticleWebGpuBuffer2D;
  private readonly domain: ParticleWebGpuBuffer2D;
  private readonly emitterInitialization: ParticleWebGpuBuffer2D;
  private readonly pools: ParticleWebGpuBuffer2D;
  private readonly eventQueue: ParticleWebGpuBuffer2D | undefined;
  private readonly eventCounters: ParticleWebGpuBuffer2D | undefined;
  private readonly eventParameters: ParticleWebGpuBuffer2D | undefined;
  private readonly eventParameterData: Float32Array;
  private readonly eventLookup = new Map<string, number>();
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
  private readonly archetypeActiveEstimate: Float64Array;
  private readonly eventAttemptsByTrigger: Record<import("@hooksjam/gl-game-lab-engine").ParticleEventTrigger2D, number> = { birth: 0, age: 0, death: 0, collision: 0 };
  private readonly eventAttemptsByPriority: Record<"primary" | "secondary" | "cosmetic", number> = { primary: 0, secondary: 0, cosmetic: 0 };
  private readonly frameData = new ArrayBuffer(32);
  private readonly indirectDrawData: Uint32Array;
  private readonly frameFloats = new Float32Array(this.frameData);
  private readonly frameUints = new Uint32Array(this.frameData);
  private readonly frameBytes = new Uint8Array(this.frameData);
  private readonly zeroEventCounters: Uint32Array;
  private readonly attractorData = new Float32Array(16 * 12);
  private readonly sourceData: Float32Array;
  private readonly domainData = new Float32Array([0, 0, 1, 1, 0, 0, 1, 0]);
  private attractorCount = 0;
  private forceFieldRevision = -1;
  private colliderRevision = -1;
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
  private eventAttempts = 0;
  private uploadBytes = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private viewportDpr = 1;
  private viewportConfigured = false;
  private paletteCount = 1;
  private renderConfigDirty = true;
  private simulationTime = 0;
  private disposed = false;

  constructor(
    private readonly device: ParticleWebGpuDevice2D,
    id: string,
    private readonly program: CompiledParticleProgram2D,
    private readonly capacity: number,
    private readonly renderEffect: WebGpuParticleEffectRender2D,
    private readonly backendFailure: () => Error | undefined,
  ) {
    const stateBytes = capacity * 4 * Float32Array.BYTES_PER_ELEMENT;
    this.zeroState = new Float32Array(capacity * 4);
    this.stateA = device.createBuffer({
      label: `${id}.state-a`,
      size: stateBytes,
      usage: STORAGE_COPY_USAGE,
    });
    this.stateB = device.createBuffer({
      label: `${id}.state-b`,
      size: stateBytes,
      usage: STORAGE_COPY_USAGE,
    });
    this.stateC = device.createBuffer({
      label: `${id}.state-c`,
      size: stateBytes,
      usage: STORAGE_COPY_USAGE,
    });
    this.commands = device.createBuffer({
      label: `${id}.commands`,
      size: this.commandData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    this.frame = device.createBuffer({
      label: `${id}.frame`,
      size: this.frameData.byteLength,
      usage: UNIFORM_COPY_USAGE,
    });
    this.indirectDrawData = new Uint32Array([6, capacity, 0, 0]);
    this.indirectDraw = device.createBuffer({
      label: `${id}.indirect-draw`,
      size: this.indirectDrawData.byteLength,
      usage: INDIRECT_COPY_USAGE,
    });
    device.queue.writeBuffer(this.indirectDraw, 0, this.indirectDrawData);
    const motionData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.motionData = motionData;
    program.effect.source.archetypes.forEach((archetype, index) => {
      motionData[index * 4] = archetype.motion.gravity;
      motionData[index * 4 + 1] = archetype.motion.drag;
      motionData[index * 4 + 2] = archetype.motion.turbulence ?? 0;
      motionData[index * 4 + 3] = archetype.motion.angularVelocity ?? 0;
    });
    this.motion = device.createBuffer({
      label: `${id}.motion`,
      size: motionData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.motion, 0, motionData);
    const forceData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.forceData = forceData;
    program.effect.source.archetypes.forEach((archetype, index) => {
      forceData[index * 4] = archetype.motion.radialAcceleration ?? 0;
      forceData[index * 4 + 1] = archetype.motion.tangentialAcceleration ?? 0;
      forceData[index * 4 + 2] = archetype.motion.radialFalloff === "inverse-square" ? 2 : archetype.motion.radialFalloff === "inverse" ? 1 : 0;
      forceData[index * 4 + 3] = archetype.motion.maxSpeed ?? 0;
    });
    this.forces = device.createBuffer({
      label: `${id}.forces`,
      size: forceData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.forces, 0, forceData);
    this.collisionProfileData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    program.effect.source.archetypes.forEach((archetype, index) => {
      const collision = archetype.collision,
        flags = (collision?.bounds ? 1 : 0) + (collision?.circles ? 2 : 0) + (collision?.capsules ? 4 : 0);
      this.collisionProfileData.set([collision?.restitution ?? 0, collision?.friction ?? 0, collision?.lifetimeLoss ?? 0, flags], index * 4);
    });
    this.collisionProfiles = createStorageBuffer(device, `${id}.collision-profiles`, this.collisionProfileData);
    this.colliderCounts = createStorageBuffer(device, `${id}.collider-counts`, this.colliderCountData);
    this.circles = createStorageBuffer(device, `${id}.circle-colliders`, this.circleData);
    this.capsuleA = createStorageBuffer(device, `${id}.capsule-colliders-a`, this.capsuleAData);
    this.capsuleB = createStorageBuffer(device, `${id}.capsule-colliders-b`, this.capsuleBData);
    this.sizeData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.lengthData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.alphaData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.intensityData = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    program.effect.source.archetypes.forEach((archetype, index) => {
      writeCurve(this.sizeData, index, archetype.appearance.size, archetype.appearance.variability ?? 0);
      writeCurve(this.lengthData, index, archetype.appearance.length ?? { start: 0.02, end: 0 }, archetype.appearance.variability ?? 0);
      writeCurve(this.alphaData, index, archetype.appearance.alpha);
      writeCurve(this.intensityData, index, archetype.appearance.intensity);
    });
    this.archetypeSize = createStorageBuffer(device, `${id}.appearance-size`, this.sizeData);
    this.archetypeLength = createStorageBuffer(device, `${id}.appearance-length`, this.lengthData);
    this.archetypeAlpha = createStorageBuffer(device, `${id}.appearance-alpha`, this.alphaData);
    this.archetypeIntensity = createStorageBuffer(device, `${id}.appearance-intensity`, this.intensityData);
    this.paletteData.set([1, 1, 1, 1]);
    this.palette = createStorageBuffer(device, `${id}.palette`, this.paletteData);
    this.renderConfigData.set([1, 1, 2, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
    this.renderConfig = createStorageBuffer(device, `${id}.render-config`, this.renderConfigData);
    this.attractors = device.createBuffer({
      label: `${id}.attractors`,
      size: this.attractorData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.attractors, 0, this.attractorData);
    this.domain = device.createBuffer({
      label: `${id}.domain`,
      size: this.domainData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.domain, 0, this.domainData);
    const sourceData = new Float32Array(Math.max(1, program.effect.source.emitters.length) * 4);
    this.sourceData = sourceData;
    const emitterInitializationData = new Float32Array(Math.max(1, program.effect.source.emitters.length) * 4);
    program.effect.source.emitters.forEach((emitter, index) => {
      const source = emitter.source,
        initialization = emitter.initialization,
        mode = initialization?.directionMode;
      sourceData[index * 4] = "radius" in source ? (source.radius ?? 0) : "width" in source ? source.width * 0.5 : 0;
      sourceData[index * 4 + 1] = "innerRadius" in source ? (source.innerRadius ?? ("length" in source ? (source.length ?? 0) : 0)) : "length" in source ? (source.length ?? 0) : "height" in source ? source.height * 0.5 : 0;
      sourceData[index * 4 + 2] = "arc" in source ? (source.arc ?? Math.PI * 2) : Math.PI * 2;
      sourceData[index * 4 + 3] = "spread" in source ? (source.spread ?? 0) : 0;
      emitterInitializationData.set([mode === "radial" ? 1 : mode === "tangent-ccw" ? 2 : mode === "tangent-cw" ? 3 : 0, initialization?.radialPowerExponent ?? 0, "radius" in source ? (source.radius ?? 1) : 1, initialization?.powerVariability ?? 0.28], index * 4);
    });
    this.sources = device.createBuffer({
      label: `${id}.sources`,
      size: sourceData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.sources, 0, sourceData);
    this.emitterInitialization = device.createBuffer({
      label: `${id}.emitter-initialization`,
      size: emitterInitializationData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.emitterInitialization, 0, emitterInitializationData);
    const partitions = resolveParticleArchetypePartitions2D(program.effect, capacity);
    const poolData = new Float32Array(Math.max(1, partitions.length) * 4);
    this.poolData = poolData;
    this.poolCursor = new Int32Array(Math.max(1, partitions.length));
    this.poolQueued = new Int32Array(Math.max(1, partitions.length));
    this.archetypeActiveEstimate = new Float64Array(Math.max(1, partitions.length));
    for (const partition of partitions) {
      const offset = partition.archetypeIndex * 4;
      poolData[offset] = partition.start;
      poolData[offset + 1] = partition.count;
      poolData[offset + 2] = partition.overflow === "drop-new" ? 1 : partition.overflow === "reserve-priority" ? 2 : 0;
      this.poolCursor[partition.archetypeIndex] = partition.start;
    }
    this.pools = device.createBuffer({
      label: `${id}.pools`,
      size: poolData.byteLength,
      usage: STORAGE_COPY_USAGE,
    });
    device.queue.writeBuffer(this.pools, 0, poolData);
    this.zeroEventCounters = new Uint32Array(3 + program.effect.source.archetypes.length);
    const eventCount = program.effect.source.archetypes.reduce((count, archetype) => count + (archetype.events?.length ?? 0), 0);
    this.eventParameterData = new Float32Array(Math.max(1, eventCount) * 16);
    let globalEventIndex = 0;
    program.effect.source.archetypes.forEach((archetype, archetypeIndex) => archetype.events?.forEach((event, eventIndex) => {
      const childIndex = program.effect.archetypeIds[event.childArchetypeId]!, child = program.effect.source.archetypes[childIndex]!, offset = globalEventIndex * 16;
      this.eventLookup.set(`${archetypeIndex}:${eventIndex}`, globalEventIndex);
      this.eventParameterData.set([event.probability, event.count, event.maxGeneration, event.delay ?? 0], offset);
      this.eventParameterData.set([child.lifecycle.lifetime, event.velocityInheritance ?? 0, event.powerScale ?? 0.35, event.spread ?? Math.PI * 2], offset + 4);
      this.eventParameterData.set([0, 0, 1, 24], offset + 8);
      this.eventParameterData.set([child.lifecycle.lifetimeVariability ?? 0, 0.28, 0, 0], offset + 12);
      globalEventIndex += 1;
    }));
    this.eventWindows = new ParticleEventWindowScheduler2D(program);
    const module = device.createShaderModule({
      label: `${id}.compute`,
      code: program.webgpu.simulation.source,
    });
    this.pipeline = device.createComputePipeline({
      label: `${id}.pipeline`,
      layout: "auto",
      compute: { module, entryPoint: program.webgpu.simulation.entryPoint },
    });
    this.bindGroup = device.createBindGroup({
      label: `${id}.bindings`,
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [this.stateA, this.stateB, this.stateC, this.frame, this.commands, this.motion, this.sources, this.forces, this.attractors, this.domain, this.emitterInitialization, this.collisionProfiles, this.colliderCounts, this.circles, this.capsuleA, this.capsuleB].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    if (program.webgpu.event && program.webgpu.eventResolve) {
      this.eventParameters = createStorageBuffer(device, `${id}.event-parameters`, this.eventParameterData);
      this.eventQueue = device.createBuffer({
        label: `${id}.event-queue`,
        size: capacity * 3 * 16,
        usage: STORAGE_COPY_USAGE,
      });
      this.eventCounters = device.createBuffer({
        label: `${id}.event-counters`,
        size: this.zeroEventCounters.byteLength,
        usage: STORAGE_COPY_USAGE,
      });
      const eventModule = device.createShaderModule({
        label: `${id}.event-append`,
        code: program.webgpu.event.source,
      });
      const resolveModule = device.createShaderModule({
        label: `${id}.event-resolve`,
        code: program.webgpu.eventResolve.source,
      });
      this.eventPipeline = device.createComputePipeline({
        label: `${id}.event-append-pipeline`,
        layout: "auto",
        compute: {
          module: eventModule,
          entryPoint: program.webgpu.event.entryPoint,
        },
      });
      this.eventResolvePipeline = device.createComputePipeline({
        label: `${id}.event-resolve-pipeline`,
        layout: "auto",
        compute: {
          module: resolveModule,
          entryPoint: program.webgpu.eventResolve.entryPoint,
        },
      });
      const entries = [this.stateA, this.stateB, this.stateC, this.frame, this.pools, this.eventQueue, this.eventCounters, this.eventParameters].map((buffer, binding) => ({ binding, resource: { buffer } }));
      this.eventBindGroup = device.createBindGroup({
        label: `${id}.event-bindings`,
        layout: this.eventPipeline.getBindGroupLayout(0),
        entries,
      });
      this.eventResolveBindGroup = device.createBindGroup({
        label: `${id}.event-resolve-bindings`,
        layout: this.eventResolvePipeline.getBindGroupLayout(0),
        entries,
      });
    } else {
      this.eventQueue = undefined;
      this.eventCounters = undefined;
      this.eventParameters = undefined;
      this.eventPipeline = undefined;
      this.eventResolvePipeline = undefined;
      this.eventBindGroup = undefined;
      this.eventResolveBindGroup = undefined;
    }
  }

  emit(emission: ParticleRuntimeEmission2D): void {
    this.assertUsable();
    if (this.commandCount >= COMMAND_CAPACITY) {
      this.droppedCommands += 1;
      this.droppedParticles += emission.count;
      return;
    }
    const emitter = this.program.effect.source.emitters[emission.emitterIndex];
    if (!emitter) throw new Error(`WebGPU emission references invalid emitter ${emission.emitterIndex}`);
    const archetypeId = this.program.effect.archetypeIds[emitter.archetypeId];
    const archetype = this.program.effect.source.archetypes[archetypeId ?? -1];
    if (archetypeId === undefined || !archetype) throw new Error(`WebGPU emitter references invalid archetype ${emitter.archetypeId}`);
    const poolCapacity = Math.max(0, Math.round(this.poolData[archetypeId * 4 + 1] ?? 0));
    const count = Math.min(Math.max(0, poolCapacity - this.poolQueued[archetypeId]!), emission.count),
      offset = this.commandCount * COMMAND_FLOATS;
    if (count <= 0) {
      this.droppedCommands += 1;
      this.droppedParticles += emission.count;
      return;
    }
    this.commandData[offset] = archetypeId;
    this.commandData[offset + 1] = 0;
    this.commandData[offset + 2] = count;
    this.commandData[offset + 3] = spawnShapeCode(emitter.source.kind) + 32 * Math.round(this.poolData[archetypeId * 4 + 2] ?? 0);
    this.commandData[offset + 4] = emission.positionX;
    this.commandData[offset + 5] = emission.positionY;
    this.commandData[offset + 6] = emission.inheritedVelocityX ?? 0;
    this.commandData[offset + 7] = emission.inheritedVelocityY ?? 0;
    this.commandData[offset + 8] = emission.direction;
    this.commandData[offset + 9] = emission.spread || archetype.spawn.spread;
    this.commandData[offset + 10] = emission.power;
    this.commandData[offset + 11] = emission.lifetime ?? archetype.lifecycle.lifetime;
    this.commandData[offset + 12] = emission.seed;
    this.commandData[offset + 13] = 0;
    this.commandData[offset + 14] = emission.lifetimeVariability ?? archetype.lifecycle.lifetimeVariability ?? 0;
    this.commandData[offset + 15] = emission.emitterIndex;
    this.commandCount += 1;
    this.particleCount += count;
    this.droppedParticles += emission.count - count;
    this.poolQueued[archetypeId] = this.poolQueued[archetypeId]! + count;
    this.archetypeActiveEstimate[archetypeId] = Math.min(poolCapacity, this.archetypeActiveEstimate[archetypeId]! + count);
    for (const event of archetype.events ?? []) {
      this.eventAttempts += count;
      this.eventAttemptsByTrigger[event.trigger] += count;
      this.eventAttemptsByPriority[event.priority ?? "cosmetic"] += count;
    }
    this.admittedCommands += 1;
    if (count < emission.count) this.truncatedCommands += 1;
    if ((archetype.events?.length ?? 0) > 0) this.eventWindows.schedule(archetypeId, this.simulationTime);
  }

  setPalette(value: ParticlePalette2D): void {
    this.assertUsable();
    this.paletteData.fill(0);
    this.paletteCount = Math.max(1, Math.min(MAX_PALETTE, value.colors.length));
    for (let index = 0; index < this.paletteCount; index += 1) {
      const color = value.colors[index] ?? [1, 1, 1];
      this.paletteData.set([color[0], color[1], color[2], 1], index * 4);
    }
    this.device.queue.writeBuffer(this.palette, 0, this.paletteData, 0, this.paletteCount * 4);
    this.uploadBytes += this.paletteCount * 4 * Float32Array.BYTES_PER_ELEMENT;
    this.renderConfigDirty = true;
  }

  setParameters(parameters: Readonly<Record<string, ParticleParameterValue2D>>): void {
    this.assertUsable();
    for (const binding of this.program.effect.source.moduleBindings ?? []) {
      const raw = parameters[binding.parameterId];
      if (typeof raw !== "number") continue;
      const value = raw * (binding.scale ?? 1) + (binding.offset ?? 0),
        parts = binding.target.split("."),
        archetypeIndex = this.program.effect.archetypeIds[parts[1] ?? ""];
      if (archetypeIndex === undefined) continue;
      const section = parts[2], field = parts.slice(3).join(".");
      if (section === "motion") {
        const target = writeBoundMotion(this.motionData, this.forceData, archetypeIndex, field, value);
        if (target === "motion") this.uploadArchetypeVector(this.motion, this.motionData, archetypeIndex);
        else if (target === "force") this.uploadArchetypeVector(this.forces, this.forceData, archetypeIndex);
      } else if (section === "collision") {
        if (writeBoundCollision(this.collisionProfileData, archetypeIndex, field, value)) this.uploadArchetypeVector(this.collisionProfiles, this.collisionProfileData, archetypeIndex);
      } else if (section === "appearance") {
        const target = writeBoundAppearance(this.sizeData, this.lengthData, this.alphaData, this.intensityData, archetypeIndex, field, value);
        if (target) this.uploadArchetypeVector(target.buffer === "size" ? this.archetypeSize : target.buffer === "length" ? this.archetypeLength : target.buffer === "alpha" ? this.archetypeAlpha : this.archetypeIntensity, target.data, archetypeIndex);
      }
    }
  }

  setColliders(value: ParticleColliderSet2D): void {
    this.assertUsable();
    if (value.revision === this.colliderRevision) return;
    this.colliderRevision = value.revision;
    this.circleData.fill(0);
    this.capsuleAData.fill(0);
    this.capsuleBData.fill(0);
    const circleCount = Math.min(MAX_COLLIDERS, value.circles?.length ?? 0),
      capsuleCount = Math.min(MAX_COLLIDERS, value.capsules?.length ?? 0);
    this.colliderCountData.set([circleCount, capsuleCount, 0, 0]);
    for (let index = 0; index < circleCount; index += 1) {
      const circle = value.circles![index]!;
      this.circleData.set([circle.x, circle.y, circle.radius, circle.mode === "kill" ? 1 : 0], index * 4);
    }
    for (let index = 0; index < capsuleCount; index += 1) {
      const capsule = value.capsules![index]!;
      this.capsuleAData.set([capsule.ax, capsule.ay, capsule.bx, capsule.by], index * 4);
      this.capsuleBData.set([capsule.radius, capsule.mode === "kill" ? 1 : 0, 0, 0], index * 4);
    }
    this.device.queue.writeBuffer(this.colliderCounts, 0, this.colliderCountData);
    this.device.queue.writeBuffer(this.circles, 0, this.circleData);
    this.device.queue.writeBuffer(this.capsuleA, 0, this.capsuleAData);
    this.device.queue.writeBuffer(this.capsuleB, 0, this.capsuleBData);
    this.uploadBytes += this.colliderCountData.byteLength + this.circleData.byteLength + this.capsuleAData.byteLength + this.capsuleBData.byteLength;
  }

  setForceFields(value: ParticleForceFieldSet2D): void {
    this.assertUsable();
    if (value.revision === this.forceFieldRevision) return;
    this.forceFieldRevision = value.revision;
    this.attractorData.fill(0);
    this.attractorCount = Math.min(16, value.attractors.length);
    for (let index = 0; index < this.attractorCount; index += 1) {
      const field = value.attractors[index]!,
        offset = index * 12;
      this.attractorData.set([field.x, field.y, field.strength, field.radius ?? 0, field.softening ?? 1, forceFalloffCode(field.falloff), field.tangentialStrength ?? 0, forceEnvelopeCode(field.envelope), field.velocity?.[0] ?? 0, field.velocity?.[1] ?? 0, field.velocityCoupling ?? 0, field.radialStrength ?? 0], offset);
    }
    this.device.queue.writeBuffer(this.attractors, 0, this.attractorData);
    this.uploadBytes += this.attractorData.byteLength;
  }

  setDomain(value: ParticleDomain2D): void {
    this.assertUsable();
    const extents = value.halfExtents ?? [0, 0];
    this.domainData.set([value.center[0], value.center[1], value.shape === "circle" ? (value.radius ?? 0) : extents[0], value.shape === "circle" ? 0 : extents[1], value.shape === "circle" ? 1 : 0, domainBehaviorCode(value.behavior), value.damping ?? 1, value.margin ?? 0]);
    this.device.queue.writeBuffer(this.domain, 0, this.domainData);
    this.uploadBytes += this.domainData.byteLength;
  }

  setEmitterSource(emitterIndex: number, value: ParticleEmitterSourceOverride2D): void {
    this.assertUsable();
    const offset = emitterIndex * 4;
    if (offset < 0 || offset + 3 >= this.sourceData.length) throw new Error(`Invalid particle emitter source index: ${emitterIndex}`);
    if (value.radius !== undefined) this.sourceData[offset] = value.radius;
    if (value.innerRadius !== undefined) this.sourceData[offset + 1] = value.innerRadius;
    else if (value.length !== undefined) this.sourceData[offset + 1] = value.length;
    if (value.arc !== undefined) this.sourceData[offset + 2] = value.arc;
    if (value.spread !== undefined) this.sourceData[offset + 3] = value.spread;
    this.device.queue.writeBuffer(this.sources, offset * Float32Array.BYTES_PER_ELEMENT, this.sourceData, offset, 4);
    this.uploadBytes += 16;
  }
  setEventParameters(archetypeIndex: number, eventIndex: number, value: ParticleEventParameters2D): void {
    this.assertUsable();
    if (!this.eventParameters) throw new Error("WebGPU particle effect has no event parameter buffer");
    const globalIndex = this.eventLookup.get(`${archetypeIndex}:${eventIndex}`);
    if (globalIndex === undefined) throw new Error(`Unknown compiled particle event: ${archetypeIndex}[${eventIndex}]`);
    const offset = globalIndex * 16;
    if (value.probability !== undefined) this.eventParameterData[offset] = value.probability;
    if (value.count !== undefined) this.eventParameterData[offset + 1] = value.count;
    if (value.maxGeneration !== undefined) this.eventParameterData[offset + 2] = value.maxGeneration;
    if (value.delay !== undefined) this.eventParameterData[offset + 3] = value.delay;
    if (value.lifetime !== undefined) this.eventParameterData[offset + 4] = value.lifetime;
    if (value.velocityInheritance !== undefined) this.eventParameterData[offset + 5] = value.velocityInheritance;
    if (value.powerScale !== undefined) this.eventParameterData[offset + 6] = value.powerScale;
    if (value.spread !== undefined) this.eventParameterData[offset + 7] = value.spread;
    if (value.minimumSpeed !== undefined) this.eventParameterData[offset + 8] = value.minimumSpeed;
    if (value.countSpeedScale !== undefined) this.eventParameterData[offset + 9] = value.countSpeedScale;
    if (value.speedReference !== undefined) this.eventParameterData[offset + 10] = value.speedReference;
    if (value.basePower !== undefined) this.eventParameterData[offset + 11] = value.basePower;
    if (value.lifetimeVariability !== undefined) this.eventParameterData[offset + 12] = value.lifetimeVariability;
    if (value.powerVariability !== undefined) this.eventParameterData[offset + 13] = value.powerVariability;
    this.device.queue.writeBuffer(this.eventParameters, offset * Float32Array.BYTES_PER_ELEMENT, this.eventParameterData, offset, 16);
    this.uploadBytes += 16 * Float32Array.BYTES_PER_ELEMENT;
  }
  setViewport(value: ParticleViewport2D): void {
    this.assertUsable();
    this.viewportWidth = value.width;
    this.viewportHeight = value.height;
    this.viewportDpr = value.dpr;
    this.viewportConfigured = true;
    this.renderConfigDirty = true;
  }
  setRenderParameters(value: ParticleRenderParameters2D): void {
    this.assertUsable();
    if (value.pointScale !== undefined) this.renderConfigData[2] = value.pointScale;
    if (value.intensity !== undefined) this.renderConfigData[4] = value.intensity;
    if (value.paletteTransition !== undefined) this.renderConfigData[7] = value.paletteTransition;
    if (value.streakScale !== undefined) this.renderConfigData[8] = value.streakScale;
    if (value.colorMode !== undefined) this.renderConfigData[6] = colorModeCode(value.colorMode);
    if (value.trailFade !== undefined) this.renderConfigData[10] = value.trailFade;
    if (value.trailBloom !== undefined) this.renderConfigData[11] = value.trailBloom;
    this.renderConfigDirty = true;
  }

  update(deltaSeconds: number, timescale: number): void {
    this.assertUsable();
    this.simulationTime += deltaSeconds * timescale;
    this.prepareCommands();
    this.frameFloats[0] = deltaSeconds * timescale;
    this.frameUints[1] = this.capacity;
    this.frameFloats[2] = this.viewportWidth;
    this.frameFloats[3] = this.viewportHeight;
    this.frameUints[4] = this.preparedCommandCount;
    this.frameUints[5] = 4;
    this.frameUints[6] = this.attractorCount;
    if (this.preparedCommandCount > 0) {
      const uploadFloats = this.preparedCommandCount * COMMAND_FLOATS;
      this.device.queue.writeBuffer(this.commands, 0, this.preparedCommandData, 0, uploadFloats);
      this.uploadBytes += uploadFloats * Float32Array.BYTES_PER_ELEMENT;
    }
    this.device.queue.writeBuffer(this.frame, 0, this.frameBytes);
    this.uploadBytes += this.frameData.byteLength;
    const runEvents = this.eventWindows.hasActiveWindow(this.simulationTime) && this.eventCounters !== undefined;
    if (runEvents) {
      this.device.queue.writeBuffer(this.eventCounters!, 0, this.zeroEventCounters);
      this.uploadBytes += this.zeroEventCounters.byteLength;
    }
    const encoder = this.device.createCommandEncoder({
        label: "particle-effect.compute",
      }),
      pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.capacity / 256));
    pass.end();
    if (runEvents && this.eventPipeline && this.eventResolvePipeline && this.eventBindGroup && this.eventResolveBindGroup) {
      const append = encoder.beginComputePass();
      append.setPipeline(this.eventPipeline);
      append.setBindGroup(0, this.eventBindGroup);
      append.dispatchWorkgroups(Math.ceil(this.capacity / 256));
      append.end();
      const resolve = encoder.beginComputePass();
      resolve.setPipeline(this.eventResolvePipeline);
      resolve.setBindGroup(0, this.eventResolveBindGroup);
      resolve.dispatchWorkgroups(Math.ceil((this.capacity * 3) / 256));
      resolve.end();
      this.eventPasses += 1;
    }
    this.eventWindows.compact(this.simulationTime);
    this.submissions[0] = encoder.finish();
    this.device.queue.submit(this.submissions);
    this.spawnedParticles += this.particleCount;
    this.commandCount = 0;
    this.preparedCommandCount = 0;
    this.particleCount = 0;
    this.poolQueued.fill(0);
    this.simulationPasses += 1;
  }

  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    this.assertUsable();
    if (!this.viewportConfigured) {
      this.viewportWidth = target.width;
      this.viewportHeight = target.height;
      this.viewportDpr = 1;
      this.renderConfigDirty = true;
    }
    this.renderConfigData[0] = this.viewportWidth;
    this.renderConfigData[1] = this.viewportHeight;
    this.renderConfigData[5] = this.paletteCount;
    this.renderConfigData[9] = this.viewportDpr;
    if (this.renderConfigDirty) {
      this.device.queue.writeBuffer(this.renderConfig, 0, this.renderConfigData);
      this.uploadBytes += this.renderConfigData.byteLength;
      this.renderConfigDirty = false;
    }
    const state = [this.stateA, this.stateB, this.stateC] as const;
    this.renderEffect(this.program, state, target, tier, {
      state,
      archetypeSize: this.archetypeSize,
      archetypeLength: this.archetypeLength,
      archetypeAlpha: this.archetypeAlpha,
      archetypeIntensity: this.archetypeIntensity,
      palette: this.palette,
      renderConfig: this.renderConfig,
      indirectDraw: this.indirectDraw,
      paletteCount: this.paletteCount,
      capacity: this.capacity,
    });
    this.renderPasses += 1;
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
    this.commandCount = 0;
    this.preparedCommandCount = 0;
    this.particleCount = 0;
    this.spawnedParticles = 0;
    this.simulationTime = 0;
    this.eventWindows.clear();
    this.poolQueued.fill(0);
    this.archetypeActiveEstimate.fill(0);
    this.eventAttempts = 0;
    for (const trigger of ["birth", "age", "death", "collision"] as const) this.eventAttemptsByTrigger[trigger] = 0;
    for (const priority of ["primary", "secondary", "cosmetic"] as const) this.eventAttemptsByPriority[priority] = 0;
    for (let index = 0; index < this.poolCursor.length; index += 1) this.poolCursor[index] = Math.round(this.poolData[index * 4] ?? 0);
  }
  diagnostics(): ParticleEffectBackendDiagnostics2D {
    return Object.freeze({
      capacity: this.capacity,
      activeEstimate: Math.min(this.capacity, this.spawnedParticles),
      queuedCommands: 0,
      droppedCommands: this.droppedCommands,
      spawnedParticles: this.spawnedParticles,
      droppedParticles: this.droppedParticles,
      eventCount: this.eventPasses,
      simulationPasses: this.simulationPasses,
      renderPasses: this.renderPasses,
      uploadBytes: this.uploadBytes,
      contextGeneration: 0,
      rebuildCount: 0,
      allocatedBytes:
        this.capacity * 4 * 4 * 3
        + this.commandData.byteLength
        + this.frameData.byteLength
        + this.attractorData.byteLength
        + this.domainData.byteLength
        + this.collisionProfileData.byteLength
        + this.colliderCountData.byteLength
        + this.circleData.byteLength
        + this.capsuleAData.byteLength
        + this.capsuleBData.byteLength
        + this.sizeData.byteLength
        + this.lengthData.byteLength
        + this.alphaData.byteLength
        + this.intensityData.byteLength
        + this.paletteData.byteLength
        + this.renderConfigData.byteLength
        + this.indirectDrawData.byteLength
        + (this.eventQueue
          ? this.capacity * 3 * 16 + this.zeroEventCounters.byteLength + this.eventParameterData.byteLength
          : 0),
      eventAttempts: this.eventAttempts,
      eventOccupiedDrops: 0,
      eventBudgetDrops: 0,
      diagnosticAccuracy: "estimated",
      directCommandsAdmitted: this.admittedCommands,
      directCommandsTruncated: this.truncatedCommands,
      commandUploadBytes: this.uploadBytes,
      allocationsAfterWarmup: 0,
      archetypes: Object.freeze(Object.fromEntries(this.program.effect.source.archetypes.map((archetype, index) => [archetype.id, Object.freeze({ capacity: Math.round(this.poolData[index * 4 + 1] ?? 0), activeEstimate: Math.round(this.archetypeActiveEstimate[index] ?? 0) })]))),
      eventAttemptsByTrigger: Object.freeze({ ...this.eventAttemptsByTrigger }),
      eventAttemptsByPriority: Object.freeze({ ...this.eventAttemptsByPriority }),
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stateA.destroy();
    this.stateB.destroy();
    this.stateC.destroy();
    this.commands.destroy();
    this.frame.destroy();
    this.indirectDraw.destroy();
    this.motion.destroy();
    this.archetypeSize.destroy();
    this.archetypeLength.destroy();
    this.archetypeAlpha.destroy();
    this.archetypeIntensity.destroy();
    this.palette.destroy();
    this.renderConfig.destroy();
    this.sources.destroy();
    this.forces.destroy();
    this.collisionProfiles.destroy();
    this.colliderCounts.destroy();
    this.circles.destroy();
    this.capsuleA.destroy();
    this.capsuleB.destroy();
    this.attractors.destroy();
    this.domain.destroy();
    this.emitterInitialization.destroy();
    this.pools.destroy();
    this.eventQueue?.destroy();
    this.eventCounters?.destroy();
    this.eventParameters?.destroy();
  }
  private prepareCommands(): void {
    const result = planParticleSpawnCommands2D(this.commandData, this.commandCount, this.preparedCommandData, COMMAND_CAPACITY, this.poolData, this.poolCursor);
    this.preparedCommandCount = result.commandCount;
    this.droppedParticles += result.droppedParticles;
    this.truncatedCommands += result.truncatedCommands;
  }
  private uploadArchetypeVector(buffer: ParticleWebGpuBuffer2D, data: Float32Array, archetypeIndex: number): void {
    const offset = archetypeIndex * 4;
    this.device.queue.writeBuffer(buffer, offset * Float32Array.BYTES_PER_ELEMENT, data, offset, 4);
    this.uploadBytes += 4 * Float32Array.BYTES_PER_ELEMENT;
  }
  private assertUsable(): void {
    if (this.disposed) throw new Error("WebGPU particle effect resource is disposed");
    const failure = this.backendFailure();
    if (failure) throw failure;
  }
}

function spawnShapeCode(shape: string): number {
  return Math.max(0, ["point", "disc", "line", "cone", "arc", "ring", "radial", "spiral", "pinwheel", "shower", "annulus", "rectangle", "path", "texture-mask", "mesh", "particles", "collision-contacts", "external-points", "custom"].indexOf(shape));
}
function forceFalloffCode(value: import("@hooksjam/gl-game-lab-engine").ParticleForceFalloff2D | undefined): number {
  return value === undefined ? -1 : value === "constant" ? 0 : value === "inverse" ? 1 : 2;
}
function forceEnvelopeCode(value: import("@hooksjam/gl-game-lab-engine").ParticleForceEnvelope2D | undefined): number {
  return value === undefined || value === "none" ? 0 : value === "linear" ? 1 : 2;
}
function domainBehaviorCode(value: import("@hooksjam/gl-game-lab-engine").ParticleDomainBehavior2D): number {
  return value === "none" ? 0 : value === "kill" ? 1 : value === "bounce" ? 2 : 3;
}
function colorModeCode(value: NonNullable<ParticleRenderParameters2D["colorMode"]>): number {
  return value === "seeded" ? 0 : value === "over-life" ? 1 : value === "generation" ? 2 : 3;
}
function createStorageBuffer(device: ParticleWebGpuDevice2D, label: string, data: Float32Array): ParticleWebGpuBuffer2D {
  const buffer = device.createBuffer({ label, size: data.byteLength, usage: STORAGE_COPY_USAGE });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}
function writeCurve(target: Float32Array, index: number, curve: Readonly<{ start: number; end: number; exponent?: number }>, variability = 0): void {
  target.set([curve.start, curve.end, curve.exponent ?? 1, variability], index * 4);
}
function writeBoundMotion(motion: Float32Array, force: Float32Array, index: number, field: string, value: number): "motion" | "force" | undefined {
  const offset = index * 4;
  if (field === "gravity") { motion[offset] = value; return "motion"; }
  if (field === "drag") { motion[offset + 1] = value; return "motion"; }
  if (field === "turbulence") { motion[offset + 2] = value; return "motion"; }
  if (field === "angularVelocity") { motion[offset + 3] = value; return "motion"; }
  if (field === "radialAcceleration") { force[offset] = value; return "force"; }
  if (field === "tangentialAcceleration") { force[offset + 1] = value; return "force"; }
  if (field === "maxSpeed") { force[offset + 3] = value; return "force"; }
  return undefined;
}
function writeBoundCollision(collision: Float32Array, index: number, field: string, value: number): boolean {
  const offset = index * 4;
  if (field === "restitution") collision[offset] = value;
  else if (field === "friction") collision[offset + 1] = value;
  else if (field === "lifetimeLoss") collision[offset + 2] = value;
  else return false;
  return true;
}
function writeBoundAppearance(size: Float32Array, length: Float32Array, alpha: Float32Array, intensity: Float32Array, index: number, field: string, value: number): { readonly buffer: "size" | "length" | "alpha" | "intensity"; readonly data: Float32Array } | undefined {
  const [curve, component] = field.split("."),
    target = curve === "size" ? { buffer: "size" as const, data: size } : curve === "length" ? { buffer: "length" as const, data: length } : curve === "alpha" ? { buffer: "alpha" as const, data: alpha } : curve === "intensity" ? { buffer: "intensity" as const, data: intensity } : undefined,
    slot = component === "start" ? 0 : component === "end" ? 1 : component === "exponent" ? 2 : component === "variability" ? 3 : -1;
  if (!target || slot < 0) return undefined;
  target.data[index * 4 + slot] = value;
  return target;
}
