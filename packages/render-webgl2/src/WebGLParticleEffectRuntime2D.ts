import type {
  CompiledParticleProgram2D,
  Gpu2DService,
  GpuParticleCommandBatch2D,
  GpuParticleSystem2D,
  GpuRenderTarget2D,
  GpuUniformEncoder2D,
  GpuUniformLookup2D,
  ParticleEffectBackendDiagnostics2D,
  ParticleEffectBackendResource2D,
  ParticleEffectRuntimeBackend2D,
  ParticlePalette2D,
  ParticleRenderTier2D,
  ParticleRuntimeEmission2D,
} from '@hooksjam/gl-game-lab-engine';

const COMMAND_CAPACITY = 64;
const COMMAND_FLOATS = 16;
const MAX_PALETTE = 8;

export interface WebGLParticleEffectRuntimeOptions2D {
  readonly trailFade?: number;
  readonly trailBloom?: number;
  readonly trailBackground?: readonly [number, number, number];
}

export class WebGLParticleEffectRuntimeBackend2D implements ParticleEffectRuntimeBackend2D {
  readonly kind = 'webgl2';
  private serial = 0;

  constructor(
    private readonly gpu: Gpu2DService,
    private readonly options: WebGLParticleEffectRuntimeOptions2D = {},
  ) {}

  create(program: CompiledParticleProgram2D, capacity: number): ParticleEffectBackendResource2D {
    return new WebGLParticleEffectResource2D(this.gpu, `particle-effect.${program.effect.source.id}.${this.serial++}`, program, capacity, this.options);
  }
}

class WebGLParticleEffectResource2D implements ParticleEffectBackendResource2D {
  private readonly particles: GpuParticleSystem2D;
  private readonly commands = new Float32Array(COMMAND_CAPACITY * COMMAND_FLOATS);
  private readonly commandImportance = new Int8Array(COMMAND_CAPACITY);
  private readonly archetypeMotion: Float32Array;
  private readonly palette = new Float32Array(MAX_PALETTE * 3);
  private readonly batch: GpuParticleCommandBatch2D;
  private commandCount = 0;
  private particleCount = 0;
  private cursor = 0;
  private frameStart = 0;
  private paletteCount = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private droppedCommands = 0;
  private droppedParticles = 0;
  private truncatedCommands = 0;
  private eventAttempts = 0;
  private eventOccupiedDrops = 0;
  private eventBudgetDrops = 0;
  private eventWindow = 0;
  private disposed = false;

  constructor(
    gpu: Gpu2DService,
    private readonly id: string,
    private readonly program: CompiledParticleProgram2D,
    capacity: number,
    private readonly options: WebGLParticleEffectRuntimeOptions2D,
  ) {
    const renderPasses = Object.fromEntries(
      [...new Set(program.renderPasses.enhanced.concat(program.renderPasses.ultra).filter((pass) => pass.kind === 'streaks').map((pass) => pass.id))]
        .map((passId) => [passId, { vertexSource: program.webgl2.vertex.source, fragmentSource: program.webgl2.fragment.source, blend: 'additive' as const, verticesPerParticle: 1 }]),
    );
    this.particles = gpu.createParticleSystem(id, {
      capacity,
      precision: 'float',
      simulationFragmentSource: program.webgl2.simulation.source,
      ...(program.webgl2.event ? { eventFragmentSource: program.webgl2.event.source } : {}),
      particleVertexSource: program.webgl2.vertex.source,
      particleFragmentSource: program.webgl2.fragment.source,
      renderPasses,
      blend: 'additive',
      trails: program.renderPasses.ultra.some((pass) => pass.kind === 'trails'),
      commandCapacity: COMMAND_CAPACITY,
      metadata: program.reflection.stateTargets === 3,
    });
    this.archetypeMotion = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    program.effect.source.archetypes.forEach((archetype, index) => {
      this.archetypeMotion[index * 4] = archetype.motion.gravity;
      this.archetypeMotion[index * 4 + 1] = archetype.motion.drag;
      this.archetypeMotion[index * 4 + 2] = archetype.motion.turbulence ?? 0;
      this.archetypeMotion[index * 4 + 3] = archetype.motion.angularVelocity ?? 0;
    });
    this.palette.set([1, 1, 1]);
    const owner = this;
    this.batch = Object.freeze({
      get data() { return owner.commands; },
      get count() { return owner.commandCount; },
      get particleCount() { return owner.particleCount; },
    });
  }

  emit(emission: ParticleRuntimeEmission2D): void {
    this.assertUsable();
    let index = this.commandCount;
    let replacing = false;
    if (index >= COMMAND_CAPACITY) {
      index = lowestPriorityIndex(this.commandImportance);
      if (emission.importance <= this.commandImportance[index]!) { this.droppedCommands += 1; this.droppedParticles += emission.count; return; }
      replacing = true;
      this.droppedCommands += 1;
      this.droppedParticles += Math.max(0, Math.round(this.commands[index * COMMAND_FLOATS + 2] ?? 0));
    } else this.commandCount += 1;
    this.commandImportance[index] = emission.importance;
    const emitter = this.program.effect.source.emitters[emission.emitterIndex];
    if (!emitter) throw new Error(`Particle runtime emission references invalid emitter ${emission.emitterIndex}`);
    const archetypeId = this.program.effect.archetypeIds[emitter.archetypeId];
    const archetype = this.program.effect.source.archetypes[archetypeId ?? -1];
    if (archetypeId === undefined || !archetype) throw new Error(`Particle emitter references invalid archetype ${emitter.archetypeId}`);
    const replacedCount = replacing ? Math.max(0, Math.round(this.commands[index * COMMAND_FLOATS + 2] ?? 0)) : 0;
    const remainingBudget = Math.max(0, this.particles.capacity - (this.particleCount - replacedCount));
    const count = Math.min(emission.count, remainingBudget);
    if (count <= 0) {
      this.droppedCommands += 1;
      this.droppedParticles += emission.count;
      return;
    }
    const offset = index * COMMAND_FLOATS;
    this.commands[offset] = archetypeId;
    // Prefix starts are assigned immediately before upload, after any priority
    // replacement has settled. This field is deliberately temporary here.
    this.commands[offset + 1] = 0;
    this.commands[offset + 2] = count;
    this.commands[offset + 3] = spawnShapeCode(emitter.source.kind);
    this.commands[offset + 4] = emission.positionX;
    this.commands[offset + 5] = emission.positionY;
    this.commands[offset + 6] = 0;
    this.commands[offset + 7] = 0;
    this.commands[offset + 8] = emission.direction;
    this.commands[offset + 9] = emission.spread || archetype.spawn.spread;
    this.commands[offset + 10] = emission.power;
    this.commands[offset + 11] = archetype.lifecycle.lifetime;
    this.commands[offset + 12] = emission.seed;
    this.commands[offset + 13] = emission.seed / 0x1_0000_0000;
    this.commands[offset + 14] = archetype.lifecycle.lifetimeVariability ?? 0;
    this.commands[offset + 15] = 0;
    this.particleCount += count - replacedCount;
    this.droppedParticles += emission.count - count;
    if (count < emission.count) this.truncatedCommands += 1;
    if ((archetype.events?.length ?? 0) > 0) this.eventWindow = Math.max(this.eventWindow, eventWindowSeconds(archetype));
  }

  setPalette(value: ParticlePalette2D): void {
    this.assertUsable();
    this.palette.fill(0);
    this.paletteCount = Math.max(1, Math.min(MAX_PALETTE, value.colors.length));
    for (let index = 0; index < this.paletteCount; index += 1) {
      const color = value.colors[index] ?? [1, 1, 1];
      this.palette.set(color, index * 3);
    }
  }

  update(deltaSeconds: number, timescale: number): void {
    this.assertUsable();
    this.prepareCommands();
    this.particles.stepBatch(this.batch, (gl, uniform) => this.bindSimulation(gl, uniform, deltaSeconds * timescale));
    if (this.eventWindow > 0 && this.program.webgl2.event) {
      this.particles.stepEvents((gl, uniform) => this.bindSimulation(gl, uniform, deltaSeconds * timescale));
      this.eventWindow = Math.max(0, this.eventWindow - deltaSeconds * timescale);
    }
    this.cursor = (this.frameStart + this.particleCount) % this.particles.capacity;
    this.commandCount = 0;
    this.particleCount = 0;
    this.commandImportance.fill(0);
  }

  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    this.assertUsable();
    this.viewportWidth = target.width;
    this.viewportHeight = target.height;
    if (tier === 'ultra' && this.program.renderPasses.ultra.some((pass) => pass.kind === 'trails')) {
      const trailTarget = this.particles.beginTrails(target.width, target.height, this.options.trailFade ?? 0.9);
      this.particles.render(trailTarget, this.bindRender);
      this.particles.compositeTrails(target, this.options.trailBackground ?? [0, 0, 0], this.options.trailBloom ?? 0.65);
      this.particles.render(target, this.bindRender);
      return;
    }
    this.particles.render(target, this.bindRender);
  }

  clear(): void { this.assertUsable(); this.particles.clear(); this.particles.clearTrails(); this.commandCount = 0; this.particleCount = 0; this.cursor = 0; this.eventWindow = 0; }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean {
    return target instanceof WebGLParticleEffectResource2D && (this.particles.copyStateTo?.(target.particles) ?? false);
  }

  diagnostics(): ParticleEffectBackendDiagnostics2D {
    const diagnostics = this.particles.diagnostics();
    return Object.freeze({
      capacity: this.particles.capacity,
      activeEstimate: Math.min(this.particles.capacity, diagnostics.spawnedParticles),
      queuedCommands: diagnostics.queuedCommands,
      droppedCommands: diagnostics.droppedCommands + this.droppedCommands,
      spawnedParticles: diagnostics.spawnedParticles,
      droppedParticles: this.droppedParticles,
      eventCount: diagnostics.eventPasses,
      simulationPasses: diagnostics.simulationPasses,
      renderPasses: diagnostics.renderPasses,
      uploadBytes: diagnostics.uploadBytes,
      contextGeneration: diagnostics.contextGeneration,
      rebuildCount: diagnostics.rebuildCount,
      diagnosticAccuracy: 'estimated',
      directCommandsAdmitted: diagnostics.queuedCommands,
      directCommandsTruncated: this.truncatedCommands,
      eventContentionLosses: this.eventOccupiedDrops,
      eventCapacityDrops: this.eventBudgetDrops,
      trailPasses: this.program.renderPasses.ultra.filter((pass) => pass.kind === 'trails').length > 0 ? diagnostics.renderPasses : 0,
      bloomPasses: this.program.renderPasses.ultra.filter((pass) => pass.kind === 'bloom').length > 0 ? diagnostics.renderPasses : 0,
      commandUploadBytes: diagnostics.uploadBytes,
      parameterUploadBytes: 0,
      paletteUploadBytes: 0,
      allocationsAfterWarmup: 0,
      allocatedBytes: this.particles.capacity * 4 * Float32Array.BYTES_PER_ELEMENT * this.program.reflection.stateTargets * 2,
      eventAttempts: this.eventAttempts,
      eventOccupiedDrops: this.eventOccupiedDrops,
      eventBudgetDrops: this.eventBudgetDrops,
    });
  }

  dispose(): void { if (this.disposed) return; this.disposed = true; this.particles.dispose(); }

  private readonly bindRender = (gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D): void => {
    gl.uniform2f(uniform('uCanvasSize'), this.viewportWidth, this.viewportHeight);
    gl.uniform1i(uniform('uParticleCapacity'), this.particles.capacity);
    gl.uniform1f(uniform('uPointScale'), 2);
    gl.uniform3fv(uniform('uPalette[0]'), this.palette);
    gl.uniform1i(uniform('uPaletteCount'), this.paletteCount);
    gl.uniform1f(uniform('uIntensity'), 1);
  };

  private bindSimulation(gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D, delta: number): void {
    gl.uniform1i(uniform('uCapacity'), this.particles.capacity);
    gl.uniform1f(uniform('uDt'), delta);
    gl.uniform2f(uniform('uCanvasSize'), this.viewportWidth, this.viewportHeight);
    gl.uniform4fv(uniform('uArchetypeMotion[0]'), this.archetypeMotion);
    gl.uniform1i(uniform('uParticleCommandFrameStart'), this.frameStart);
  }

  private prepareCommands(): void {
    this.frameStart = this.cursor;
    let prefix = 0;
    for (let index = 0; index < this.commandCount; index += 1) {
      const offset = index * COMMAND_FLOATS;
      this.commands[offset + 1] = prefix;
      prefix += Math.max(0, Math.round(this.commands[offset + 2] ?? 0));
    }
  }

  private assertUsable(): void { if (this.disposed) throw new Error(`WebGL particle effect resource is disposed: ${this.id}`); }
}

function lowestPriorityIndex(priorities: Int8Array): number {
  let result = 0;
  for (let index = 1; index < priorities.length; index += 1) if (priorities[index]! < priorities[result]!) result = index;
  return result;
}

function spawnShapeCode(shape: string): number {
  const index = ['point', 'disc', 'line', 'cone', 'arc', 'ring', 'radial', 'spiral', 'pinwheel', 'shower', 'rectangle', 'path', 'texture-mask', 'mesh', 'particles', 'collision-contacts', 'external-points', 'custom'].indexOf(shape);
  return Math.max(0, index);
}

function eventWindowSeconds(archetype: CompiledParticleProgram2D['effect']['source']['archetypes'][number]): number {
  let latest = archetype.lifecycle.lifetime * (1 + (archetype.lifecycle.lifetimeVariability ?? 0));
  for (const event of archetype.events ?? []) latest = Math.max(latest, archetype.lifecycle.lifetime + (event.delay ?? 0));
  return latest;
}
