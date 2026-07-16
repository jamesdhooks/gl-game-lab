import type {
  CompiledParticleProgram2D,
  GpuRenderTarget2D,
  ParticleEffectBackendDiagnostics2D,
  ParticleEffectBackendResource2D,
  ParticleEffectRuntimeBackend2D,
  ParticlePalette2D,
  ParticleRenderTier2D,
  ParticleRuntimeEmission2D,
} from '@hooksjam/gl-game-lab-engine';

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
  readonly queue: { writeBuffer(buffer: ParticleWebGpuBuffer2D, offset: number, data: ArrayBufferView): void; submit(commands: readonly unknown[]): void };
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
  private readonly pipeline: ParticleWebGpuComputePipeline2D;
  private readonly bindGroup: ParticleWebGpuBindGroup2D;
  private readonly commandData = new Float32Array(COMMAND_CAPACITY * COMMAND_FLOATS);
  private readonly frameData = new ArrayBuffer(32);
  private readonly frameFloats = new Float32Array(this.frameData);
  private readonly frameUints = new Uint32Array(this.frameData);
  private commandCount = 0;
  private particleCount = 0;
  private cursor = 0;
  private frameStart = 0;
  private spawnedParticles = 0;
  private droppedCommands = 0;
  private admittedCommands = 0;
  private droppedParticles = 0;
  private truncatedCommands = 0;
  private simulationPasses = 0;
  private renderPasses = 0;
  private uploadBytes = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private disposed = false;

  constructor(
    private readonly device: ParticleWebGpuDevice2D,
    id: string,
    private readonly program: CompiledParticleProgram2D,
    private readonly capacity: number,
    private readonly renderEffect: WebGpuParticleEffectRender2D,
  ) {
    const stateBytes = capacity * 4 * Float32Array.BYTES_PER_ELEMENT;
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
    const module = device.createShaderModule({ label: `${id}.compute`, code: program.webgpu.simulation.source });
    this.pipeline = device.createComputePipeline({ label: `${id}.pipeline`, layout: 'auto', compute: { module, entryPoint: program.webgpu.simulation.entryPoint } });
    this.bindGroup = device.createBindGroup({
      label: `${id}.bindings`, layout: this.pipeline.getBindGroupLayout(0),
      entries: [this.stateA, this.stateB, this.stateC, this.frame, this.commands, this.motion].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
  }

  emit(emission: ParticleRuntimeEmission2D): void {
    this.assertUsable();
    if (this.commandCount >= COMMAND_CAPACITY) { this.droppedCommands += 1; this.droppedParticles += emission.count; return; }
    const emitter = this.program.effect.source.emitters[emission.emitterIndex];
    if (!emitter) throw new Error(`WebGPU emission references invalid emitter ${emission.emitterIndex}`);
    const archetypeId = this.program.effect.archetypeIds[emitter.archetypeId];
    const archetype = this.program.effect.source.archetypes[archetypeId ?? -1];
    if (archetypeId === undefined || !archetype) throw new Error(`WebGPU emitter references invalid archetype ${emitter.archetypeId}`);
    const count = Math.min(Math.max(0, this.capacity - this.particleCount), emission.count), offset = this.commandCount * COMMAND_FLOATS;
    if (count <= 0) { this.droppedCommands += 1; this.droppedParticles += emission.count; return; }
    this.commandData[offset] = archetypeId; this.commandData[offset + 1] = this.particleCount; this.commandData[offset + 2] = count;
    this.commandData[offset + 4] = emission.positionX; this.commandData[offset + 5] = emission.positionY;
    this.commandData[offset + 8] = emission.direction; this.commandData[offset + 9] = emission.spread || archetype.spawn.spread;
    this.commandData[offset + 10] = emission.power; this.commandData[offset + 11] = archetype.lifecycle.lifetime;
    this.commandData[offset + 12] = emission.seed; this.commandData[offset + 13] = emission.seed / 0x1_0000_0000;
    this.commandData[offset + 14] = archetype.lifecycle.lifetimeVariability ?? 0;
    this.commandCount += 1; this.particleCount += count; this.droppedParticles += emission.count - count;
    this.admittedCommands += 1;
    if (count < emission.count) this.truncatedCommands += 1;
  }

  setPalette(_palette: ParticlePalette2D): void { this.assertUsable(); }

  update(deltaSeconds: number, timescale: number): void {
    this.assertUsable();
    this.frameFloats[0] = deltaSeconds * timescale; this.frameUints[1] = this.capacity;
    this.frameFloats[2] = this.viewportWidth; this.frameFloats[3] = this.viewportHeight;
    this.frameUints[4] = this.commandCount; this.frameUints[5] = 4;
    this.frameStart = this.cursor; this.frameUints[6] = this.frameStart;
    if (this.commandCount > 0) { const commandView = this.commandData.subarray(0, this.commandCount * COMMAND_FLOATS); this.device.queue.writeBuffer(this.commands, 0, commandView); this.uploadBytes += commandView.byteLength; }
    this.device.queue.writeBuffer(this.frame, 0, new Uint8Array(this.frameData)); this.uploadBytes += this.frameData.byteLength;
    const encoder = this.device.createCommandEncoder({ label: 'particle-effect.compute' }), pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bindGroup); pass.dispatchWorkgroups(Math.ceil(this.capacity / 256)); pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.spawnedParticles += this.particleCount; this.cursor = (this.frameStart + this.particleCount) % this.capacity; this.commandCount = 0; this.particleCount = 0; this.simulationPasses += 1;
  }

  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    this.assertUsable(); this.viewportWidth = target.width; this.viewportHeight = target.height;
    this.renderEffect(this.program, [this.stateA, this.stateB, this.stateC], target, tier); this.renderPasses += 1;
  }
  clear(): void { this.assertUsable(); this.commandCount = 0; this.particleCount = 0; this.cursor = 0; }
  diagnostics(): ParticleEffectBackendDiagnostics2D {
    return Object.freeze({ capacity: this.capacity, activeEstimate: Math.min(this.capacity, this.spawnedParticles), queuedCommands: 0, droppedCommands: this.droppedCommands, spawnedParticles: this.spawnedParticles, droppedParticles: this.droppedParticles, eventCount: 0, simulationPasses: this.simulationPasses, renderPasses: this.renderPasses, uploadBytes: this.uploadBytes, contextGeneration: 0, rebuildCount: 0, allocatedBytes: this.capacity * 4 * 4 * 3 + this.commandData.byteLength + this.frameData.byteLength, eventAttempts: 0, eventOccupiedDrops: 0, eventBudgetDrops: 0, diagnosticAccuracy: 'estimated', directCommandsAdmitted: this.admittedCommands, directCommandsTruncated: this.truncatedCommands, commandUploadBytes: this.uploadBytes, allocationsAfterWarmup: 0 });
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stateA.destroy(); this.stateB.destroy(); this.stateC.destroy(); this.commands.destroy(); this.frame.destroy(); this.motion.destroy(); }
  private assertUsable(): void { if (this.disposed) throw new Error('WebGPU particle effect resource is disposed'); }
}
