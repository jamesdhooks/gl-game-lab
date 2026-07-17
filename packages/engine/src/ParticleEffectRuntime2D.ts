import { resolveParticleParameters2D } from "./ParticleEffectAuthoring2D.js";
import { compileParticleEffect2D, type ParticleEffectGraph2D } from "./ParticleEffectGraph2D.js";
import { compileParticleProgram2D, type ParticleModuleCompilerExtension2D } from "./ParticleEffectCompiler2D.js";
import type { CompiledParticleProgram2D } from "./ParticleEffectCompiler2D.js";
import type { ParticleEmitterDefinition2D, ParticleEmitterStopMode2D, ParticleParameterValue2D } from "./ParticleEffectGraph2D.js";
import type { ParticleEffectDiagnostics2D, ParticlePalette2D, ParticleRenderTier2D } from "./ParticleEffects2D.js";
import type { GpuParticleStateSnapshot2D, GpuRenderTarget2D } from "./Gpu2D.js";
import { ParticleGraphScheduler2D } from "./ParticleGraphScheduler2D.js";

export type ParticleEffectInstanceStatus2D = "idle" | "running" | "paused" | "draining" | "complete" | "disposed";

export interface ParticleTransform2D {
  readonly position: readonly [number, number];
  readonly rotation: number;
  readonly scale: readonly [number, number];
}

export interface ParticleEffectInstanceOptions2D {
  readonly seed?: number;
  readonly transform?: ParticleTransform2D;
  readonly parameters?: Readonly<Record<string, ParticleParameterValue2D>>;
  readonly palette?: ParticlePalette2D;
  readonly timescale?: number;
  readonly qualityTier?: ParticleRenderTier2D;
  readonly preview?: boolean;
  readonly adaptiveLod?: boolean;
  readonly adaptiveTargetFps?: 30 | 45 | 60;
}

export interface ParticleEmissionOverride2D {
  readonly count?: number;
  readonly position?: readonly [number, number];
  readonly direction?: number;
  readonly spread?: number;
  readonly power?: number;
  readonly seed?: number;
  readonly inheritedVelocity?: readonly [number, number];
  readonly lifetime?: number;
  readonly lifetimeVariability?: number;
}

export interface ParticleEmitterSourceOverride2D {
  readonly radius?: number;
  readonly innerRadius?: number;
  readonly length?: number;
  readonly arc?: number;
  readonly spread?: number;
}

/** Reusable command writer for allocation-free emission in frame loops. */
export interface ParticleEmissionWriter2D {
  count(value: number): ParticleEmissionWriter2D;
  position(x: number, y: number): ParticleEmissionWriter2D;
  direction(value: number): ParticleEmissionWriter2D;
  spread(value: number): ParticleEmissionWriter2D;
  power(value: number): ParticleEmissionWriter2D;
  seed(value: number): ParticleEmissionWriter2D;
  inheritedVelocity(x: number, y: number): ParticleEmissionWriter2D;
  lifetime(value: number): ParticleEmissionWriter2D;
  lifetimeVariability(value: number): ParticleEmissionWriter2D;
  submit(): void;
  reset(): ParticleEmissionWriter2D;
}

export interface ParticleEmitterHandle2D {
  readonly id: string;
  emit(count?: number): void;
  emitAt(x: number, y: number, count?: number): void;
  writer(): ParticleEmissionWriter2D;
}

export interface ParticleSignalPayload2D {
  readonly position?: readonly [number, number];
  readonly velocity?: readonly [number, number];
  readonly value?: number;
}

export interface ParticleCircleCollider2D {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly mode?: "bounce" | "kill";
}
export interface ParticleCapsuleCollider2D {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly radius: number;
  readonly mode?: "bounce" | "kill";
}
export interface ParticleColliderSet2D {
  readonly circles?: readonly ParticleCircleCollider2D[];
  readonly capsules?: readonly ParticleCapsuleCollider2D[];
  readonly revision: number;
}

export type ParticleForceFalloff2D = "constant" | "inverse" | "inverse-square";
export type ParticleForceEnvelope2D = "none" | "linear" | "smooth";
export interface ParticleAttractor2D {
  readonly x: number;
  readonly y: number;
  /** Multiplies the archetype radial/tangential force; negative values repel. */
  readonly strength: number;
  /** Minimum force distance in logical pixels, preventing singularities. */
  readonly softening?: number;
  /** Overrides the archetype falloff for this attractor when supplied. */
  readonly falloff?: ParticleForceFalloff2D;
  /** Additional tangential acceleration independent of the archetype profile. */
  readonly tangentialStrength?: number;
  /** Direct radial acceleration added after archetype-scaled strength. */
  readonly radialStrength?: number;
  /** Finite influence radius. Omit or use zero for an unbounded field. */
  readonly radius?: number;
  /** Attenuation from the center to the finite radius. */
  readonly envelope?: ParticleForceEnvelope2D;
  /** Optional target velocity injected by moving/drag fields. */
  readonly velocity?: readonly [number, number];
  /** Per-second coupling toward `velocity`, multiplied by the envelope. */
  readonly velocityCoupling?: number;
}
export interface ParticleForceFieldSet2D {
  readonly attractors: readonly ParticleAttractor2D[];
  readonly revision: number;
}

export type ParticleDomainShape2D = "rectangle" | "circle";
export type ParticleDomainBehavior2D = "none" | "kill" | "bounce" | "wrap";
export interface ParticleDomain2D {
  readonly revision: number;
  readonly shape: ParticleDomainShape2D;
  readonly behavior: ParticleDomainBehavior2D;
  readonly center: readonly [number, number];
  /** Rectangle half-extents. Required for rectangle domains. */
  readonly halfExtents?: readonly [number, number];
  /** Circle radius. Required for circle domains. */
  readonly radius?: number;
  readonly margin?: number;
  /** Retained velocity/position scale after bounce or wrap. */
  readonly damping?: number;
}
export interface ParticleViewport2D {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}
export interface ParticleRenderParameters2D {
  readonly pointScale?: number;
  readonly intensity?: number;
  readonly trailFade?: number;
  readonly trailBloom?: number;
  readonly trailBackground?: readonly [number, number, number];
  readonly directComposite?: boolean;
  readonly paletteTransition?: number;
  readonly streakScale?: number;
  readonly colorMode?: "seeded" | "over-life" | "generation" | "velocity";
}
export interface ParticleEventParameters2D {
  readonly probability?: number;
  readonly count?: number;
  readonly maxGeneration?: number;
  readonly delay?: number;
  readonly lifetime?: number;
  readonly velocityInheritance?: number;
  readonly powerScale?: number;
  readonly spread?: number;
  readonly minimumSpeed?: number;
  readonly countSpeedScale?: number;
  readonly speedReference?: number;
  readonly basePower?: number;
  readonly lifetimeVariability?: number;
  readonly powerVariability?: number;
}

export interface ParticleRuntimeEmission2D {
  readonly instanceId: number;
  readonly emitterIndex: number;
  readonly count: number;
  readonly positionX: number;
  readonly positionY: number;
  readonly direction: number;
  readonly spread: number;
  readonly power: number;
  readonly seed: number;
  readonly importance: number;
  readonly inheritedVelocityX?: number;
  readonly inheritedVelocityY?: number;
  readonly lifetime?: number | undefined;
  readonly lifetimeVariability?: number | undefined;
}

export interface ParticleEffectBackendDiagnostics2D extends ParticleEffectDiagnostics2D {
  readonly allocatedBytes: number;
  readonly eventAttempts: number;
  readonly eventOccupiedDrops: number;
  readonly eventBudgetDrops: number;
  readonly backendFallbackCount?: number;
  readonly validationFailures?: number;
  readonly diagnosticAccuracy?: "exact" | "delayed" | "estimated";
}

export interface ParticleEffectBackendResource2D {
  emit(emission: ParticleRuntimeEmission2D): void;
  setPalette(palette: ParticlePalette2D): void;
  setParameters?(parameters: Readonly<Record<string, ParticleParameterValue2D>>): void;
  setColliders?(colliders: ParticleColliderSet2D): void;
  setForceFields?(fields: ParticleForceFieldSet2D): void;
  setDomain?(domain: ParticleDomain2D): void;
  setEmitterSource?(emitterIndex: number, source: ParticleEmitterSourceOverride2D): void;
  setEventParameters?(archetypeIndex: number, eventIndex: number, parameters: ParticleEventParameters2D): void;
  setViewport?(viewport: ParticleViewport2D): void;
  setRenderParameters?(parameters: ParticleRenderParameters2D): void;
  setRenderScale?(scale: number): void;
  setDetailedDiagnostics?(enabled: boolean): void;
  update(deltaSeconds: number, timescale: number): void;
  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void;
  clear(): void;
  transferStateTo?(target: ParticleEffectBackendResource2D): boolean;
  debugReadback?(): GpuParticleStateSnapshot2D;
  diagnostics(): ParticleEffectBackendDiagnostics2D;
  dispose(): void;
}

export interface ParticleEffectRuntimeBackend2D {
  readonly kind: "webgl2" | "webgpu" | "test";
  create(program: CompiledParticleProgram2D, capacity: number): ParticleEffectBackendResource2D;
}

/** Capability/failure wrapper used for internal WebGPU -> WebGL2 fallback. */
export class FallbackParticleEffectRuntimeBackend2D implements ParticleEffectRuntimeBackend2D {
  readonly kind: ParticleEffectRuntimeBackend2D["kind"];
  constructor(
    private readonly preferred: ParticleEffectRuntimeBackend2D,
    private readonly fallback: ParticleEffectRuntimeBackend2D,
  ) {
    this.kind = preferred.kind;
  }
  create(program: CompiledParticleProgram2D, capacity: number): ParticleEffectBackendResource2D {
    try {
      return new RecoveringParticleEffectBackendResource2D(program, capacity, this.preferred, this.fallback);
    } catch {
      return new RecoveringParticleEffectBackendResource2D(program, capacity, this.fallback, this.fallback, 1);
    }
  }
}

class RecoveringParticleEffectBackendResource2D implements ParticleEffectBackendResource2D {
  private resource: ParticleEffectBackendResource2D;
  private fallbackCount: number;
  private failed = false;
  constructor(
    private readonly program: CompiledParticleProgram2D,
    private readonly capacity: number,
    preferred: ParticleEffectRuntimeBackend2D,
    private readonly fallback: ParticleEffectRuntimeBackend2D,
    initialFallbackCount = 0,
  ) {
    this.resource = preferred.create(program, capacity);
    this.fallbackCount = initialFallbackCount;
  }
  emit(value: ParticleRuntimeEmission2D): void {
    this.invoke((resource) => {
      resource.emit(value);
    });
  }
  setPalette(value: ParticlePalette2D): void {
    this.invoke((resource) => {
      resource.setPalette(value);
    });
  }
  setParameters(value: Readonly<Record<string, ParticleParameterValue2D>>): void {
    this.invoke((resource) => {
      resource.setParameters?.(value);
    });
  }
  setColliders(value: ParticleColliderSet2D): void {
    this.invoke((resource) => {
      resource.setColliders?.(value);
    });
  }
  setForceFields(value: ParticleForceFieldSet2D): void {
    this.invoke((resource) => {
      resource.setForceFields?.(value);
    });
  }
  setDomain(value: ParticleDomain2D): void {
    this.invoke((resource) => {
      resource.setDomain?.(value);
    });
  }
  setEmitterSource(emitterIndex: number, value: ParticleEmitterSourceOverride2D): void {
    this.invoke((resource) => {
      resource.setEmitterSource?.(emitterIndex, value);
    });
  }
  setEventParameters(archetypeIndex: number, eventIndex: number, value: ParticleEventParameters2D): void {
    this.invoke((resource) => {
      resource.setEventParameters?.(archetypeIndex, eventIndex, value);
    });
  }
  setViewport(value: ParticleViewport2D): void {
    this.invoke((resource) => {
      resource.setViewport?.(value);
    });
  }
  setRenderParameters(value: ParticleRenderParameters2D): void {
    this.invoke((resource) => {
      resource.setRenderParameters?.(value);
    });
  }
  setRenderScale(value: number): void {
    this.invoke((resource) => {
      resource.setRenderScale?.(value);
    });
  }
  setDetailedDiagnostics(enabled: boolean): void {
    this.invoke((resource) => {
      resource.setDetailedDiagnostics?.(enabled);
    });
  }
  update(deltaSeconds: number, timescale: number): void {
    this.invoke((resource) => {
      resource.update(deltaSeconds, timescale);
    });
  }
  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void {
    this.invoke((resource) => {
      resource.render(target, tier);
    });
  }
  clear(): void {
    this.invoke((resource) => {
      resource.clear();
    });
  }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean {
    return this.resource.transferStateTo?.(target) ?? false;
  }
  debugReadback(): GpuParticleStateSnapshot2D {
    const snapshot = this.resource.debugReadback?.();
    if (!snapshot) throw new Error("Particle backend does not support debug state snapshots");
    return snapshot;
  }
  diagnostics(): ParticleEffectBackendDiagnostics2D {
    return {
      ...this.resource.diagnostics(),
      backendFallbackCount: this.fallbackCount,
    };
  }
  dispose(): void {
    this.resource.dispose();
  }
  private invoke(operation: (resource: ParticleEffectBackendResource2D) => void): void {
    try {
      operation(this.resource);
    } catch (error) {
      if (this.failed) throw error;
      this.failed = true;
      this.resource.dispose();
      this.resource = this.fallback.create(this.program, this.capacity);
      this.fallbackCount += 1;
      operation(this.resource);
    }
  }
}

export interface ParticleEffectInstanceState2D {
  readonly id: number;
  readonly effectId: string;
  readonly status: ParticleEffectInstanceStatus2D;
  readonly elapsed: number;
  readonly seed: number;
  readonly timescale: number;
  readonly qualityTier: ParticleRenderTier2D;
  readonly effectiveQualityTier: ParticleRenderTier2D;
  readonly renderScale: number;
  readonly adaptiveLodLevel: 0 | 1 | 2;
  readonly activeEmitters: number;
  readonly parameters: Readonly<Record<string, ParticleParameterValue2D>>;
  readonly diagnostics: ParticleEffectBackendDiagnostics2D;
}

export type ParticleInspectorCommand2D =
  | Readonly<{ action: "pause" | "resume" | "reset" }>
  | Readonly<{ action: "step"; deltaSeconds?: number }>
  | Readonly<{ action: "reseed"; seed: number }>
  | Readonly<{ action: "trigger"; signal: string }>;

export interface ParticleEffectInstance2D {
  readonly id: number;
  start(): void;
  stop(mode?: ParticleEmitterStopMode2D): void;
  pause(): void;
  resume(): void;
  restart(seed?: number): void;
  trigger(signal: string, payload?: ParticleSignalPayload2D): void;
  emit(emitterId: string, override?: ParticleEmissionOverride2D): void;
  emitter(emitterId: string): ParticleEmitterHandle2D;
  setTransform(transform: ParticleTransform2D): void;
  setParameter(name: string, value: ParticleParameterValue2D): void;
  setPalette(palette: ParticlePalette2D): void;
  setColliders(colliders: ParticleColliderSet2D): void;
  setForceFields(fields: ParticleForceFieldSet2D): void;
  setDomain(domain: ParticleDomain2D): void;
  setEmitterSource(emitterId: string, source: ParticleEmitterSourceOverride2D): void;
  setEventParameters(archetypeId: string, eventIndex: number, parameters: ParticleEventParameters2D): void;
  setViewport(viewport: ParticleViewport2D): void;
  setRenderParameters(parameters: ParticleRenderParameters2D): void;
  setTimescale(value: number): void;
  setQualityTier(tier: ParticleRenderTier2D): void;
  setRenderScale(scale: number): void;
  setDetailedDiagnostics(enabled: boolean): void;
  state(): ParticleEffectInstanceState2D;
  diagnostics(): ParticleEffectBackendDiagnostics2D;
  debugSnapshot(): GpuParticleStateSnapshot2D;
  dispose(): void;
}

export interface ParticleEffectsDiagnostics2D {
  readonly backend: ParticleEffectRuntimeBackend2D["kind"];
  readonly activeInstances: number;
  readonly registeredPrograms: number;
  readonly capacity: number;
  readonly activeEstimate: number;
  readonly spawnedParticles: number;
  readonly droppedParticles: number;
  readonly simulationPasses: number;
  readonly renderPasses: number;
  readonly uploadBytes: number;
  readonly allocatedBytes: number;
  readonly eventPasses: number;
  readonly eventAttempts: number;
  readonly eventLosses: number;
  readonly backendFallbackCount: number;
  readonly allocationsAfterWarmup: number;
  readonly diagnosticAccuracy: "exact" | "delayed" | "estimated";
}

export interface ParticleEffectProgramInspection2D {
  readonly id: string;
  readonly graphHash: string;
  readonly abiHash: string;
  readonly stateAbiVersion: number;
  readonly capacity: number;
  readonly pooledResources: number;
  readonly archetypes: readonly string[];
  readonly emitters: readonly string[];
  readonly parameters: readonly string[];
  readonly persistedBindings: readonly {
    readonly parameterId: string;
    readonly key: string;
  }[];
  readonly renderPasses: Readonly<Record<ParticleRenderTier2D, readonly string[]>>;
  readonly capabilityRequirements: readonly string[];
  readonly resources: readonly { readonly name: string; readonly kind: string; readonly required: boolean }[];
  readonly shaders: readonly { readonly backend: string; readonly stage: string; readonly entryPoint: string; readonly hash: string; readonly source: string }[];
}

export interface ParticleEffectsInspection2D {
  readonly backend: ParticleEffectRuntimeBackend2D["kind"];
  readonly programs: readonly ParticleEffectProgramInspection2D[];
  readonly instances: readonly ParticleEffectInstanceState2D[];
  readonly hotReloads: readonly ParticleEffectHotReloadResult2D[];
}

export interface ParticleEffectHotReloadResult2D {
  readonly effectId: string;
  readonly previousGraphHash?: string;
  readonly graphHash: string;
  readonly abiCompatible: boolean;
  readonly instances: number;
  readonly statePreserved: number;
  readonly action: "registered" | "preserved" | "reset";
  readonly explanation: string;
}

export interface ParticleEffects2D {
  register(program: CompiledParticleProgram2D, options?: { readonly capacity?: number }): void;
  prewarm(effectId: string, count?: number): void;
  replace(program: CompiledParticleProgram2D): void;
  reloadGraph(graph: ParticleEffectGraph2D, extensions?: readonly ParticleModuleCompilerExtension2D[]): ParticleEffectHotReloadResult2D;
  setCapacity(effectId: string, capacity: number): void;
  createInstance(effectId: string, options?: ParticleEffectInstanceOptions2D): ParticleEffectInstance2D;
  update(deltaSeconds: number): void;
  render(target: GpuRenderTarget2D): void;
  diagnostics(): ParticleEffectsDiagnostics2D;
  inspect(): ParticleEffectsInspection2D;
  controlInstance(instanceId: number, command: ParticleInspectorCommand2D): void;
  setDetailedDiagnostics(enabled: boolean): void;
  dispose(): void;
}

interface ProgramRecord {
  program: CompiledParticleProgram2D;
  capacity: number;
  instances: Set<RuntimeParticleEffectInstance2D>;
  pooled: ParticleEffectBackendResource2D[];
}

const DEFAULT_TRANSFORM: ParticleTransform2D = Object.freeze({
  position: [0, 0] as const,
  rotation: 0,
  scale: [1, 1] as const,
});
const EMPTY_PALETTE: ParticlePalette2D = Object.freeze({
  colors: [[1, 1, 1] as const],
  revision: 0,
});

export class EngineParticleEffects2D implements ParticleEffects2D {
  private readonly programs = new Map<string, ProgramRecord>();
  private readonly instances = new Map<number, RuntimeParticleEffectInstance2D>();
  private nextInstanceId = 1;
  private disposed = false;
  private detailedDiagnostics = false;
  private readonly hotReloadHistory: ParticleEffectHotReloadResult2D[] = [];

  constructor(private readonly backend: ParticleEffectRuntimeBackend2D) {}

  register(program: CompiledParticleProgram2D, options: { readonly capacity?: number } = {}): void {
    this.assertUsable();
    const id = program.effect.source.id;
    if (this.programs.has(id)) throw new Error(`Particle effect program is already registered: ${id}`);
    const policy = program.effect.source.capacity,
      capacity = options.capacity ?? policy.default;
    if (!Number.isSafeInteger(capacity) || capacity < policy.min || capacity > policy.max) throw new Error(`Particle effect capacity for ${id} is outside its compiled policy`);
    this.programs.set(id, {
      program,
      capacity,
      instances: new Set(),
      pooled: [],
    });
  }

  prewarm(effectId: string, count = 1): void {
    this.assertUsable();
    const record = this.programs.get(effectId);
    if (!record) throw new Error(`Unknown compiled particle effect: ${effectId}`);
    if (!Number.isSafeInteger(count) || count < 0 || count > 8) throw new Error("Particle effect prewarm count must be an integer between 0 and 8");
    while (record.pooled.length < count) record.pooled.push(this.backend.create(record.program, record.capacity));
  }

  replace(program: CompiledParticleProgram2D): void {
    this.replaceProgram(program);
  }

  reloadGraph(graph: ParticleEffectGraph2D, extensions: readonly ParticleModuleCompilerExtension2D[] = []): ParticleEffectHotReloadResult2D {
    this.assertUsable();
    const program = compileParticleProgram2D(compileParticleEffect2D(graph), extensions);
    const previous = this.programs.get(graph.id);
    const previousGraphHash = previous?.program.effect.graphHash;
    const abiCompatible = previous?.program.effect.abiHash === program.effect.abiHash;
    const replacement = this.replaceProgram(program);
    const result: ParticleEffectHotReloadResult2D = Object.freeze({
      effectId: graph.id,
      ...(previousGraphHash === undefined ? {} : { previousGraphHash }),
      graphHash: program.effect.graphHash,
      abiCompatible: previous === undefined || abiCompatible,
      instances: replacement.instances,
      statePreserved: replacement.preserved,
      action: previous === undefined ? "registered" : replacement.preserved === replacement.instances ? "preserved" : "reset",
      explanation: previous === undefined
        ? "The compiled effect was registered for the first time."
        : replacement.preserved === replacement.instances
          ? "The ABI is compatible and every live instance transferred its GPU state."
          : abiCompatible
            ? "The ABI is compatible, but at least one backend could not transfer its GPU state; affected instances restarted deterministically."
            : "The compiled ABI changed; live instances restarted deterministically with the new layout.",
    });
    this.hotReloadHistory.push(result);
    if (this.hotReloadHistory.length > 16) this.hotReloadHistory.shift();
    return result;
  }

  private replaceProgram(program: CompiledParticleProgram2D): { readonly instances: number; readonly preserved: number } {
    this.assertUsable();
    const id = program.effect.source.id;
    const previous = this.programs.get(id);
    if (!previous) {
      this.register(program);
      return { instances: 0, preserved: 0 };
    }
    for (const resource of previous.pooled.splice(0)) resource.dispose();
    previous.program = program;
    let preserved = 0;
    for (const instance of previous.instances) {
      const replacement = this.backend.create(program, previous.capacity);
      if (instance.replaceProgram(program, replacement)) preserved += 1;
    }
    return { instances: previous.instances.size, preserved };
  }

  setCapacity(effectId: string, capacity: number): void {
    this.assertUsable();
    const record = this.programs.get(effectId);
    if (!record) throw new Error(`Unknown compiled particle effect: ${effectId}`);
    const policy = record.program.effect.source.capacity;
    if (!Number.isSafeInteger(capacity) || capacity < policy.min || capacity > policy.max) throw new Error(`Particle effect capacity for ${effectId} is outside its compiled policy`);
    if (capacity === record.capacity) return;
    for (const resource of record.pooled.splice(0)) resource.dispose();
    record.capacity = capacity;
    for (const instance of record.instances) {
      const replacement = this.backend.create(record.program, capacity);
      instance.replaceProgram(record.program, replacement);
    }
  }

  createInstance(effectId: string, options: ParticleEffectInstanceOptions2D = {}): ParticleEffectInstance2D {
    this.assertUsable();
    const record = this.programs.get(effectId);
    if (!record) throw new Error(`Unknown compiled particle effect: ${effectId}`);
    const instance = new RuntimeParticleEffectInstance2D(
      this.nextInstanceId++,
      record.program,
      record.pooled.pop() ?? this.backend.create(record.program, record.capacity),
      options,
      (id, resource) => {
        this.removeInstance(effectId, id, resource);
      },
      (referenceId) => {
        const child = this.createInstance(referenceId);
        child.start();
      },
    );
    this.instances.set(instance.id, instance);
    record.instances.add(instance);
    instance.setDetailedDiagnostics(this.detailedDiagnostics);
    return instance;
  }

  update(deltaSeconds: number): void {
    this.assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("Particle runtime delta must be finite and non-negative");
    for (const instance of this.instances.values()) {
      const wasAdvancing = instance.isAdvancing;
      instance.update(deltaSeconds);
      if (wasAdvancing || instance.isAdvancing) instance.updateBackend(deltaSeconds);
    }
  }

  render(target: GpuRenderTarget2D): void {
    this.assertUsable();
    for (const instance of this.instances.values()) if (instance.isVisible) instance.renderBackend(target);
  }

  diagnostics(): ParticleEffectsDiagnostics2D {
    let capacity = 0,
      activeEstimate = 0,
      spawnedParticles = 0,
      droppedParticles = 0,
      simulationPasses = 0,
      renderPasses = 0,
      uploadBytes = 0,
      allocatedBytes = 0;
    let eventPasses = 0,
      eventAttempts = 0,
      eventLosses = 0,
      backendFallbackCount = 0,
      allocationsAfterWarmup = 0;
    let diagnosticAccuracy: ParticleEffectsDiagnostics2D["diagnosticAccuracy"] = "exact";
    for (const instance of this.instances.values()) {
      const diagnostics = instance.diagnostics();
      capacity += diagnostics.capacity;
      activeEstimate += diagnostics.activeEstimate;
      spawnedParticles += diagnostics.spawnedParticles;
      droppedParticles += diagnostics.droppedParticles;
      simulationPasses += diagnostics.simulationPasses;
      renderPasses += diagnostics.renderPasses;
      uploadBytes += diagnostics.uploadBytes;
      allocatedBytes += diagnostics.allocatedBytes;
      eventPasses += diagnostics.eventCount;
      eventAttempts += diagnostics.eventAttempts;
      eventLosses += diagnostics.eventOccupiedDrops + diagnostics.eventBudgetDrops + (diagnostics.eventContentionLosses ?? 0) + (diagnostics.eventGenerationDrops ?? 0);
      backendFallbackCount += diagnostics.backendFallbackCount ?? 0;
      allocationsAfterWarmup += diagnostics.allocationsAfterWarmup ?? 0;
      if (diagnostics.diagnosticAccuracy === undefined || diagnostics.diagnosticAccuracy === "estimated") diagnosticAccuracy = "estimated";
      else if (diagnostics.diagnosticAccuracy === "delayed" && diagnosticAccuracy === "exact") diagnosticAccuracy = "delayed";
    }
    return Object.freeze({
      backend: this.backend.kind,
      activeInstances: this.instances.size,
      registeredPrograms: this.programs.size,
      capacity,
      activeEstimate,
      spawnedParticles,
      droppedParticles,
      simulationPasses,
      renderPasses,
      uploadBytes,
      allocatedBytes,
      eventPasses,
      eventAttempts,
      eventLosses,
      backendFallbackCount,
      allocationsAfterWarmup,
      diagnosticAccuracy,
    });
  }

  inspect(): ParticleEffectsInspection2D {
    this.assertUsable();
    const programs = [...this.programs.entries()].map(([id, record]) =>
      Object.freeze({
        id,
        graphHash: record.program.effect.graphHash,
        abiHash: record.program.effect.abiHash,
        stateAbiVersion: record.program.effect.stateAbiVersion,
        capacity: record.capacity,
        pooledResources: record.pooled.length,
        archetypes: Object.freeze(record.program.effect.source.archetypes.map((entry) => entry.id)),
        emitters: Object.freeze(record.program.effect.source.emitters.map((entry) => entry.id)),
        parameters: Object.freeze(record.program.effect.source.parameters.map((entry) => entry.id)),
        persistedBindings: Object.freeze(record.program.effect.persistedBindings.map((entry) => Object.freeze({ parameterId: entry.parameterId, key: entry.key }))),
        renderPasses: Object.freeze(Object.fromEntries((["basic", "enhanced", "ultra"] as const).map((tier) => [tier, Object.freeze(record.program.renderPasses[tier].map((pass) => pass.kind))])) as Readonly<Record<ParticleRenderTier2D, readonly string[]>>),
        capabilityRequirements: Object.freeze(particleCapabilityRequirements(record.program)),
        resources: Object.freeze(record.program.reflection.bindings.map((entry) => Object.freeze({ name: entry.name, kind: entry.kind, required: entry.required }))),
        shaders: Object.freeze(compiledShaderInspection(record.program)),
      }),
    );
    return Object.freeze({
      backend: this.backend.kind,
      programs: Object.freeze(programs),
      instances: Object.freeze([...this.instances.values()].map((instance) => instance.state())),
      hotReloads: Object.freeze([...this.hotReloadHistory]),
    });
  }

  controlInstance(instanceId: number, command: ParticleInspectorCommand2D): void {
    this.assertUsable();
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Unknown particle effect instance: ${instanceId}`);
    if (command.action === "pause") instance.pause();
    else if (command.action === "resume") instance.resume();
    else if (command.action === "reset") instance.restart(instance.state().seed);
    else if (command.action === "reseed") instance.restart(command.seed);
    else if (command.action === "trigger") instance.trigger(command.signal);
    else if (command.action === "step") instance.singleStep(command.deltaSeconds ?? 1 / 60);
  }

  setDetailedDiagnostics(enabled: boolean): void {
    this.assertUsable();
    this.detailedDiagnostics = enabled;
    for (const instance of this.instances.values()) instance.setDetailedDiagnostics(enabled);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const instance of [...this.instances.values()]) instance.dispose();
    for (const record of this.programs.values()) for (const resource of record.pooled.splice(0)) resource.dispose();
    this.instances.clear();
    this.programs.clear();
    this.disposed = true;
  }

  private removeInstance(effectId: string, id: number, resource: ParticleEffectBackendResource2D): void {
    const instance = this.instances.get(id);
    if (!instance) {
      resource.dispose();
      return;
    }
    this.instances.delete(id);
    const record = this.programs.get(effectId);
    record?.instances.delete(instance);
    resource.clear();
    if (record && record.pooled.length < 2) record.pooled.push(resource);
    else resource.dispose();
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("Particle effects runtime is disposed");
  }
}

class MutableEmission implements ParticleRuntimeEmission2D {
  instanceId = 0;
  emitterIndex = 0;
  count = 0;
  positionX = 0;
  positionY = 0;
  direction = 0;
  spread = 0;
  power = 0;
  seed = 0;
  importance = 0;
  inheritedVelocityX = 0;
  inheritedVelocityY = 0;
  lifetime: number | undefined = undefined;
  lifetimeVariability: number | undefined = undefined;
}

class EmitterRuntime {
  readonly emission = new MutableEmission();
  active = false;
  elapsed = 0;
  rateAccumulator = 0;
  burstIndex = 0;
  loops = 0;
  lastX = 0;
  lastY = 0;

  constructor(
    readonly definition: ParticleEmitterDefinition2D,
    readonly index: number,
  ) {}
  reset(): void {
    this.active = false;
    this.elapsed = 0;
    this.rateAccumulator = 0;
    this.burstIndex = 0;
    this.loops = 0;
    this.lastX = 0;
    this.lastY = 0;
  }
}

class MutableEmissionOverride implements ParticleEmissionOverride2D {
  count?: number;
  position?: readonly [number, number];
  direction?: number;
  spread?: number;
  power?: number;
  seed?: number;
  inheritedVelocity?: readonly [number, number];
  lifetime?: number;
  lifetimeVariability?: number;
  readonly point: [number, number] = [0, 0];
  readonly velocity: [number, number] = [0, 0];
  clear(): void {
    delete this.count;
    delete this.position;
    delete this.direction;
    delete this.spread;
    delete this.power;
    delete this.seed;
    delete this.inheritedVelocity;
    delete this.lifetime;
    delete this.lifetimeVariability;
  }
}

class RuntimeParticleEmitterHandle2D implements ParticleEmitterHandle2D, ParticleEmissionWriter2D {
  private readonly override = new MutableEmissionOverride();
  constructor(
    readonly id: string,
    private readonly owner: RuntimeParticleEffectInstance2D,
  ) {}
  emit(count?: number): void {
    this.override.clear();
    if (count !== undefined) this.override.count = count;
    this.owner.emit(this.id, this.override);
  }
  emitAt(x: number, y: number, count?: number): void {
    this.override.clear();
    this.override.point[0] = x;
    this.override.point[1] = y;
    this.override.position = this.override.point;
    if (count !== undefined) this.override.count = count;
    this.owner.emit(this.id, this.override);
  }
  writer(): ParticleEmissionWriter2D {
    return this.reset();
  }
  count(value: number): ParticleEmissionWriter2D {
    this.override.count = value;
    return this;
  }
  position(x: number, y: number): ParticleEmissionWriter2D {
    this.override.point[0] = x;
    this.override.point[1] = y;
    this.override.position = this.override.point;
    return this;
  }
  direction(value: number): ParticleEmissionWriter2D {
    this.override.direction = value;
    return this;
  }
  spread(value: number): ParticleEmissionWriter2D {
    this.override.spread = value;
    return this;
  }
  power(value: number): ParticleEmissionWriter2D {
    this.override.power = value;
    return this;
  }
  seed(value: number): ParticleEmissionWriter2D {
    this.override.seed = value;
    return this;
  }
  inheritedVelocity(x: number, y: number): ParticleEmissionWriter2D {
    this.override.velocity[0] = x;
    this.override.velocity[1] = y;
    this.override.inheritedVelocity = this.override.velocity;
    return this;
  }
  lifetime(value: number): ParticleEmissionWriter2D {
    this.override.lifetime = value;
    return this;
  }
  lifetimeVariability(value: number): ParticleEmissionWriter2D {
    this.override.lifetimeVariability = value;
    return this;
  }
  submit(): void {
    this.owner.emit(this.id, this.override);
    this.override.clear();
  }
  reset(): ParticleEmissionWriter2D {
    this.override.clear();
    return this;
  }
}

class RuntimeParticleEffectInstance2D implements ParticleEffectInstance2D {
  private program: CompiledParticleProgram2D;
  private backend: ParticleEffectBackendResource2D;
  private statusValue: ParticleEffectInstanceStatus2D = "idle";
  private elapsed = 0;
  private seed: number;
  private transform: ParticleTransform2D;
  private parameters: Record<string, ParticleParameterValue2D>;
  private palette: ParticlePalette2D;
  private timescale: number;
  private tier: ParticleRenderTier2D;
  private renderScale = 1;
  private detailedDiagnostics = false;
  private appliedRenderScale = 1;
  private effectiveTier: ParticleRenderTier2D;
  private readonly adaptiveLod: boolean;
  private readonly adaptiveTargetFrameSeconds: number;
  private adaptiveLodLevel: 0 | 1 | 2 = 0;
  private slowFrames = 0;
  private recoveryFrames = 0;
  private colliders: ParticleColliderSet2D = {
    revision: 0,
    circles: [],
    capsules: [],
  };
  private forceFields: ParticleForceFieldSet2D = {
    revision: 0,
    attractors: [],
  };
  private domain: ParticleDomain2D = {
    revision: 0,
    shape: "rectangle",
    behavior: "none",
    center: [0, 0],
    halfExtents: [1, 1],
  };
  private viewport?: ParticleViewport2D;
  private renderParameters: ParticleRenderParameters2D = {};
  private readonly emitterSources = new Map<number, ParticleEmitterSourceOverride2D>();
  private readonly eventParameters = new Map<string, ParticleEventParameters2D>();
  private drainRemaining = 0;
  private readonly emitters: EmitterRuntime[];
  private readonly emitterHandles: Map<string, RuntimeParticleEmitterHandle2D>;
  private readonly scheduler: ParticleGraphScheduler2D;

  constructor(
    readonly id: number,
    program: CompiledParticleProgram2D,
    backend: ParticleEffectBackendResource2D,
    options: ParticleEffectInstanceOptions2D,
    private readonly onDispose: (id: number, resource: ParticleEffectBackendResource2D) => void,
    onReference: (effectId: string) => void,
  ) {
    this.program = program;
    this.backend = backend;
    this.seed = options.seed ?? mixSeed(id, 0x9e3779b9);
    this.transform = options.transform ?? DEFAULT_TRANSFORM;
    this.parameters = {
      ...resolveParticleParameters2D(program.effect.source, options.parameters),
    };
    this.palette = options.palette ?? EMPTY_PALETTE;
    this.timescale = validateTimescale(options.timescale ?? 1);
    this.tier = options.qualityTier ?? program.effect.source.quality.defaultTier;
    if (!program.effect.source.renderRecipes.recipes.some((entry) => entry.tier === this.tier)) throw new Error(`Particle effect does not render tier: ${this.tier}`);
    this.effectiveTier = this.tier;
    this.adaptiveLod = options.adaptiveLod ?? true;
    this.adaptiveTargetFrameSeconds = 1 / (options.adaptiveTargetFps ?? (options.preview ? 30 : 60));
    this.emitters = program.effect.source.emitters.map((entry, index) => new EmitterRuntime(entry, index));
    this.emitterHandles = new Map(this.emitters.map((entry) => [entry.definition.id, new RuntimeParticleEmitterHandle2D(entry.definition.id, this)]));
    this.scheduler = new ParticleGraphScheduler2D(
      program.effect.source,
      () => this.parameters,
      {
        emit: (emitterId) => {
          this.activateGraphEmitter(emitterId);
        },
        stop: (emitterId, mode) => {
          if (emitterId) {
            const emitter = this.emitters.find((entry) => entry.definition.id === emitterId);
            if (emitter) emitter.active = false;
          } else this.stop(mode);
        },
        signal: (signal) => {
          this.scheduler.trigger({ kind: "signal", signal });
        },
        reference: onReference,
      },
      this.seed,
    );
    backend.setPalette(this.palette);
    backend.setParameters?.(this.parameters);
    backend.setColliders?.(this.colliders);
    backend.setForceFields?.(this.forceFields);
    backend.setDomain?.(this.domain);
    backend.setRenderScale?.(this.renderScale);
  }

  get isAdvancing(): boolean {
    return this.statusValue === "running" || this.statusValue === "draining";
  }
  get isVisible(): boolean {
    return this.statusValue !== "idle" && this.statusValue !== "complete" && this.statusValue !== "disposed";
  }
  get currentTimescale(): number {
    return this.timescale;
  }
  get currentTier(): ParticleRenderTier2D {
    return this.tier;
  }

  start(): void {
    this.assertUsable();
    if (this.statusValue === "running") return;
    this.statusValue = "running";
    this.emitters.forEach((emitter) => {
      emitter.reset();
    });
    this.scheduler.start();
  }

  stop(mode: ParticleEmitterStopMode2D = "drain"): void {
    this.assertUsable();
    for (const emitter of this.emitters) emitter.active = false;
    this.statusValue = mode === "kill" ? "complete" : "draining";
    if (mode === "kill") this.backend.clear();
  }

  pause(): void {
    this.assertUsable();
    if (this.statusValue === "running" || this.statusValue === "draining") this.statusValue = "paused";
  }
  resume(): void {
    this.assertUsable();
    if (this.statusValue === "paused") this.statusValue = "running";
  }

  restart(seed = mixSeed(this.seed, 0x85ebca6b)): void {
    this.assertUsable();
    this.seed = seed >>> 0;
    this.elapsed = 0;
    this.backend.clear();
    this.emitters.forEach((emitter) => {
      emitter.reset();
    });
    this.scheduler.reset(this.seed);
    this.statusValue = "idle";
    this.start();
  }

  trigger(signal: string, payload: ParticleSignalPayload2D = {}): void {
    this.assertUsable();
    if (signal.trim().length === 0) throw new Error("Particle effect signal cannot be empty");
    if (payload.position) this.transform = { ...this.transform, position: payload.position };
    this.scheduler.trigger({ kind: "signal", signal });
  }

  emit(emitterId: string, override: ParticleEmissionOverride2D = {}): void {
    this.assertUsable();
    const emitter = this.emitters.find((entry) => entry.definition.id === emitterId);
    if (!emitter) throw new Error(`Unknown particle emitter: ${emitterId}`);
    if (this.statusValue === "idle" || this.statusValue === "complete") this.statusValue = "running";
    this.submit(emitter, override.count ?? firstBurstCount(emitter.definition), override);
  }
  emitter(emitterId: string): ParticleEmitterHandle2D {
    this.assertUsable();
    const handle = this.emitterHandles.get(emitterId);
    if (!handle) throw new Error(`Unknown particle emitter: ${emitterId}`);
    return handle;
  }

  setTransform(transform: ParticleTransform2D): void {
    this.assertUsable();
    validateTransform(transform);
    this.transform = transform;
  }
  setParameter(name: string, value: ParticleParameterValue2D): void {
    this.assertUsable();
    this.parameters = {
      ...resolveParticleParameters2D(this.program.effect.source, {
        ...this.parameters,
        [name]: value,
      }),
    };
    this.backend.setParameters?.(this.parameters);
  }
  setPalette(palette: ParticlePalette2D): void {
    this.assertUsable();
    this.palette = palette;
    this.backend.setPalette(palette);
  }
  setColliders(colliders: ParticleColliderSet2D): void {
    this.assertUsable();
    this.colliders = colliders;
    this.backend.setColliders?.(colliders);
  }
  setForceFields(fields: ParticleForceFieldSet2D): void {
    this.assertUsable();
    if (!Number.isSafeInteger(fields.revision) || fields.revision < 0) throw new Error("Particle force-field revision must be a non-negative integer");
    if (fields.attractors.length > 16) throw new Error("Particle effects support at most 16 dynamic attractors");
    for (const field of fields.attractors) {
      if (![field.x, field.y, field.strength, field.softening ?? 1, field.tangentialStrength ?? 0, field.radialStrength ?? 0, field.radius ?? 0, field.velocity?.[0] ?? 0, field.velocity?.[1] ?? 0, field.velocityCoupling ?? 0].every(Number.isFinite)) throw new Error("Particle attractor values must be finite");
      if ((field.softening ?? 1) < 0) throw new Error("Particle attractor softening must be non-negative");
      if ((field.radius ?? 0) < 0) throw new Error("Particle attractor radius must be non-negative");
      if ((field.velocityCoupling ?? 0) < 0) throw new Error("Particle attractor velocity coupling must be non-negative");
    }
    this.forceFields = fields;
    this.backend.setForceFields?.(fields);
  }
  setDomain(domain: ParticleDomain2D): void {
    this.assertUsable();
    if (!Number.isSafeInteger(domain.revision) || domain.revision < 0) throw new Error("Particle domain revision must be a non-negative integer");
    const halfExtents = domain.halfExtents ?? [0, 0];
    if (![domain.center[0], domain.center[1], halfExtents[0], halfExtents[1], domain.radius ?? 0, domain.margin ?? 0, domain.damping ?? 1].every(Number.isFinite)) throw new Error("Particle domain values must be finite");
    if (domain.shape === "rectangle" && (halfExtents[0] <= 0 || halfExtents[1] <= 0)) throw new Error("Rectangle particle domains require positive half-extents");
    if (domain.shape === "circle" && (domain.radius ?? 0) <= 0) throw new Error("Circle particle domains require a positive radius");
    if ((domain.margin ?? 0) < 0) throw new Error("Particle domain margin must be non-negative");
    if ((domain.damping ?? 1) < 0 || (domain.damping ?? 1) > 1) throw new Error("Particle domain damping must be between zero and one");
    this.domain = domain;
    this.backend.setDomain?.(domain);
  }
  setEmitterSource(emitterId: string, source: ParticleEmitterSourceOverride2D): void {
    this.assertUsable();
    const index = this.emitters.findIndex((entry) => entry.definition.id === emitterId);
    if (index < 0) throw new Error(`Unknown particle emitter: ${emitterId}`);
    const values = [source.radius, source.innerRadius, source.length, source.arc, source.spread].filter((value): value is number => value !== undefined);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Particle emitter source overrides must be finite and non-negative");
    if (source.innerRadius !== undefined && source.radius !== undefined && source.innerRadius > source.radius) throw new Error("Particle emitter inner radius cannot exceed its radius");
    this.emitterSources.set(index, source);
    this.backend.setEmitterSource?.(index, source);
  }
  setEventParameters(archetypeId: string, eventIndex: number, parameters: ParticleEventParameters2D): void {
    this.assertUsable();
    const archetypeIndex = this.program.effect.archetypeIds[archetypeId];
    const event = archetypeIndex === undefined ? undefined : this.program.effect.source.archetypes[archetypeIndex]?.events?.[eventIndex];
    if (!event || archetypeIndex === undefined) throw new Error(`Unknown particle event: ${archetypeId}[${eventIndex}]`);
    const values = [parameters.probability, parameters.count, parameters.maxGeneration, parameters.delay, parameters.lifetime, parameters.velocityInheritance, parameters.powerScale, parameters.spread, parameters.minimumSpeed, parameters.countSpeedScale, parameters.speedReference, parameters.basePower, parameters.lifetimeVariability, parameters.powerVariability].filter(
      (value): value is number => value !== undefined,
    );
    if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Particle event parameters must be finite and non-negative");
    if (parameters.probability !== undefined && parameters.probability > 1) throw new Error("Particle event probability must be between zero and one");
    if (parameters.count !== undefined && !Number.isSafeInteger(parameters.count)) throw new Error("Particle event count must be an integer");
    if (parameters.maxGeneration !== undefined && !Number.isSafeInteger(parameters.maxGeneration)) throw new Error("Particle event generation depth must be an integer");
    if (parameters.lifetimeVariability !== undefined && parameters.lifetimeVariability > 1) throw new Error("Particle event lifetime variability must be between zero and one");
    const key = `${archetypeIndex}:${eventIndex}`;
    const merged = { ...this.eventParameters.get(key), ...parameters };
    this.eventParameters.set(key, merged);
    this.backend.setEventParameters?.(archetypeIndex, eventIndex, merged);
  }
  setViewport(viewport: ParticleViewport2D): void {
    this.assertUsable();
    if (![viewport.width, viewport.height, viewport.dpr].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 || viewport.dpr <= 0) throw new Error("Particle viewport dimensions and DPR must be positive and finite");
    this.viewport = viewport;
    this.backend.setViewport?.(viewport);
  }
  setRenderParameters(parameters: ParticleRenderParameters2D): void {
    this.assertUsable();
    const numeric = [parameters.pointScale, parameters.intensity, parameters.trailFade, parameters.trailBloom, parameters.paletteTransition, parameters.streakScale, ...(parameters.trailBackground ?? [])].filter((value): value is number => value !== undefined);
    if (numeric.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Particle render parameters must be finite and non-negative");
    if (parameters.trailFade !== undefined && parameters.trailFade > 1) throw new Error("Particle trail fade must be between zero and one");
    this.renderParameters = { ...this.renderParameters, ...parameters };
    this.backend.setRenderParameters?.(this.renderParameters);
  }
  setTimescale(value: number): void {
    this.assertUsable();
    this.timescale = validateTimescale(value);
  }
  setQualityTier(tier: ParticleRenderTier2D): void {
    this.assertUsable();
    if (!this.program.effect.source.renderRecipes.recipes.some((entry) => entry.tier === tier)) throw new Error(`Particle effect does not render tier: ${tier}`);
    this.tier = tier;
    this.applyAdaptiveLod();
  }
  setRenderScale(scale: number): void {
    this.assertUsable();
    if (!Number.isFinite(scale) || scale < 0.0625 || scale > 1) throw new Error("Particle render scale must be between 0.0625 and 1");
    this.renderScale = scale;
    this.applyAdaptiveLod();
  }

  setDetailedDiagnostics(enabled: boolean): void {
    this.assertUsable();
    this.detailedDiagnostics = enabled;
    this.backend.setDetailedDiagnostics?.(enabled);
  }

  state(): ParticleEffectInstanceState2D {
    return Object.freeze({
      id: this.id,
      effectId: this.program.effect.source.id,
      status: this.statusValue,
      elapsed: this.elapsed,
      seed: this.seed,
      timescale: this.timescale,
      qualityTier: this.tier,
      effectiveQualityTier: this.effectiveTier,
      renderScale: this.appliedRenderScale,
      adaptiveLodLevel: this.adaptiveLodLevel,
      activeEmitters: this.emitters.reduce((count, emitter) => count + Number(emitter.active), 0),
      parameters: Object.freeze({ ...this.parameters }),
      diagnostics: this.backend.diagnostics(),
    });
  }
  singleStep(deltaSeconds: number): void {
    this.assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 1) throw new Error("Particle inspector step must be between zero and one second");
    if (this.statusValue === "idle" || this.statusValue === "complete") this.start();
    else if (this.statusValue === "paused") this.statusValue = "running";
    this.update(deltaSeconds);
    this.updateBackend(deltaSeconds);
    this.statusValue = "paused";
  }
  diagnostics(): ParticleEffectBackendDiagnostics2D {
    return this.backend.diagnostics();
  }
  debugSnapshot(): GpuParticleStateSnapshot2D {
    const snapshot = this.backend.debugReadback?.();
    if (!snapshot) throw new Error(`Particle backend does not support debug state snapshots: ${this.program.effect.source.id}`);
    return snapshot;
  }
  dispose(): void {
    if (this.statusValue === "disposed") return;
    this.statusValue = "disposed";
    this.onDispose(this.id, this.backend);
  }

  updateBackend(deltaSeconds: number): void {
    this.updateAdaptiveLod(deltaSeconds);
    this.backend.update(deltaSeconds, this.timescale);
  }
  renderBackend(target: GpuRenderTarget2D): void {
    this.backend.render(target, this.effectiveTier);
  }

  update(deltaSeconds: number): void {
    if (!this.isAdvancing) return;
    const delta = deltaSeconds * this.timescale;
    this.elapsed += delta;
    this.scheduler.update(delta);
    let active = false;
    for (const emitter of this.emitters) {
      if (emitter.active) {
        active = true;
        this.advanceEmitter(emitter, delta);
      }
    }
    if (!active && this.statusValue === "running") this.statusValue = "draining";
    if (!active && this.statusValue === "draining") {
      this.drainRemaining = Math.max(0, this.drainRemaining - delta);
      if (this.drainRemaining === 0) this.statusValue = "complete";
    }
  }

  replaceProgram(program: CompiledParticleProgram2D, backend: ParticleEffectBackendResource2D): boolean {
    const compatible = program.effect.abiHash === this.program.effect.abiHash;
    const stateTransferred = compatible && (this.backend.transferStateTo?.(backend) ?? false);
    this.backend.dispose();
    this.program = program;
    this.backend = backend;
    this.parameters = {
      ...resolveParticleParameters2D(program.effect.source, this.parameters),
    };
    backend.setPalette(this.palette);
    backend.setParameters?.(this.parameters);
    backend.setColliders?.(this.colliders);
    backend.setForceFields?.(this.forceFields);
    backend.setDomain?.(this.domain);
    for (const [emitterIndex, source] of this.emitterSources) backend.setEmitterSource?.(emitterIndex, source);
    for (const [key, parameters] of this.eventParameters) {
      const [archetypeIndex, eventIndex] = key.split(":").map(Number);
      backend.setEventParameters?.(archetypeIndex!, eventIndex!, parameters);
    }
    if (this.viewport) backend.setViewport?.(this.viewport);
    backend.setRenderParameters?.(this.renderParameters);
    backend.setRenderScale?.(this.renderScale);
    backend.setDetailedDiagnostics?.(this.detailedDiagnostics);
    this.applyAdaptiveLod();
    if (!stateTransferred) {
      this.elapsed = 0;
      this.emitters.forEach((emitter) => {
        emitter.reset();
      });
      this.scheduler.reset(this.seed);
      this.statusValue = "idle";
      this.start();
    }
    return stateTransferred;
  }

  private advanceEmitter(emitter: EmitterRuntime, delta: number): void {
    const timeline = emitter.definition.timeline;
    const before = emitter.elapsed;
    emitter.elapsed += delta;
    if (emitter.elapsed < 0) return;
    for (let index = emitter.burstIndex; index < (timeline.bursts?.length ?? 0); index += 1) {
      const burst = timeline.bursts![index]!;
      if (burst.time > emitter.elapsed) break;
      if (burst.time >= Math.max(0, before)) this.submit(emitter, burst.count);
      emitter.burstIndex = index + 1;
    }
    const rate = evaluateRate(timeline.rate, this.parameters, this.seed, emitter.index);
    if (rate > 0) {
      emitter.rateAccumulator += rate * delta;
      const count = Math.min(Math.floor(emitter.rateAccumulator), emitter.definition.limits.maxPerFrame ?? Number.MAX_SAFE_INTEGER);
      if (count > 0) {
        emitter.rateAccumulator -= count;
        this.submit(emitter, count);
      }
    }
    const duration = timeline.duration;
    if (duration !== undefined && emitter.elapsed >= duration) {
      if (timeline.loop && (timeline.maxLoops === undefined || emitter.loops + 1 < timeline.maxLoops)) {
        emitter.elapsed %= Math.max(duration, Number.EPSILON);
        emitter.burstIndex = 0;
        emitter.loops += 1;
      } else emitter.active = false;
    }
  }

  private submit(emitter: EmitterRuntime, requestedCount: number, override: ParticleEmissionOverride2D = {}): void {
    if (override.lifetime !== undefined && (!Number.isFinite(override.lifetime) || override.lifetime <= 0)) throw new Error("Particle emission lifetime must be positive and finite");
    if (override.lifetimeVariability !== undefined && (!Number.isFinite(override.lifetimeVariability) || override.lifetimeVariability < 0 || override.lifetimeVariability > 1)) throw new Error("Particle emission lifetime variability must be between zero and one");
    const qualityScale = emitter.definition.limits.qualityScale?.[this.tier] ?? 1;
    const count = Math.max(0, Math.min(Math.round(requestedCount * qualityScale), emitter.definition.limits.maxPerFrame ?? Number.MAX_SAFE_INTEGER));
    if (count === 0) return;
    const emission = emitter.emission;
    emission.instanceId = this.id;
    emission.emitterIndex = emitter.index;
    emission.count = count;
    emission.positionX = override.position?.[0] ?? this.transform.position[0];
    emission.positionY = override.position?.[1] ?? this.transform.position[1];
    emission.direction = override.direction ?? this.transform.rotation;
    emission.spread = override.spread ?? sourceNumber(emitter.definition.initialization?.spread, this.parameters, this.seed, emitter.index, 0);
    emission.power = override.power ?? sourceNumber(emitter.definition.initialization?.power, this.parameters, this.seed, emitter.index, 1);
    emission.seed = override.seed ?? mixSeed(this.seed, emitter.index + Math.round(this.elapsed * 1000));
    emission.importance = importanceCode(emitter.definition.limits.importance);
    emission.inheritedVelocityX = override.inheritedVelocity?.[0] ?? 0;
    emission.inheritedVelocityY = override.inheritedVelocity?.[1] ?? 0;
    emission.lifetime = override.lifetime;
    emission.lifetimeVariability = override.lifetimeVariability;
    this.backend.emit(emission);
    const archetype = this.program.effect.source.archetypes[this.program.effect.archetypeIds[emitter.definition.archetypeId] ?? -1];
    if (archetype) this.drainRemaining = Math.max(this.drainRemaining, particleDrainDuration(this.program, emitter.definition.archetypeId, override.lifetime));
  }

  private activateGraphEmitter(emitterId: string): void {
    const emitter = this.emitters.find((entry) => entry.definition.id === emitterId);
    if (!emitter) throw new Error(`Unknown particle emitter: ${emitterId}`);
    const timeline = emitter.definition.timeline;
    if (timeline.manual) {
      this.submit(emitter, firstBurstCount(emitter.definition));
      return;
    }
    emitter.reset();
    emitter.active = true;
    emitter.elapsed = -(timeline.startDelay ?? 0);
    if (timeline.prewarm && (timeline.duration ?? 0) > 0) this.advanceEmitter(emitter, timeline.duration ?? 0);
  }

  private updateAdaptiveLod(deltaSeconds: number): void {
    if (!this.adaptiveLod || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (deltaSeconds > this.adaptiveTargetFrameSeconds * 1.25) {
      this.slowFrames += 1;
      this.recoveryFrames = 0;
      if (this.slowFrames >= 8 && this.adaptiveLodLevel < 2) {
        this.adaptiveLodLevel = (this.adaptiveLodLevel + 1) as 1 | 2;
        this.slowFrames = 0;
        this.applyAdaptiveLod();
      }
    } else if (deltaSeconds < this.adaptiveTargetFrameSeconds * 1.08) {
      this.slowFrames = 0;
      this.recoveryFrames += 1;
      if (this.recoveryFrames >= 120 && this.adaptiveLodLevel > 0) {
        this.adaptiveLodLevel = (this.adaptiveLodLevel - 1) as 0 | 1;
        this.recoveryFrames = 0;
        this.applyAdaptiveLod();
      }
    }
  }

  private applyAdaptiveLod(): void {
    this.effectiveTier = this.adaptiveLodLevel === 2 ? lowerAvailableParticleTier(this.program, this.tier) : this.tier;
    const adaptiveScale = this.adaptiveLodLevel === 0 ? 1 : this.adaptiveLodLevel === 1 ? 0.5 : 0.25;
    this.appliedRenderScale = Math.min(this.renderScale, adaptiveScale);
    this.backend.setRenderScale?.(this.appliedRenderScale);
  }

  private assertUsable(): void {
    if (this.statusValue === "disposed") throw new Error("Particle effect instance is disposed");
  }
}

function firstBurstCount(emitter: ParticleEmitterDefinition2D): number {
  return emitter.timeline.bursts?.[0]?.count ?? 1;
}
function importanceCode(importance: ParticleEmitterDefinition2D["limits"]["importance"]): number {
  return ["cosmetic", "secondary", "primary", "critical"].indexOf(importance);
}
function lowerAvailableParticleTier(program: CompiledParticleProgram2D, tier: ParticleRenderTier2D): ParticleRenderTier2D {
  if (tier === "ultra" && hasParticleRenderTier(program, "enhanced")) return "enhanced";
  if (tier !== "basic" && hasParticleRenderTier(program, "basic")) return "basic";
  return tier;
}
function hasParticleRenderTier(program: CompiledParticleProgram2D, tier: ParticleRenderTier2D): boolean {
  for (const recipe of program.effect.source.renderRecipes.recipes) if (recipe.tier === tier) return true;
  return false;
}

function particleCapabilityRequirements(program: CompiledParticleProgram2D): string[] {
  const requirements = program.effect.backendRequirements;
  return [
    ...(requirements.metadata ? ["particle metadata"] : []),
    ...(requirements.events ? ["GPU child events"] : []),
    ...(requirements.floatTargets ? ["floating-point state targets"] : []),
    ...(requirements.floatBlend ? ["floating-point blending"] : []),
    `at least ${requirements.minimumDrawBuffers} draw buffers`,
  ];
}

function compiledShaderInspection(program: CompiledParticleProgram2D): { backend: string; stage: string; entryPoint: string; hash: string; source: string }[] {
  const shaders = [
    program.webgl2.simulation,
    program.webgl2.event,
    program.webgl2.eventClaimVertex,
    program.webgl2.eventClaimFragment,
    program.webgl2.vertex,
    program.webgl2.streakVertex,
    program.webgl2.fragment,
    program.webgpu.simulation,
    program.webgpu.event,
    program.webgpu.eventResolve,
    program.webgpu.render,
  ];
  return shaders.filter((shader): shader is NonNullable<typeof shader> => shader !== undefined).map((shader) => ({
    backend: shader.backend,
    stage: shader.stage,
    entryPoint: shader.entryPoint,
    hash: shader.hash,
    source: shader.source,
  }));
}

function particleDrainDuration(program: CompiledParticleProgram2D, archetypeId: string, lifetimeOverride?: number, generation = 0): number {
  const archetypeIndex = program.effect.archetypeIds[archetypeId];
  const archetype = archetypeIndex === undefined ? undefined : program.effect.source.archetypes[archetypeIndex];
  if (!archetype) return 0;
  const lifetime = (lifetimeOverride ?? archetype.lifecycle.lifetime) * (1 + (archetype.lifecycle.lifetimeVariability ?? 0));
  if (generation >= 8) return lifetime;
  let descendants = 0;
  for (const event of archetype.events ?? []) {
    if (generation > event.maxGeneration) continue;
    const triggerTime = event.trigger === "birth" ? 0 : event.trigger === "age" ? (event.delay ?? 0) : lifetime;
    descendants = Math.max(descendants, triggerTime + particleDrainDuration(program, event.childArchetypeId, undefined, generation + 1));
  }
  return Math.max(lifetime, descendants);
}
function validateTimescale(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 16) throw new Error("Particle effect timescale must be between 0 and 16");
  return value;
}
function validateTransform(transform: ParticleTransform2D): void {
  if (![...transform.position, transform.rotation, ...transform.scale].every(Number.isFinite)) throw new Error("Particle transform values must be finite");
}
function mixSeed(a: number, b: number): number {
  let value = (a ^ b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
function random01(seed: number): number {
  return mixSeed(seed, 0x27d4eb2d) / 0x1_0000_0000;
}
function evaluateRate(source: import("./ParticleEffectGraph2D.js").ParticleValueSource2D | undefined, parameters: Readonly<Record<string, ParticleParameterValue2D>>, seed: number, salt: number): number {
  return sourceNumber(source, parameters, seed, salt, 0);
}
function sourceNumber(source: import("./ParticleEffectGraph2D.js").ParticleValueSource2D | undefined, parameters: Readonly<Record<string, ParticleParameterValue2D>>, seed: number, salt: number, fallback: number): number {
  if (!source) return fallback;
  if (source.kind === "constant") return source.value;
  if (source.kind === "parameter") {
    const value = parameters[source.parameterId];
    return typeof value === "number" ? value * (source.scale ?? 1) + (source.offset ?? 0) : fallback;
  }
  if (source.kind === "random") return source.min + (source.max - source.min) * random01(mixSeed(seed, salt));
  return source.curve.keys[0]?.value ?? fallback;
}
