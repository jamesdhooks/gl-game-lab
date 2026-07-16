import type {
  Gpu2DService,
  GpuFieldSystem2D,
  GpuFieldSystem2DOptions,
  GpuFieldMesh2D,
  GpuParticleSeed2D,
  GpuParticleGridSeed2D,
  GpuParticleGridEmit2D,
  GpuParticleGridSnapshot2D,
  GpuParticleGridParticleUpdateOptions2D,
  GpuParticleGridMetaballOptions2D,
  GpuParticleGridObstacles2D,
  GpuParticleGridPointOptions2D,
  GpuParticleGridSystem2D,
  GpuParticleGridSystem2DOptions,
  GpuParticleGridTransfer2D,
  GpuParticleGridTransferOptions2D,
  GpuParticleGridUpdate2D,
  GpuParticleGridUpdateOptions2D,
  GpuParticleSystem2D,
  GpuParticleSystem2DOptions,
  GpuParticleCommandBatch2D,
  GpuParticleSystemDiagnostics2D,
  Gpu2DCapabilities,
  GpuParticleGridValidation2D,
  GpuRenderTarget2D,
  GpuTexture2D,
  GpuUniforms2D,
  GpuUniformBinder2D,
  GpuUniformEncoder2D,
  GpuUniformLocation2D,
} from '@hooksjam/gl-game-lab-engine';
import { GpuFieldPass } from './GpuFieldPass.js';
import { GpuFieldState } from './GpuFieldState.js';
import { GpuFieldMeshPass } from './GpuFieldMeshPass.js';
import { GpuParticleRenderer } from './GpuParticleRenderer.js';
import { GpuParticleGridState, gpuParticleGridBytes } from './GpuParticleGridState.js';
import { DensityMetaballRenderer } from './DensityMetaballRenderer.js';
import { GpuParticleGridPointRenderer } from './GpuParticleGridPointRenderer.js';
import { GpuParticleState } from './GpuParticleState.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { GpuSimulationPass } from './GpuSimulationPass.js';
import { createShaderProgram } from './ShaderProgram.js';
import type { GpuFrameRenderPass, GpuRenderPassQueue } from './GpuRenderPassQueue.js';
import type { RestorableResourceOwner } from './RestorableResourceOwner.js';
import type { WebGL2Device } from './WebGL2Device.js';
import { TrailFeedbackRenderer } from './TrailFeedbackRenderer.js';
import { GpuParticleCommandBuffer, GPU_PARTICLE_COMMAND_CAPACITY, GPU_PARTICLE_COMMAND_FLOATS } from './GpuParticleCommandBuffer.js';

interface FieldBundle {
  readonly state: GpuFieldState;
  readonly passes: ReadonlyMap<string, GpuFieldPass>;
  readonly meshPasses: ReadonlyMap<string, GpuFieldMeshPass>;
}

interface ParticleBundle {
  readonly state: GpuParticleState;
  readonly stepper: GpuSimulationPass;
  readonly eventStepper: GpuSimulationPass | undefined;
  readonly points: GpuParticleRenderer;
  readonly renderPasses: ReadonlyMap<string, GpuParticleRenderer>;
  readonly trails: TrailFeedbackRenderer | undefined;
  readonly commands: GpuParticleCommandBuffer;
}

interface ParticleGridBundle {
  readonly state: GpuParticleGridState;
  readonly metaballs: DensityMetaballRenderer;
  readonly points: GpuParticleGridPointRenderer;
}

class WebGLGpuRenderTarget implements GpuRenderTarget2D {
  constructor(readonly native: GpuParticleRenderDestination) {}
  get width(): number { return this.native.width; }
  get height(): number { return this.native.height; }
}

export class WebGLGpuTexture2D implements GpuTexture2D {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly native: () => WebGLTexture,
  ) {}
}

class WebGLGpuFieldSystem implements GpuFieldSystem2D {
  private readonly owner: RestorableResourceOwner<FieldBundle>;
  private disposed = false;
  private currentGeneration = 0;

  constructor(
    device: WebGL2Device,
    id: string,
    options: GpuFieldSystem2DOptions,
    private readonly onDispose: () => void,
    private readonly countDraw: (points?: number, triangles?: number) => void,
  ) {
    this.owner = device.ownContextResource({
      id,
      priority: 50,
      estimatedBytes: fieldBytes(options),
      create: () => createBundle(device.gl, options, id),
      dispose: disposeBundle,
      restored: () => { this.currentGeneration += 1; },
    });
  }

  get width(): number { return this.owner.value.state.width; }
  get height(): number { return this.owner.value.state.height; }
  get generation(): number { return this.currentGeneration; }
  clear(): void { this.owner.value.state.clear(); }
  step(passId: string, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const bundle = this.owner.value;
    requirePass(bundle, passId).step(bundle.state, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
    this.countDraw();
  }
  render(passId: string, target: GpuRenderTarget2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    if (!(target instanceof WebGLGpuRenderTarget)) throw new Error('GPU target belongs to another backend');
    const bundle = this.owner.value;
    requirePass(bundle, passId).render(bundle.state, target.native, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
    this.countDraw();
  }
  renderMesh(passId: string, target: GpuRenderTarget2D, mesh: GpuFieldMesh2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    if (!(target instanceof WebGLGpuRenderTarget)) throw new Error('GPU target belongs to another backend');
    const bundle = this.owner.value;
    const pass = bundle.meshPasses.get(passId);
    if (!pass) throw new Error(`Unknown GPU field mesh pass: ${passId}`);
    pass.render(bundle.state, target.native, mesh, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
    this.countDraw(0, mesh.vertexCount / 3);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    this.onDispose();
  }
}

class WebGLGpuParticleSystem implements GpuParticleSystem2D {
  private readonly owner: RestorableResourceOwner<ParticleBundle>;
  private disposed = false;
  private currentGeneration = 0;
  private retainedSeed: GpuParticleSeed2D | undefined;
  private queuedCommands = 0;
  private droppedCommands = 0;
  private spawnedParticles = 0;
  private simulationPasses = 0;
  private eventPasses = 0;
  private renderPasses = 0;
  private uploadedBytes = 0;

  constructor(
    device: WebGL2Device,
    id: string,
    options: GpuParticleSystem2DOptions,
    private readonly onDispose: () => void,
    private readonly countDraw: (points?: number, triangles?: number) => void,
    private readonly countUpload: (bytes: number) => void,
  ) {
    this.owner = device.ownContextResource({
      id,
      priority: 50,
      estimatedBytes: particleBytes(options),
      create: () => createParticleBundle(device.gl, options, id),
      dispose: disposeParticleBundle,
      restored: (bundle) => {
        if (this.retainedSeed) bundle.state.uploadSeed(this.retainedSeed);
        this.currentGeneration += 1;
      },
    });
  }

  get capacity(): number { return this.owner.value.state.capacity; }
  get width(): number { return this.owner.value.state.width; }
  get height(): number { return this.owner.value.state.height; }
  get generation(): number { return this.currentGeneration; }
  clear(): void {
    this.retainedSeed = undefined;
    this.owner.value.state.clear();
  }
  uploadSeed(seed: GpuParticleSeed2D): void {
    this.retainedSeed = {
      ...(seed.positions ? { positions: seed.positions.slice() } : {}),
      ...(seed.velocities ? { velocities: seed.velocities.slice() } : {}),
      ...(seed.metadata ? { metadata: seed.metadata.slice() } : {}),
    };
    this.owner.value.state.uploadSeed(this.retainedSeed);
    this.countUpload(((seed.positions?.byteLength ?? 0) + (seed.velocities?.byteLength ?? 0) + (seed.metadata?.byteLength ?? 0)) * 2);
  }
  step(uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const bundle = this.owner.value;
    bundle.stepper.run(bundle.state, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
    this.countDraw();
    this.simulationPasses += 1;
  }
  stepBatch(batch: GpuParticleCommandBatch2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const bundle = this.owner.value;
    const normalized = bundle.commands.upload(batch.data, batch.count);
    const uploadBytes = normalized.requiredFloats * Float32Array.BYTES_PER_ELEMENT;
    this.queuedCommands += normalized.count;
    this.droppedCommands += normalized.dropped;
    this.spawnedParticles += Math.max(0, Math.floor(batch.particleCount ?? 0));
    this.uploadedBytes += uploadBytes;
    this.countUpload(uploadBytes);
    bundle.stepper.run(bundle.state, (gl, uniform) => {
      bundle.commands.bind(3);
      gl.uniform1i(uniform('uParticleCommandData'), 3);
      gl.uniform1i(uniform('uParticleCommandCount'), normalized.count);
      gl.uniform1i(uniform('uParticleCommandTexels'), 4);
      applyBindings(gl, uniform, uniforms);
    });
    this.countDraw();
    this.simulationPasses += 1;
  }
  stepEvents(uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const bundle = this.owner.value;
    if (!bundle.eventStepper) throw new Error('GPU particle system was created without an event pass');
    bundle.eventStepper.run(bundle.state, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
    this.countDraw();
    this.simulationPasses += 1;
    this.eventPasses += 1;
  }
  render(target: GpuRenderTarget2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}, particleCount = this.capacity): void {
    const native = requireTarget(target);
    const bundle = this.owner.value;
    const count = Math.max(0, Math.min(bundle.state.capacity, Math.floor(particleCount)));
    bundle.points.render(bundle.state, native, (gl, uniform) => { applyBindings(gl, uniform, uniforms); }, count);
    this.countDraw(count);
    this.renderPasses += 1;
  }
  renderPass(id: string, target: GpuRenderTarget2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}, particleCount = this.capacity): void {
    const native = requireTarget(target);
    const bundle = this.owner.value;
    const pass = bundle.renderPasses.get(id);
    if (!pass) throw new Error(`Unknown GPU particle render pass: ${id}`);
    const count = Math.max(0, Math.min(bundle.state.capacity, Math.floor(particleCount)));
    pass.render(bundle.state, native, (gl, uniform) => { applyBindings(gl, uniform, uniforms); }, count);
    this.countDraw(0, count * 2);
    this.renderPasses += 1;
  }
  beginTrails(width: number, height: number, fade: number): GpuRenderTarget2D {
    const trails = requireTrails(this.owner.value);
    const target = new WebGLGpuRenderTarget(trails.beginFrame(width, height, fade));
    this.countDraw();
    this.renderPasses += 1;
    return target;
  }
  compositeTrails(target: GpuRenderTarget2D, background: readonly [number, number, number], bloom: number): void {
    requireTrails(this.owner.value).composite(requireTarget(target), background, bloom);
    this.countDraw();
    this.renderPasses += 1;
  }
  clearTrails(): void { this.owner.value.trails?.clear(); }
  copyStateTo(target: GpuParticleSystem2D): boolean {
    return target instanceof WebGLGpuParticleSystem && this.owner.value.state.copyTo(target.owner.value.state);
  }
  diagnostics(): GpuParticleSystemDiagnostics2D {
    return Object.freeze({
      commandCapacity: this.owner.value.commands.capacity,
      queuedCommands: this.queuedCommands,
      droppedCommands: this.droppedCommands,
      spawnedParticles: this.spawnedParticles,
      simulationPasses: this.simulationPasses,
      eventPasses: this.eventPasses,
      renderPasses: this.renderPasses,
      uploadBytes: this.uploadedBytes,
      contextGeneration: this.currentGeneration,
      rebuildCount: this.currentGeneration,
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    this.retainedSeed = undefined;
    this.onDispose();
  }
}

class WebGLGpuParticleGridSystem implements GpuParticleGridSystem2D {
  private readonly owner: RestorableResourceOwner<ParticleGridBundle>;
  private retainedSeed: GpuParticleGridSeed2D | undefined;
  private retainedObstacles: GpuParticleGridObstacles2D | undefined;
  private disposed = false;
  private currentGeneration = 0;

  constructor(
    device: WebGL2Device,
    id: string,
    options: GpuParticleGridSystem2DOptions,
    private readonly onDispose: () => void,
    private readonly countUpload: (bytes: number) => void,
    private readonly countDraw: (drawCalls: number) => void,
  ) {
    this.owner = device.ownContextResource({
      id,
      priority: 55,
      estimatedBytes: gpuParticleGridBytes(options),
      create: () => createParticleGridBundle(device.gl, options),
      dispose: disposeParticleGridBundle,
      restored: (bundle) => {
        if (this.retainedSeed) bundle.state.uploadSeed(this.retainedSeed);
        this.currentGeneration += 1;
      },
    });
  }

  get capacity(): number { return this.owner.value.state.capacity; }
  get width(): number { return this.owner.value.state.width; }
  get height(): number { return this.owner.value.state.height; }
  get gridWidth(): number { return this.owner.value.state.gridWidth; }
  get gridHeight(): number { return this.owner.value.state.gridHeight; }
  get count(): number { return this.owner.value.state.count; }
  get generation(): number { return this.currentGeneration; }

  clear(): void {
    this.retainedSeed = undefined;
    this.retainedObstacles = undefined;
    this.owner.value.state.clear();
  }

  uploadSeed(seed: GpuParticleGridSeed2D): void {
    this.retainedSeed = cloneParticleGridSeed(seed);
    this.owner.value.state.uploadSeed(this.retainedSeed);
    this.countUpload(particleGridSeedBytes(seed));
  }

  emit(batch: GpuParticleGridEmit2D): number {
    const made = this.owner.value.state.emit(batch);
    if (made === 0) return 0;
    this.retainedSeed = appendParticleGridSeed(this.retainedSeed, batch, made, this.capacity);
    this.countUpload(particleGridSeedBytes({ ...batch, count: made }));
    return made;
  }

  setObstacles(obstacles: GpuParticleGridObstacles2D): void {
    if (!Number.isSafeInteger(obstacles.revision) || obstacles.revision < 0) throw new Error('GPU particle-grid obstacle revision must be a non-negative integer');
    if (obstacles.circleObstacles.length % 4 !== 0) throw new Error('GPU particle-grid circle obstacles must be packed in groups of 4');
    if (obstacles.segmentObstacles.length % 8 !== 0) throw new Error('GPU particle-grid segment obstacles must be packed in groups of 8');
    this.retainedObstacles = Object.freeze({
      revision: obstacles.revision,
      circleObstacles: obstacles.circleObstacles.slice(),
      segmentObstacles: obstacles.segmentObstacles.slice(),
    });
  }

  step(options: GpuParticleGridParticleUpdateOptions2D): void {
    const obstacles = this.retainedObstacles;
    const circleObstacles = options.circleObstacles ?? obstacles?.circleObstacles;
    const segmentObstacles = options.segmentObstacles ?? obstacles?.segmentObstacles;
    this.owner.value.state.step(Object.freeze({
      ...options,
      ...(circleObstacles ? { circleObstacles } : {}),
      ...(segmentObstacles ? { segmentObstacles } : {}),
    }));
    this.countDraw(5);
  }

  renderMetaballs(target: GpuRenderTarget2D, options: GpuParticleGridMetaballOptions2D): void {
    const bundle = this.owner.value;
    bundle.metaballs.renderParticleGrid(bundle.state, requireTarget(target), options);
    this.countDraw(2);
  }

  renderParticles(target: GpuRenderTarget2D, options: GpuParticleGridPointOptions2D): void {
    const bundle = this.owner.value;
    bundle.points.render(bundle.state, requireTarget(target), options);
    this.countDraw(1);
  }

  debugReadback(): GpuParticleGridSnapshot2D {
    return this.owner.value.state.debugReadback();
  }

  debugComputeParticleToGrid(options: GpuParticleGridTransferOptions2D): GpuParticleGridTransfer2D {
    return this.owner.value.state.debugComputeParticleToGrid(options);
  }

  debugComputeGridUpdate(options: GpuParticleGridUpdateOptions2D): GpuParticleGridUpdate2D {
    return this.owner.value.state.debugComputeGridUpdate(options);
  }

  debugComputeParticleUpdate(options: GpuParticleGridParticleUpdateOptions2D): GpuParticleGridSnapshot2D {
    return this.owner.value.state.debugComputeParticleUpdate(options);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    this.retainedSeed = undefined;
    this.retainedObstacles = undefined;
    this.onDispose();
  }
}

export class WebGLGpu2DService implements Gpu2DService {
  readonly capabilities: Gpu2DCapabilities;
  private readonly fields = new Set<WebGLGpuFieldSystem>();
  private readonly particles = new Set<WebGLGpuParticleSystem>();
  private readonly particleGrids = new Set<WebGLGpuParticleGridSystem>();
  private fieldId = 0;
  private particleId = 0;
  private particleGridId = 0;
  private frameDrawCalls = 0;
  private framePoints = 0;
  private frameTriangles = 0;
  private pendingUploadBytes = 0;
  private pendingSubmissions = 0;

  constructor(private readonly device: WebGL2Device, private readonly queue: GpuRenderPassQueue) {
    this.capabilities = detectGpu2DCapabilities(device.gl);
  }

  validateParticleGridSupport(): GpuParticleGridValidation2D {
    if (!this.capabilities.particleGrid.supported) {
      return Object.freeze({ supported: false, reason: 'Required WebGL2 particle-grid capabilities are unavailable' });
    }
    return validateParticleGridFloatBlend(this.device.gl);
  }

  createFieldSystem(id: string, options: GpuFieldSystem2DOptions): GpuFieldSystem2D {
    const normalized = id.trim();
    if (normalized.length === 0) throw new Error('GPU field system id cannot be empty');
    let field: WebGLGpuFieldSystem | undefined;
    field = new WebGLGpuFieldSystem(
      this.device,
      `gl-game-lab.render-webgl2.field.${this.fieldId}.${normalized}`,
      options,
      () => { if (field) this.fields.delete(field); },
      (points = 0, triangles = 0) => { this.frameDrawCalls += 1; this.framePoints += points; this.frameTriangles += triangles; },
    );
    this.fieldId += 1;
    this.fields.add(field);
    return field;
  }

  createParticleSystem(id: string, options: GpuParticleSystem2DOptions): GpuParticleSystem2D {
    const normalized = id.trim();
    if (normalized.length === 0) throw new Error('GPU particle system id cannot be empty');
    if (options.metadata && this.capabilities.particleEffects?.metadataState !== true) throw new Error('GPU particle metadata state requires at least three draw buffers and color attachments');
    let particles: WebGLGpuParticleSystem | undefined;
    particles = new WebGLGpuParticleSystem(
      this.device,
      `gl-game-lab.render-webgl2.particles.${this.particleId}.${normalized}`,
      options,
      () => { if (particles) this.particles.delete(particles); },
      (points = 0, triangles = 0) => { this.frameDrawCalls += 1; this.framePoints += points; this.frameTriangles += triangles; },
      (bytes) => { this.pendingUploadBytes += bytes; },
    );
    this.particleId += 1;
    this.particles.add(particles);
    return particles;
  }

  createParticleGridSystem(id: string, options: GpuParticleGridSystem2DOptions): GpuParticleGridSystem2D {
    const normalized = id.trim();
    if (normalized.length === 0) throw new Error('GPU particle-grid system id cannot be empty');
    const validation = this.validateParticleGridSupport();
    if (!validation.supported) throw new Error(validation.reason ?? 'GPU particle-grid system is unsupported');
    let particleGrid: WebGLGpuParticleGridSystem | undefined;
    particleGrid = new WebGLGpuParticleGridSystem(
      this.device,
      `gl-game-lab.render-webgl2.particle-grid.${this.particleGridId}.${normalized}`,
      options,
      () => { if (particleGrid) this.particleGrids.delete(particleGrid); },
      (bytes) => { this.pendingUploadBytes += bytes; },
      (drawCalls) => { this.frameDrawCalls += drawCalls; },
    );
    this.particleGridId += 1;
    this.particleGrids.add(particleGrid);
    return particleGrid;
  }

  submit(id: string, execute: (target: GpuRenderTarget2D) => void): void {
    this.pendingSubmissions += 1;
    const pass: GpuFrameRenderPass = {
      id,
      execute: (destination) => { execute(new WebGLGpuRenderTarget(destination)); },
    };
    this.queue.submit(pass);
  }

  beginFrameDiagnostics(): void { this.frameDrawCalls = 0; this.framePoints = 0; this.frameTriangles = 0; }
  diagnostics(): { readonly drawCalls: number; readonly points: number; readonly triangles: number; readonly uploadBytes: number; readonly submissions: number } {
    const snapshot = Object.freeze({ drawCalls: this.frameDrawCalls, points: this.framePoints, triangles: this.frameTriangles, uploadBytes: this.pendingUploadBytes, submissions: this.pendingSubmissions });
    this.pendingUploadBytes = 0;
    this.pendingSubmissions = 0;
    return snapshot;
  }

  destroy(): void {
    for (const particleGrid of [...this.particleGrids]) particleGrid.dispose();
    this.particleGrids.clear();
    for (const particles of [...this.particles]) particles.dispose();
    this.particles.clear();
    for (const field of [...this.fields]) field.dispose();
    this.fields.clear();
  }
}

function createParticleGridBundle(gl: WebGL2RenderingContext, options: GpuParticleGridSystem2DOptions): ParticleGridBundle {
  return {
    state: new GpuParticleGridState(gl, options),
    metaballs: new DensityMetaballRenderer(gl),
    points: new GpuParticleGridPointRenderer(gl),
  };
}

function disposeParticleGridBundle(bundle: ParticleGridBundle): void {
  bundle.points.dispose();
  bundle.metaballs.dispose();
  bundle.state.dispose();
}

function createParticleBundle(gl: WebGL2RenderingContext, options: GpuParticleSystem2DOptions, label: string): ParticleBundle {
  const disposers: Array<() => void> = [];
  try {
    const state = new GpuParticleState(gl, options); disposers.push(() => { state.dispose(); });
    const stepper = new GpuSimulationPass(gl, options.simulationFragmentSource, `${label}.simulation`); disposers.push(() => { stepper.dispose(); });
    const eventStepper = options.eventFragmentSource
      ? new GpuSimulationPass(gl, options.eventFragmentSource, `${label}.events`)
      : undefined;
    if (eventStepper) disposers.push(() => { eventStepper.dispose(); });
    const points = new GpuParticleRenderer(gl, {
      label: `${label}.particles`,
      vertexSource: options.particleVertexSource,
      fragmentSource: options.particleFragmentSource,
      ...(options.blend ? { blend: options.blend } : {}),
    }); disposers.push(() => { points.dispose(); });
    const renderPasses = new Map<string, GpuParticleRenderer>();
    for (const [id, pass] of Object.entries(options.renderPasses ?? {})) {
      if (id.trim().length === 0) throw new Error('GPU particle render pass id cannot be empty');
      const renderer = new GpuParticleRenderer(gl, {
        label: `${label}.${id}`,
        vertexSource: pass.vertexSource,
        fragmentSource: pass.fragmentSource,
        ...(pass.blend ? { blend: pass.blend } : {}),
        verticesPerParticle: pass.verticesPerParticle,
      });
      renderPasses.set(id, renderer);
      disposers.push(() => { renderer.dispose(); });
    }
    const trails = options.trails ? new TrailFeedbackRenderer(gl) : undefined;
    if (trails) disposers.push(() => { trails.dispose(); });
    const commands = new GpuParticleCommandBuffer(gl, options.commandCapacity ?? GPU_PARTICLE_COMMAND_CAPACITY);
    disposers.push(() => { commands.dispose(); });
    return { state, stepper, eventStepper, points, renderPasses, trails, commands };
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
}

function disposeParticleBundle(bundle: ParticleBundle): void {
  bundle.commands.dispose();
  bundle.eventStepper?.dispose();
  bundle.trails?.dispose();
  for (const pass of bundle.renderPasses.values()) pass.dispose();
  bundle.points.dispose();
  bundle.stepper.dispose();
  bundle.state.dispose();
}

function requireTarget(target: GpuRenderTarget2D): GpuParticleRenderDestination {
  if (!(target instanceof WebGLGpuRenderTarget)) throw new Error('GPU target belongs to another backend');
  return target.native;
}

function requireTrails(bundle: ParticleBundle): TrailFeedbackRenderer {
  if (!bundle.trails) throw new Error('GPU particle system was created without trails');
  return bundle.trails;
}

function createBundle(gl: WebGL2RenderingContext, options: GpuFieldSystem2DOptions, label: string): FieldBundle {
  const state = new GpuFieldState(gl, options);
  const passes = new Map<string, GpuFieldPass>();
  const meshPasses = new Map<string, GpuFieldMeshPass>();
  try {
    for (const [id, source] of Object.entries(options.passes)) {
      if (id.trim().length === 0) throw new Error('GPU field pass id cannot be empty');
      passes.set(id, new GpuFieldPass(gl, source, `${label}.${id}`));
    }
    for (const [id, sources] of Object.entries(options.meshPasses ?? {})) {
      if (id.trim().length === 0) throw new Error('GPU field mesh pass id cannot be empty');
      meshPasses.set(id, new GpuFieldMeshPass(gl, sources.vertexSource, sources.fragmentSource, `${label}.${id}`));
    }
    if (passes.size === 0) throw new Error('GPU field system requires at least one pass');
    return { state, passes, meshPasses };
  } catch (error) {
    for (const pass of passes.values()) pass.dispose();
    for (const pass of meshPasses.values()) pass.dispose();
    state.dispose();
    throw error;
  }
}

function disposeBundle(bundle: FieldBundle): void {
  for (const pass of bundle.meshPasses.values()) pass.dispose();
  for (const pass of bundle.passes.values()) pass.dispose();
  bundle.state.dispose();
}

function requirePass(bundle: FieldBundle, id: string): GpuFieldPass {
  const pass = bundle.passes.get(id);
  if (!pass) throw new Error(`Unknown GPU field pass: ${id}`);
  return pass;
}

function applyUniforms(
  gl: WebGL2RenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  uniforms: GpuUniforms2D,
): void {
  for (const [name, value] of Object.entries(uniforms)) {
    const location = uniform(name);
    if (value.type === '1f') gl.uniform1f(location, value.value);
    else if (value.type === '1i') gl.uniform1i(location, value.value);
    else if (value.type === '2f') gl.uniform2f(location, value.value[0], value.value[1]);
    else if (value.type === '3fv') gl.uniform3fv(location, value.value);
    else gl.uniform4fv(location, value.value);
  }
}

function applyBindings(
  gl: WebGL2RenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  bindings: GpuUniforms2D | GpuUniformBinder2D,
): void {
  if (typeof bindings !== 'function') { applyUniforms(gl, uniform, bindings); return; }
  const encoder: GpuUniformEncoder2D = {
    uniform1f: (location, value) => { gl.uniform1f(nativeLocation(location, uniform), value); },
    uniform1i: (location, value) => { gl.uniform1i(nativeLocation(location, uniform), value); },
    uniform2f: (location, x, y) => { gl.uniform2f(nativeLocation(location, uniform), x, y); },
    uniform3fv: (location, value) => { gl.uniform3fv(nativeLocation(location, uniform), value); },
    uniform4fv: (location, value) => { gl.uniform4fv(nativeLocation(location, uniform), value); },
    uniformTexture: (location, texture, unit) => {
      if (!(texture instanceof WebGLGpuTexture2D)) throw new Error('GPU texture belongs to another backend');
      if (!Number.isSafeInteger(unit) || unit < 2 || unit > 31) throw new Error('GPU texture unit must be an integer between 2 and 31');
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture.native());
      gl.uniform1i(nativeLocation(location, uniform), unit);
    },
  };
  bindings(encoder, (name) => Object.freeze({ name }));
}

function nativeLocation(location: GpuUniformLocation2D, uniform: (name: string) => WebGLUniformLocation | null): WebGLUniformLocation | null {
  return uniform(location.name);
}

function fieldBytes(options: GpuFieldSystem2DOptions): number {
  return options.width * options.height * (options.precision === 'float' ? 16 : 8) * 2;
}

function particleBytes(options: GpuParticleSystem2DOptions): number {
  const width = options.width ?? Math.ceil(Math.sqrt(options.capacity));
  const height = options.height ?? Math.ceil(options.capacity / width);
  return width * height * (options.precision === 'half-float' ? 8 : 16) * (options.metadata ? 6 : 4)
    + (options.commandCapacity ?? GPU_PARTICLE_COMMAND_CAPACITY) * GPU_PARTICLE_COMMAND_FLOATS * Float32Array.BYTES_PER_ELEMENT;
}

function cloneParticleGridSeed(seed: GpuParticleGridSeed2D): GpuParticleGridSeed2D {
  return Object.freeze({
    count: seed.count,
    positions: seed.positions.slice(),
    velocities: seed.velocities.slice(),
    radii: seed.radii.slice(),
    colorSeeds: seed.colorSeeds.slice(),
    foam: seed.foam.slice(),
    affine: seed.affine.slice(),
  });
}

function appendParticleGridSeed(
  existing: GpuParticleGridSeed2D | undefined,
  batch: GpuParticleGridEmit2D,
  made: number,
  capacity: number,
): GpuParticleGridSeed2D {
  const previousCount = existing?.count ?? 0;
  const nextCount = Math.min(capacity, previousCount + made);
  const positions = new Float32Array(nextCount * 2);
  const velocities = new Float32Array(nextCount * 2);
  const radii = new Float32Array(nextCount);
  const colorSeeds = new Float32Array(nextCount);
  const foam = new Float32Array(nextCount);
  const affine = new Float32Array(nextCount * 4);
  if (existing) {
    positions.set(existing.positions.subarray(0, previousCount * 2));
    velocities.set(existing.velocities.subarray(0, previousCount * 2));
    radii.set(existing.radii.subarray(0, previousCount));
    colorSeeds.set(existing.colorSeeds.subarray(0, previousCount));
    foam.set(existing.foam.subarray(0, previousCount));
    affine.set(existing.affine.subarray(0, previousCount * 4));
  }
  positions.set(batch.positions.subarray(0, made * 2), previousCount * 2);
  velocities.set(batch.velocities.subarray(0, made * 2), previousCount * 2);
  radii.set(batch.radii.subarray(0, made), previousCount);
  colorSeeds.set(batch.colorSeeds.subarray(0, made), previousCount);
  foam.set(batch.foam.subarray(0, made), previousCount);
  affine.set(batch.affine.subarray(0, made * 4), previousCount * 4);
  return Object.freeze({ count: nextCount, positions, velocities, radii, colorSeeds, foam, affine });
}

function particleGridSeedBytes(seed: GpuParticleGridSeed2D): number {
  return seed.positions.byteLength + seed.velocities.byteLength + seed.radii.byteLength
    + seed.colorSeeds.byteLength + seed.foam.byteLength + seed.affine.byteLength;
}

export function detectGpu2DCapabilities(gl: WebGL2RenderingContext): Gpu2DCapabilities {
  const floatRenderTargets = gl.getExtension('EXT_color_buffer_float') !== null;
  const floatBlend = gl.getExtension('EXT_float_blend') !== null;
  const maxDrawBuffers = numberParameter(gl, gl.MAX_DRAW_BUFFERS);
  const maxColorAttachments = numberParameter(gl, gl.MAX_COLOR_ATTACHMENTS);
  const maxVertexTextureImageUnits = numberParameter(gl, gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
  const multipleRenderTargets = maxDrawBuffers >= 2 && maxColorAttachments >= 2;
  const vertexTextureFetch = maxVertexTextureImageUnits >= 1;
  return Object.freeze({
    particleEffects: Object.freeze({
      metadataState: maxDrawBuffers >= 3 && maxColorAttachments >= 3,
      maxDrawBuffers,
      maxColorAttachments,
    }),
    particleGrid: Object.freeze({
      supported: floatRenderTargets && floatBlend && multipleRenderTargets && vertexTextureFetch,
      floatRenderTargets,
      floatBlend,
      multipleRenderTargets,
      vertexTextureFetch,
      maxDrawBuffers,
      maxColorAttachments,
      maxVertexTextureImageUnits,
    }),
  });
}

function numberParameter(gl: WebGL2RenderingContext, parameter: number): number {
  const value = gl.getParameter(parameter) as unknown;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function validateParticleGridFloatBlend(gl: WebGL2RenderingContext): GpuParticleGridValidation2D {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  const vao = gl.createVertexArray();
  if (!texture || !framebuffer || !vao) {
    if (texture) gl.deleteTexture(texture);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (vao) gl.deleteVertexArray(vao);
    return Object.freeze({ supported: false, reason: 'Unable to allocate particle-grid validation resources' });
  }

  let program: WebGLProgram | undefined;
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      return Object.freeze({ supported: false, reason: 'RGBA32F particle-grid validation framebuffer is incomplete' });
    }

    program = createShaderProgram(gl, {
      label: 'particle-grid float blend validation',
      vertexSource: FLOAT_BLEND_VALIDATION_VERTEX,
      fragmentSource: FLOAT_BLEND_VALIDATION_FRAGMENT,
    });
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, 1);
    gl.drawArrays(gl.POINTS, 0, 1);
    gl.disable(gl.BLEND);

    const pixel = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
    const ok = close(pixel[0] ?? 0, 2) && close(pixel[1] ?? 0, 4)
      && close(pixel[2] ?? 0, 6) && close(pixel[3] ?? 0, 8);
    return Object.freeze({
      supported: ok,
      ...(ok ? {} : { reason: `Float blend validation returned [${Array.from(pixel).map(v => v.toFixed(3)).join(', ')}]` }),
    });
  } catch (error) {
    return Object.freeze({ supported: false, reason: error instanceof Error ? error.message : String(error) });
  } finally {
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (program) gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
  }
}

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.001;
}

const FLOAT_BLEND_VALIDATION_VERTEX = `#version 300 es
void main() {
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const FLOAT_BLEND_VALIDATION_FRAGMENT = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(1.0, 2.0, 3.0, 4.0);
}`;
