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
  ParticleColliderSet2D,
  ParticlePalette2D,
  ParticleRenderTier2D,
  ParticleRuntimeEmission2D,
  ParticleParameterValue2D,
} from '@hooksjam/gl-game-lab-engine';
import { ParticleEventWindowScheduler } from './ParticleEventWindowScheduler.js';

const COMMAND_CAPACITY = 64;
const COMMAND_FLOATS = 16;
const MAX_PALETTE = 8;
const MAX_COLLIDERS = 16;

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
  private readonly archetypeForce: Float32Array;
  private readonly archetypeCollision: Float32Array;
  private readonly emitterSource: Float32Array;
  private readonly archetypeSize: Float32Array;
  private readonly archetypeLength: Float32Array;
  private readonly archetypeAlpha: Float32Array;
  private readonly archetypeIntensity: Float32Array;
  private readonly palette = new Float32Array(MAX_PALETTE * 3);
  private readonly circles = new Float32Array(MAX_COLLIDERS * 4);
  private readonly capsuleA = new Float32Array(MAX_COLLIDERS * 4);
  private readonly capsuleB = new Float32Array(MAX_COLLIDERS * 4);
  private circleCount = 0;
  private capsuleCount = 0;
  private readonly batch: GpuParticleCommandBatch2D;
  private commandCount = 0;
  private particleCount = 0;
  private cursor = 0;
  private frameStart = 0;
  private paletteCount = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private renderStride = 1;
  private renderPhase = 0;
  private droppedCommands = 0;
  private droppedParticles = 0;
  private truncatedCommands = 0;
  private eventAttempts = 0;
  private eventOccupiedDrops = 0;
  private eventBudgetDrops = 0;
  private readonly eventWindows: ParticleEventWindowScheduler;
  private simulationTime = 0;
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
        .map((passId) => [passId, { vertexSource: program.webgl2.streakVertex.source, fragmentSource: program.webgl2.fragment.source, blend: 'additive' as const, verticesPerParticle: 6 }]),
    );
    this.particles = gpu.createParticleSystem(id, {
      capacity,
      precision: 'float',
      simulationFragmentSource: program.webgl2.simulation.source,
      ...(program.webgl2.event && program.webgl2.eventClaimVertex && program.webgl2.eventClaimFragment ? {
        eventFragmentSource: program.webgl2.event.source,
        eventClaimVertexSource: program.webgl2.eventClaimVertex.source,
        eventClaimFragmentSource: program.webgl2.eventClaimFragment.source,
        eventCandidateLanes: maximumEventCandidateLanes(program),
      } : {}),
      particleVertexSource: program.webgl2.vertex.source,
      particleFragmentSource: program.webgl2.fragment.source,
      renderPasses,
      blend: 'additive',
      trails: program.renderPasses.ultra.some((pass) => pass.kind === 'trails'),
      commandCapacity: COMMAND_CAPACITY,
      metadata: program.reflection.stateTargets === 3,
    });
    this.eventWindows = new ParticleEventWindowScheduler(program);
    this.archetypeMotion = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeForce = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeCollision = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.emitterSource = new Float32Array(Math.max(1, program.effect.source.emitters.length) * 4);
    this.archetypeSize = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeLength = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeAlpha = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeIntensity = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    program.effect.source.archetypes.forEach((archetype, index) => {
      this.archetypeMotion[index * 4] = archetype.motion.gravity;
      this.archetypeMotion[index * 4 + 1] = archetype.motion.drag;
      this.archetypeMotion[index * 4 + 2] = archetype.motion.turbulence ?? 0;
      this.archetypeMotion[index * 4 + 3] = archetype.motion.angularVelocity ?? 0;
      this.archetypeForce[index * 4] = archetype.motion.radialAcceleration ?? 0;
      this.archetypeForce[index * 4 + 1] = archetype.motion.tangentialAcceleration ?? 0;
      this.archetypeForce[index * 4 + 2] = archetype.motion.radialFalloff === 'inverse-square' ? 2 : archetype.motion.radialFalloff === 'inverse' ? 1 : 0;
      const collision = archetype.collision;
      this.archetypeCollision[index * 4] = collision?.restitution ?? 0;
      this.archetypeCollision[index * 4 + 1] = collision?.friction ?? 0;
      this.archetypeCollision[index * 4 + 2] = collision?.lifetimeLoss ?? 0;
      this.archetypeCollision[index * 4 + 3] = (collision?.bounds ? 1 : 0) + (collision?.circles ? 2 : 0) + (collision?.capsules ? 4 : 0);
      writeCurve(this.archetypeSize, index, archetype.appearance.size);
      writeCurve(this.archetypeLength, index, archetype.appearance.length ?? archetype.appearance.size);
      writeCurve(this.archetypeAlpha, index, archetype.appearance.alpha);
      writeCurve(this.archetypeIntensity, index, archetype.appearance.intensity);
    });
    program.effect.source.emitters.forEach((emitter, index) => {
      const source = emitter.source;
      this.emitterSource[index * 4] = 'radius' in source ? source.radius ?? 0 : 'width' in source ? source.width * 0.5 : 0;
      this.emitterSource[index * 4 + 1] = 'length' in source ? source.length ?? 0 : 'height' in source ? source.height * 0.5 : 0;
      this.emitterSource[index * 4 + 2] = 'arc' in source ? source.arc ?? Math.PI * 2 : Math.PI * 2;
      this.emitterSource[index * 4 + 3] = 'spread' in source ? source.spread ?? 0 : 0;
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
    this.commands[offset + 6] = emission.inheritedVelocityX ?? 0;
    this.commands[offset + 7] = emission.inheritedVelocityY ?? 0;
    this.commands[offset + 8] = emission.direction;
    this.commands[offset + 9] = emission.spread || archetype.spawn.spread;
    this.commands[offset + 10] = emission.power;
    this.commands[offset + 11] = archetype.lifecycle.lifetime;
    this.commands[offset + 12] = emission.seed;
    this.commands[offset + 13] = emission.seed / 0x1_0000_0000;
    this.commands[offset + 14] = archetype.lifecycle.lifetimeVariability ?? 0;
    this.commands[offset + 15] = emission.emitterIndex;
    this.particleCount += count - replacedCount;
    this.droppedParticles += emission.count - count;
    if (count < emission.count) this.truncatedCommands += 1;
    if ((archetype.events?.length ?? 0) > 0) {
      this.eventWindows.schedule(archetypeId, this.simulationTime);
    }
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

  setParameters(parameters: Readonly<Record<string, ParticleParameterValue2D>>): void {
    for (const binding of this.program.effect.source.moduleBindings ?? []) {
      const raw=parameters[binding.parameterId]; if(typeof raw!=='number')continue;
      const value=raw*(binding.scale??1)+(binding.offset??0), parts=binding.target.split('.');
      const archetypeIndex=this.program.effect.archetypeIds[parts[1]??'']; if(archetypeIndex===undefined)continue;
      const section=parts[2],field=parts.slice(3).join('.');
      if(section==='motion') writeBoundMotion(this.archetypeMotion,this.archetypeForce,archetypeIndex,field,value);
      else if(section==='collision') writeBoundCollision(this.archetypeCollision,archetypeIndex,field,value);
      else if(section==='appearance') writeBoundAppearance(this.archetypeSize,this.archetypeLength,this.archetypeAlpha,this.archetypeIntensity,archetypeIndex,field,value);
    }
  }

  setColliders(value: ParticleColliderSet2D): void {
    this.assertUsable(); this.circles.fill(0); this.capsuleA.fill(0); this.capsuleB.fill(0);
    this.circleCount = Math.min(MAX_COLLIDERS, value.circles?.length ?? 0);
    this.capsuleCount = Math.min(MAX_COLLIDERS, value.capsules?.length ?? 0);
    for (let index = 0; index < this.circleCount; index += 1) { const circle=value.circles![index]!; this.circles.set([circle.x,circle.y,circle.radius,circle.mode==='kill'?1:0],index*4); }
    for (let index = 0; index < this.capsuleCount; index += 1) { const capsule=value.capsules![index]!; this.capsuleA.set([capsule.ax,capsule.ay,capsule.bx,capsule.by],index*4); this.capsuleB.set([capsule.radius,capsule.mode==='kill'?1:0,0,0],index*4); }
  }

  setRenderScale(scale: number): void {
    this.assertUsable();
    this.renderStride = Math.max(1, Math.min(16, Math.round(1 / scale)));
    this.renderPhase %= this.renderStride;
  }

  update(deltaSeconds: number, timescale: number): void {
    this.assertUsable();
    this.simulationTime += deltaSeconds * timescale;
    this.prepareCommands();
    this.particles.stepBatch(this.batch, (gl, uniform) => this.bindSimulation(gl, uniform, deltaSeconds * timescale));
    if (this.eventWindows.hasActiveWindow(this.simulationTime) && this.program.webgl2.event) {
      this.particles.stepEvents((gl, uniform) => this.bindSimulation(gl, uniform, deltaSeconds * timescale));
    }
    this.eventWindows.compact(this.simulationTime);
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
      this.renderTier(trailTarget, tier);
      this.particles.compositeTrails(target, this.options.trailBackground ?? [0, 0, 0], this.options.trailBloom ?? 0.65);
      this.renderTier(target, tier);
      return;
    }
    this.renderTier(target, tier);
  }

  clear(): void {
    this.assertUsable();
    this.particles.clear();
    this.particles.clearTrails();
    this.commandCount = 0;
    this.particleCount = 0;
    this.cursor = 0;
    this.eventWindows.clear();
    this.simulationTime = 0;
  }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean {
    return target instanceof WebGLParticleEffectResource2D && (this.particles.copyStateTo?.(target.particles) ?? false);
  }
  debugReadback(): import('@hooksjam/gl-game-lab-engine').GpuParticleStateSnapshot2D { return this.particles.debugReadback(); }

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
    gl.uniform1i(uniform('uRenderStride'), this.renderStride);
    gl.uniform1i(uniform('uRenderPhase'), this.renderPhase);
    gl.uniform1f(uniform('uPointScale'), 2);
    gl.uniform3fv(uniform('uPalette[0]'), this.palette);
    gl.uniform1i(uniform('uPaletteCount'), this.paletteCount);
    gl.uniform1f(uniform('uIntensity'), 1);
    gl.uniform4fv(uniform('uArchetypeSize[0]'), this.archetypeSize);
    gl.uniform4fv(uniform('uArchetypeLength[0]'), this.archetypeLength);
    gl.uniform4fv(uniform('uArchetypeAlpha[0]'), this.archetypeAlpha);
    gl.uniform4fv(uniform('uArchetypeIntensity[0]'), this.archetypeIntensity);
  };

  private bindSimulation(gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D, delta: number): void {
    gl.uniform1i(uniform('uCapacity'), this.particles.capacity);
    gl.uniform1f(uniform('uDt'), delta);
    gl.uniform2f(uniform('uCanvasSize'), this.viewportWidth, this.viewportHeight);
    gl.uniform4fv(uniform('uArchetypeMotion[0]'), this.archetypeMotion);
    gl.uniform4fv(uniform('uArchetypeForce[0]'), this.archetypeForce);
    gl.uniform4fv(uniform('uArchetypeCollision[0]'), this.archetypeCollision);
    gl.uniform4fv(uniform('uEmitterSource[0]'), this.emitterSource);
    gl.uniform1i(uniform('uCircleColliderCount'), this.circleCount);
    gl.uniform1i(uniform('uCapsuleColliderCount'), this.capsuleCount);
    gl.uniform4fv(uniform('uCircleColliders[0]'), this.circles);
    gl.uniform4fv(uniform('uCapsuleA[0]'), this.capsuleA);
    gl.uniform4fv(uniform('uCapsuleB[0]'), this.capsuleB);
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

  private renderTier(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    const passes = this.program.renderPasses[tier];
    const renderCount = Math.ceil(this.particles.capacity / this.renderStride);
    if (passes.some((pass) => pass.kind === 'points')) this.particles.render(target, this.bindRender, renderCount);
    for (const pass of passes) if (pass.kind === 'streaks') this.particles.renderPass(pass.id, target, this.bindRender, renderCount);
    this.renderPhase = (this.renderPhase + 1) % this.renderStride;
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

function maximumEventCandidateLanes(program: CompiledParticleProgram2D): number { return Math.max(1, ...program.effect.source.archetypes.map((archetype) => archetype.events?.length ?? 0)); }

function writeCurve(target: Float32Array, index: number, curve: { readonly start: number; readonly end: number; readonly exponent?: number }): void {
  const offset = index * 4; target[offset] = curve.start; target[offset + 1] = curve.end; target[offset + 2] = curve.exponent ?? 1; target[offset + 3] = 0;
}

function writeBoundMotion(motion: Float32Array, force: Float32Array, index: number, field: string, value: number): void { const offset=index*4;if(field==='gravity')motion[offset]=value;else if(field==='drag')motion[offset+1]=value;else if(field==='turbulence')motion[offset+2]=value;else if(field==='angularVelocity')motion[offset+3]=value;else if(field==='radialAcceleration')force[offset]=value;else if(field==='tangentialAcceleration')force[offset+1]=value; }
function writeBoundCollision(target: Float32Array,index:number,field:string,value:number):void{const offset=index*4;if(field==='restitution')target[offset]=value;else if(field==='friction')target[offset+1]=value;else if(field==='lifetimeLoss')target[offset+2]=value;}
function writeBoundAppearance(size:Float32Array,length:Float32Array,alpha:Float32Array,intensity:Float32Array,index:number,field:string,value:number):void{const [curve,component]=field.split('.');const target=curve==='size'?size:curve==='length'?length:curve==='alpha'?alpha:curve==='intensity'?intensity:undefined;if(!target)return;const slot=component==='start'?0:component==='end'?1:component==='exponent'?2:-1;if(slot>=0)target[index*4+slot]=value;}
