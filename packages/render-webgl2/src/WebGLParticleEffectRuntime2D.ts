import type { CompiledParticleProgram2D, Gpu2DService, GpuParticleCommandBatch2D, GpuParticleSystem2D, GpuRenderTarget2D, GpuUniformEncoder2D, GpuUniformLookup2D, ParticleEffectBackendDiagnostics2D, ParticleEffectBackendResource2D, ParticleEffectRuntimeBackend2D, ParticleColliderSet2D, ParticleForceFieldSet2D, ParticleDomain2D, ParticleEmitterSourceOverride2D, ParticleEventParameters2D, ParticleViewport2D, ParticleRenderParameters2D, ParticlePalette2D, ParticleOverflowPolicy2D, ParticleRenderTier2D, ParticleRuntimeEmission2D, ParticleParameterValue2D } from "@hooksjam/gl-game-lab-engine";
import { ParticleEventWindowScheduler2D, planParticleSpawnCommands2D, resolveParticleArchetypePartitions2D } from "@hooksjam/gl-game-lab-engine";

const COMMAND_CAPACITY = 64;
const COMMAND_FLOATS = 16;
const MAX_PALETTE = 8;
const MAX_COLLIDERS = 16;
const MAX_ATTRACTORS = 16;

export interface WebGLParticleEffectRuntimeOptions2D {
  readonly trailFade?: number;
  readonly trailBloom?: number;
  readonly trailBackground?: readonly [number, number, number];
}

export class WebGLParticleEffectRuntimeBackend2D implements ParticleEffectRuntimeBackend2D {
  readonly kind = "webgl2";
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
  private readonly preparedCommands = new Float32Array(COMMAND_CAPACITY * COMMAND_FLOATS);
  private readonly commandImportance = new Int8Array(COMMAND_CAPACITY);
  private readonly poolData: Float32Array;
  private readonly poolCursor: Int32Array;
  private readonly poolQueued: Int32Array;
  private readonly archetypeMotion: Float32Array;
  private readonly archetypeForce: Float32Array;
  private readonly archetypeCollision: Float32Array;
  private readonly emitterSource: Float32Array;
  private readonly emitterInitialization: Float32Array;
  private readonly eventDataA: Float32Array;
  private readonly eventDataB: Float32Array;
  private readonly eventLookup = new Map<string, number>();
  private readonly archetypeSize: Float32Array;
  private readonly archetypeLength: Float32Array;
  private readonly archetypeAlpha: Float32Array;
  private readonly archetypeIntensity: Float32Array;
  private readonly palette = new Float32Array(MAX_PALETTE * 3);
  private readonly circles = new Float32Array(MAX_COLLIDERS * 4);
  private readonly capsuleA = new Float32Array(MAX_COLLIDERS * 4);
  private readonly capsuleB = new Float32Array(MAX_COLLIDERS * 4);
  private readonly attractorData = new Float32Array(MAX_ATTRACTORS * 4);
  private readonly attractorOptions = new Float32Array(MAX_ATTRACTORS * 4);
  private readonly attractorVelocity = new Float32Array(MAX_ATTRACTORS * 4);
  private readonly domainData = new Float32Array(4);
  private readonly domainOptions = new Float32Array([0, 0, 1, 0]);
  private circleCount = 0;
  private capsuleCount = 0;
  private attractorCount = 0;
  private forceFieldRevision = -1;
  private readonly batch: GpuParticleCommandBatch2D;
  private commandCount = 0;
  private preparedCommandCount = 0;
  private particleCount = 0;
  private paletteCount = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private viewportDpr = 1;
  private viewportConfigured = false;
  private pointScale = 2;
  private intensity = 1;
  private trailFade: number;
  private trailBloom: number;
  private trailBackground: readonly [number, number, number];
  private directComposite = true;
  private paletteTransition = 0;
  private colorMode = 0;
  private renderStride = 1;
  private renderPhase = 0;
  private droppedCommands = 0;
  private droppedParticles = 0;
  private truncatedCommands = 0;
  private eventAttempts = 0;
  private eventOccupiedDrops = 0;
  private eventBudgetDrops = 0;
  private readonly eventWindows: ParticleEventWindowScheduler2D;
  private simulationTime = 0;
  private disposed = false;

  constructor(
    gpu: Gpu2DService,
    private readonly id: string,
    private readonly program: CompiledParticleProgram2D,
    capacity: number,
    private readonly options: WebGLParticleEffectRuntimeOptions2D,
  ) {
    this.trailFade = options.trailFade ?? 0.9;
    this.trailBloom = options.trailBloom ?? 0.65;
    this.trailBackground = options.trailBackground ?? [0, 0, 0];
    const renderPasses = Object.fromEntries(
      [
        ...new Set(
          program.renderPasses.enhanced
            .concat(program.renderPasses.ultra)
            .filter((pass) => pass.kind === "streaks")
            .map((pass) => pass.id),
        ),
      ].map((passId) => [
        passId,
        {
          vertexSource: program.webgl2.streakVertex.source,
          fragmentSource: program.webgl2.fragment.source,
          blend: "additive" as const,
          verticesPerParticle: 6,
        },
      ]),
    );
    this.particles = gpu.createParticleSystem(id, {
      capacity,
      precision: "float",
      simulationFragmentSource: program.webgl2.simulation.source,
      ...(program.webgl2.event && program.webgl2.eventClaimVertex && program.webgl2.eventClaimFragment
        ? {
            eventFragmentSource: program.webgl2.event.source,
            eventClaimVertexSource: program.webgl2.eventClaimVertex.source,
            eventClaimFragmentSource: program.webgl2.eventClaimFragment.source,
            eventCandidateLanes: maximumEventCandidateLanes(program),
          }
        : {}),
      particleVertexSource: program.webgl2.vertex.source,
      particleFragmentSource: program.webgl2.fragment.source,
      renderPasses,
      blend: "additive",
      trails: program.renderPasses.ultra.some((pass) => pass.kind === "trails"),
      commandCapacity: COMMAND_CAPACITY,
      metadata: program.reflection.stateTargets === 3,
    });
    this.eventWindows = new ParticleEventWindowScheduler2D(program);
    const partitions = resolveParticleArchetypePartitions2D(program.effect, capacity);
    this.poolData = new Float32Array(Math.max(1, partitions.length) * 4);
    this.poolCursor = new Int32Array(Math.max(1, partitions.length));
    this.poolQueued = new Int32Array(Math.max(1, partitions.length));
    for (const partition of partitions) {
      const offset = partition.archetypeIndex * 4;
      this.poolData[offset] = partition.start;
      this.poolData[offset + 1] = partition.count;
      this.poolData[offset + 2] = overflowPolicyCode(partition.overflow);
      this.poolCursor[partition.archetypeIndex] = partition.start;
    }
    this.archetypeMotion = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeForce = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.archetypeCollision = new Float32Array(Math.max(1, program.effect.source.archetypes.length) * 4);
    this.emitterSource = new Float32Array(Math.max(1, program.effect.source.emitters.length) * 4);
    this.emitterInitialization = new Float32Array(Math.max(1, program.effect.source.emitters.length) * 4);
    const eventCount = program.effect.source.archetypes.reduce((count, archetype) => count + (archetype.events?.length ?? 0), 0);
    this.eventDataA = new Float32Array(Math.max(1, eventCount) * 4);
    this.eventDataB = new Float32Array(Math.max(1, eventCount) * 4);
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
      this.archetypeForce[index * 4 + 2] = archetype.motion.radialFalloff === "inverse-square" ? 2 : archetype.motion.radialFalloff === "inverse" ? 1 : 0;
      this.archetypeForce[index * 4 + 3] = archetype.motion.maxSpeed ?? 0;
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
      this.emitterSource[index * 4] = "radius" in source ? (source.radius ?? 0) : "width" in source ? source.width * 0.5 : 0;
      this.emitterSource[index * 4 + 1] = "innerRadius" in source ? (source.innerRadius ?? ("length" in source ? (source.length ?? 0) : 0)) : "length" in source ? (source.length ?? 0) : "height" in source ? source.height * 0.5 : 0;
      this.emitterSource[index * 4 + 2] = "arc" in source ? (source.arc ?? Math.PI * 2) : Math.PI * 2;
      this.emitterSource[index * 4 + 3] = "spread" in source ? (source.spread ?? 0) : 0;
      const initialization = emitter.initialization,
        mode = initialization?.directionMode;
      this.emitterInitialization.set([mode === "radial" ? 1 : mode === "tangent-ccw" ? 2 : mode === "tangent-cw" ? 3 : 0, initialization?.radialPowerExponent ?? 0, "radius" in source ? (source.radius ?? 1) : 1, initialization?.powerVariability ?? 0.28], index * 4);
    });
    let globalEventIndex = 0;
    program.effect.source.archetypes.forEach((archetype, archetypeIndex) => {
      archetype.events?.forEach((event, eventIndex) => {
        const childIndex = program.effect.archetypeIds[event.childArchetypeId]!, child = program.effect.source.archetypes[childIndex]!;
        this.eventLookup.set(`${archetypeIndex}:${eventIndex}`, globalEventIndex);
        this.eventDataA.set([event.probability, event.count, event.maxGeneration, event.delay ?? 0], globalEventIndex * 4);
        this.eventDataB.set([child.lifecycle.lifetime, event.velocityInheritance ?? 0, event.powerScale ?? 0.35, event.spread ?? Math.PI * 2], globalEventIndex * 4);
        globalEventIndex += 1;
      });
    });
    this.palette.set([1, 1, 1]);
    const owner = this;
    this.batch = Object.freeze({
      get data() {
        return owner.preparedCommands;
      },
      get count() {
        return owner.preparedCommandCount;
      },
      get particleCount() {
        return owner.particleCount;
      },
    });
  }

  emit(emission: ParticleRuntimeEmission2D): void {
    this.assertUsable();
    let index = this.commandCount;
    let replacing = false;
    if (index >= COMMAND_CAPACITY) {
      index = lowestPriorityIndex(this.commandImportance);
      if (emission.importance <= this.commandImportance[index]!) {
        this.droppedCommands += 1;
        this.droppedParticles += emission.count;
        return;
      }
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
    const replacedArchetype = replacing ? Math.max(0, Math.round(this.commands[index * COMMAND_FLOATS] ?? 0)) : archetypeId;
    if (replacing) this.poolQueued[replacedArchetype] = Math.max(0, this.poolQueued[replacedArchetype]! - replacedCount);
    const poolCapacity = Math.max(0, Math.round(this.poolData[archetypeId * 4 + 1] ?? 0));
    const remainingBudget = Math.max(0, poolCapacity - this.poolQueued[archetypeId]!);
    const count = Math.min(emission.count, remainingBudget);
    if (count <= 0) {
      if (replacing) this.poolQueued[replacedArchetype] = this.poolQueued[replacedArchetype]! + replacedCount;
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
    this.commands[offset + 3] = spawnShapeCode(emitter.source.kind) + 32 * Math.round(this.poolData[archetypeId * 4 + 2] ?? 0);
    this.commands[offset + 4] = emission.positionX;
    this.commands[offset + 5] = emission.positionY;
    this.commands[offset + 6] = emission.inheritedVelocityX ?? 0;
    this.commands[offset + 7] = emission.inheritedVelocityY ?? 0;
    this.commands[offset + 8] = emission.direction;
    this.commands[offset + 9] = emission.spread || archetype.spawn.spread;
    this.commands[offset + 10] = emission.power;
    this.commands[offset + 11] = emission.lifetime ?? archetype.lifecycle.lifetime;
    this.commands[offset + 12] = emission.seed;
    this.commands[offset + 13] = 0;
    this.commands[offset + 14] = archetype.lifecycle.lifetimeVariability ?? 0;
    this.commands[offset + 15] = emission.emitterIndex;
    this.particleCount += count - replacedCount;
    this.poolQueued[archetypeId] = this.poolQueued[archetypeId]! + count;
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
      const raw = parameters[binding.parameterId];
      if (typeof raw !== "number") continue;
      const value = raw * (binding.scale ?? 1) + (binding.offset ?? 0),
        parts = binding.target.split(".");
      const archetypeIndex = this.program.effect.archetypeIds[parts[1] ?? ""];
      if (archetypeIndex === undefined) continue;
      const section = parts[2],
        field = parts.slice(3).join(".");
      if (section === "motion") writeBoundMotion(this.archetypeMotion, this.archetypeForce, archetypeIndex, field, value);
      else if (section === "collision") writeBoundCollision(this.archetypeCollision, archetypeIndex, field, value);
      else if (section === "appearance") writeBoundAppearance(this.archetypeSize, this.archetypeLength, this.archetypeAlpha, this.archetypeIntensity, archetypeIndex, field, value);
    }
  }

  setColliders(value: ParticleColliderSet2D): void {
    this.assertUsable();
    this.circles.fill(0);
    this.capsuleA.fill(0);
    this.capsuleB.fill(0);
    this.circleCount = Math.min(MAX_COLLIDERS, value.circles?.length ?? 0);
    this.capsuleCount = Math.min(MAX_COLLIDERS, value.capsules?.length ?? 0);
    for (let index = 0; index < this.circleCount; index += 1) {
      const circle = value.circles![index]!;
      this.circles.set([circle.x, circle.y, circle.radius, circle.mode === "kill" ? 1 : 0], index * 4);
    }
    for (let index = 0; index < this.capsuleCount; index += 1) {
      const capsule = value.capsules![index]!;
      this.capsuleA.set([capsule.ax, capsule.ay, capsule.bx, capsule.by], index * 4);
      this.capsuleB.set([capsule.radius, capsule.mode === "kill" ? 1 : 0, 0, 0], index * 4);
    }
  }

  setForceFields(value: ParticleForceFieldSet2D): void {
    this.assertUsable();
    if (value.revision === this.forceFieldRevision) return;
    this.forceFieldRevision = value.revision;
    this.attractorData.fill(0);
    this.attractorOptions.fill(0);
    this.attractorVelocity.fill(0);
    this.attractorCount = Math.min(MAX_ATTRACTORS, value.attractors.length);
    for (let index = 0; index < this.attractorCount; index += 1) {
      const field = value.attractors[index]!,
        offset = index * 4;
      this.attractorData.set([field.x, field.y, field.strength, field.radius ?? 0], offset);
      this.attractorOptions.set([field.softening ?? 1, forceFalloffCode(field.falloff), field.tangentialStrength ?? 0, forceEnvelopeCode(field.envelope)], offset);
      this.attractorVelocity.set([field.velocity?.[0] ?? 0, field.velocity?.[1] ?? 0, field.velocityCoupling ?? 0, field.radialStrength ?? 0], offset);
    }
  }

  setDomain(value: ParticleDomain2D): void {
    this.assertUsable();
    const extents = value.halfExtents ?? [0, 0];
    this.domainData.set([value.center[0], value.center[1], value.shape === "circle" ? (value.radius ?? 0) : extents[0], value.shape === "circle" ? 0 : extents[1]]);
    this.domainOptions.set([value.shape === "circle" ? 1 : 0, domainBehaviorCode(value.behavior), value.damping ?? 1, value.margin ?? 0]);
  }

  setEmitterSource(emitterIndex: number, value: ParticleEmitterSourceOverride2D): void {
    this.assertUsable();
    const offset = emitterIndex * 4;
    if (offset < 0 || offset + 3 >= this.emitterSource.length) throw new Error(`Invalid particle emitter source index: ${emitterIndex}`);
    if (value.radius !== undefined) this.emitterSource[offset] = value.radius;
    if (value.innerRadius !== undefined) this.emitterSource[offset + 1] = value.innerRadius;
    else if (value.length !== undefined) this.emitterSource[offset + 1] = value.length;
    if (value.arc !== undefined) this.emitterSource[offset + 2] = value.arc;
    if (value.spread !== undefined) this.emitterSource[offset + 3] = value.spread;
  }
  setEventParameters(archetypeIndex: number, eventIndex: number, value: ParticleEventParameters2D): void {
    this.assertUsable();
    const globalIndex = this.eventLookup.get(`${archetypeIndex}:${eventIndex}`);
    if (globalIndex === undefined) throw new Error(`Unknown compiled particle event: ${archetypeIndex}[${eventIndex}]`);
    const offset = globalIndex * 4;
    if (value.probability !== undefined) this.eventDataA[offset] = value.probability;
    if (value.count !== undefined) this.eventDataA[offset + 1] = value.count;
    if (value.maxGeneration !== undefined) this.eventDataA[offset + 2] = value.maxGeneration;
    if (value.delay !== undefined) this.eventDataA[offset + 3] = value.delay;
    if (value.lifetime !== undefined) this.eventDataB[offset] = value.lifetime;
    if (value.velocityInheritance !== undefined) this.eventDataB[offset + 1] = value.velocityInheritance;
    if (value.powerScale !== undefined) this.eventDataB[offset + 2] = value.powerScale;
    if (value.spread !== undefined) this.eventDataB[offset + 3] = value.spread;
  }
  setViewport(value: ParticleViewport2D): void {
    this.assertUsable();
    this.viewportWidth = value.width;
    this.viewportHeight = value.height;
    this.viewportDpr = value.dpr;
    this.viewportConfigured = true;
  }
  setRenderParameters(value: ParticleRenderParameters2D): void {
    this.assertUsable();
    if (value.pointScale !== undefined) this.pointScale = value.pointScale;
    if (value.intensity !== undefined) this.intensity = value.intensity;
    if (value.trailFade !== undefined) this.trailFade = value.trailFade;
    if (value.trailBloom !== undefined) this.trailBloom = value.trailBloom;
    if (value.trailBackground !== undefined) this.trailBackground = value.trailBackground;
    if (value.directComposite !== undefined) this.directComposite = value.directComposite;
    if (value.paletteTransition !== undefined) this.paletteTransition = value.paletteTransition;
    if (value.colorMode !== undefined) this.colorMode = value.colorMode === "over-life" ? 1 : value.colorMode === "generation" ? 2 : value.colorMode === "velocity" ? 3 : 0;
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
    this.commandCount = 0;
    this.preparedCommandCount = 0;
    this.particleCount = 0;
    this.commandImportance.fill(0);
    this.poolQueued.fill(0);
  }

  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    this.assertUsable();
    if (!this.viewportConfigured) {
      this.viewportWidth = target.width;
      this.viewportHeight = target.height;
      this.viewportDpr = 1;
    }
    if (tier === "ultra" && this.program.renderPasses.ultra.some((pass) => pass.kind === "trails")) {
      const trailTarget = this.particles.beginTrails(target.width, target.height, this.trailFade);
      this.renderTier(trailTarget, tier);
      this.particles.compositeTrails(target, this.trailBackground, this.trailBloom);
      if (this.directComposite) this.renderTier(target, tier);
      return;
    }
    this.renderTier(target, tier);
  }

  clear(): void {
    this.assertUsable();
    this.particles.clear();
    this.particles.clearTrails();
    this.commandCount = 0;
    this.preparedCommandCount = 0;
    this.particleCount = 0;
    for (let index = 0; index < this.poolCursor.length; index += 1) {
      this.poolCursor[index] = Math.round(this.poolData[index * 4] ?? 0);
    }
    this.poolQueued.fill(0);
    this.eventWindows.clear();
    this.simulationTime = 0;
  }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean {
    return target instanceof WebGLParticleEffectResource2D && (this.particles.copyStateTo?.(target.particles) ?? false);
  }
  debugReadback(): import("@hooksjam/gl-game-lab-engine").GpuParticleStateSnapshot2D {
    return this.particles.debugReadback();
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
      diagnosticAccuracy: "estimated",
      directCommandsAdmitted: diagnostics.queuedCommands,
      directCommandsTruncated: this.truncatedCommands,
      eventContentionLosses: this.eventOccupiedDrops,
      eventCapacityDrops: this.eventBudgetDrops,
      trailPasses: this.program.renderPasses.ultra.filter((pass) => pass.kind === "trails").length > 0 ? diagnostics.renderPasses : 0,
      bloomPasses: this.program.renderPasses.ultra.filter((pass) => pass.kind === "bloom").length > 0 ? diagnostics.renderPasses : 0,
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.dispose();
  }

  private readonly bindRender = (gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D): void => {
    gl.uniform2f(uniform("uCanvasSize"), this.viewportWidth, this.viewportHeight);
    gl.uniform1i(uniform("uParticleCapacity"), this.particles.capacity);
    gl.uniform1i(uniform("uRenderStride"), this.renderStride);
    gl.uniform1i(uniform("uRenderPhase"), this.renderPhase);
    gl.uniform1f(uniform("uPointScale"), this.pointScale * this.viewportDpr);
    gl.uniform3fv(uniform("uPalette[0]"), this.palette);
    gl.uniform1i(uniform("uPaletteCount"), this.paletteCount);
    gl.uniform1f(uniform("uIntensity"), this.intensity);
    gl.uniform1f(uniform("uPaletteTransition"), this.paletteTransition);
    gl.uniform1i(uniform("uColorMode"), this.colorMode);
    gl.uniform4fv(uniform("uArchetypeSize[0]"), this.archetypeSize);
    gl.uniform4fv(uniform("uArchetypeLength[0]"), this.archetypeLength);
    gl.uniform4fv(uniform("uArchetypeAlpha[0]"), this.archetypeAlpha);
    gl.uniform4fv(uniform("uArchetypeIntensity[0]"), this.archetypeIntensity);
  };

  private bindSimulation(gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D, delta: number): void {
    gl.uniform1i(uniform("uCapacity"), this.particles.capacity);
    gl.uniform1f(uniform("uDt"), delta);
    gl.uniform2f(uniform("uCanvasSize"), this.viewportWidth, this.viewportHeight);
    gl.uniform4fv(uniform("uArchetypeMotion[0]"), this.archetypeMotion);
    gl.uniform4fv(uniform("uArchetypeForce[0]"), this.archetypeForce);
    gl.uniform4fv(uniform("uAttractorData[0]"), this.attractorData);
    gl.uniform4fv(uniform("uAttractorOptions[0]"), this.attractorOptions);
    gl.uniform4fv(uniform("uAttractorVelocity[0]"), this.attractorVelocity);
    gl.uniform1i(uniform("uAttractorCount"), this.attractorCount);
    gl.uniform4fv(uniform("uParticleDomainData"), this.domainData);
    gl.uniform4fv(uniform("uParticleDomainOptions"), this.domainOptions);
    gl.uniform4fv(uniform("uArchetypeCollision[0]"), this.archetypeCollision);
    gl.uniform4fv(uniform("uArchetypePools[0]"), this.poolData);
    gl.uniform4fv(uniform("uParticleEventA[0]"), this.eventDataA);
    gl.uniform4fv(uniform("uParticleEventB[0]"), this.eventDataB);
    gl.uniform4fv(uniform("uEmitterSource[0]"), this.emitterSource);
    gl.uniform4fv(uniform("uEmitterInitialization[0]"), this.emitterInitialization);
    gl.uniform1i(uniform("uCircleColliderCount"), this.circleCount);
    gl.uniform1i(uniform("uCapsuleColliderCount"), this.capsuleCount);
    gl.uniform4fv(uniform("uCircleColliders[0]"), this.circles);
    gl.uniform4fv(uniform("uCapsuleA[0]"), this.capsuleA);
    gl.uniform4fv(uniform("uCapsuleB[0]"), this.capsuleB);
  }

  private prepareCommands(): void {
    const result = planParticleSpawnCommands2D(this.commands, this.commandCount, this.preparedCommands, COMMAND_CAPACITY, this.poolData, this.poolCursor);
    this.preparedCommandCount = result.commandCount;
    this.droppedParticles += result.droppedParticles;
    this.truncatedCommands += result.truncatedCommands;
  }

  private renderTier(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    const passes = this.program.renderPasses[tier];
    const renderCount = Math.ceil(this.particles.capacity / this.renderStride);
    if (passes.some((pass) => pass.kind === "points")) this.particles.render(target, this.bindRender, renderCount);
    for (const pass of passes) if (pass.kind === "streaks") this.particles.renderPass(pass.id, target, this.bindRender, renderCount);
    this.renderPhase = (this.renderPhase + 1) % this.renderStride;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error(`WebGL particle effect resource is disposed: ${this.id}`);
  }
}

function lowestPriorityIndex(priorities: Int8Array): number {
  let result = 0;
  for (let index = 1; index < priorities.length; index += 1) if (priorities[index]! < priorities[result]!) result = index;
  return result;
}

function spawnShapeCode(shape: string): number {
  const index = ["point", "disc", "line", "cone", "arc", "ring", "radial", "spiral", "pinwheel", "shower", "annulus", "rectangle", "path", "texture-mask", "mesh", "particles", "collision-contacts", "external-points", "custom"].indexOf(shape);
  return Math.max(0, index);
}

function overflowPolicyCode(policy: ParticleOverflowPolicy2D): number {
  return policy === "drop-new" ? 1 : policy === "reserve-priority" ? 2 : 0;
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

function maximumEventCandidateLanes(program: CompiledParticleProgram2D): number {
  return Math.max(1, ...program.effect.source.archetypes.map((archetype) => archetype.events?.length ?? 0));
}

function writeCurve(
  target: Float32Array,
  index: number,
  curve: {
    readonly start: number;
    readonly end: number;
    readonly exponent?: number;
  },
): void {
  const offset = index * 4;
  target[offset] = curve.start;
  target[offset + 1] = curve.end;
  target[offset + 2] = curve.exponent ?? 1;
  target[offset + 3] = 0;
}

function writeBoundMotion(motion: Float32Array, force: Float32Array, index: number, field: string, value: number): void {
  const offset = index * 4;
  if (field === "gravity") motion[offset] = value;
  else if (field === "drag") motion[offset + 1] = value;
  else if (field === "turbulence") motion[offset + 2] = value;
  else if (field === "angularVelocity") motion[offset + 3] = value;
  else if (field === "radialAcceleration") force[offset] = value;
  else if (field === "tangentialAcceleration") force[offset + 1] = value;
  else if (field === "maxSpeed") force[offset + 3] = value;
}
function writeBoundCollision(target: Float32Array, index: number, field: string, value: number): void {
  const offset = index * 4;
  if (field === "restitution") target[offset] = value;
  else if (field === "friction") target[offset + 1] = value;
  else if (field === "lifetimeLoss") target[offset + 2] = value;
}
function writeBoundAppearance(size: Float32Array, length: Float32Array, alpha: Float32Array, intensity: Float32Array, index: number, field: string, value: number): void {
  const [curve, component] = field.split(".");
  const target = curve === "size" ? size : curve === "length" ? length : curve === "alpha" ? alpha : curve === "intensity" ? intensity : undefined;
  if (!target) return;
  const slot = component === "start" ? 0 : component === "end" ? 1 : component === "exponent" ? 2 : -1;
  if (slot >= 0) target[index * 4 + slot] = value;
}
