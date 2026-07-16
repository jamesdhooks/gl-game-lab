import { resolveParticleParameters2D } from './ParticleEffectAuthoring2D.js';
import type { CompiledParticleProgram2D } from './ParticleEffectCompiler2D.js';
import type {
  ParticleEmitterDefinition2D,
  ParticleEmitterStopMode2D,
  ParticleParameterValue2D,
} from './ParticleEffectGraph2D.js';
import type { ParticleEffectDiagnostics2D, ParticlePalette2D, ParticleRenderTier2D } from './ParticleEffects2D.js';
import type { GpuRenderTarget2D } from './Gpu2D.js';
import { ParticleGraphScheduler2D } from './ParticleGraphScheduler2D.js';

export type ParticleEffectInstanceStatus2D = 'idle' | 'running' | 'paused' | 'draining' | 'complete' | 'disposed';

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
}

export interface ParticleEmissionOverride2D {
  readonly count?: number;
  readonly position?: readonly [number, number];
  readonly direction?: number;
  readonly spread?: number;
  readonly power?: number;
  readonly seed?: number;
}

/** Reusable command writer for allocation-free emission in frame loops. */
export interface ParticleEmissionWriter2D {
  count(value: number): ParticleEmissionWriter2D;
  position(x: number, y: number): ParticleEmissionWriter2D;
  direction(value: number): ParticleEmissionWriter2D;
  spread(value: number): ParticleEmissionWriter2D;
  power(value: number): ParticleEmissionWriter2D;
  seed(value: number): ParticleEmissionWriter2D;
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
}

export interface ParticleEffectBackendDiagnostics2D extends ParticleEffectDiagnostics2D {
  readonly allocatedBytes: number;
  readonly eventAttempts: number;
  readonly eventOccupiedDrops: number;
  readonly eventBudgetDrops: number;
  readonly backendFallbackCount?: number;
  readonly validationFailures?: number;
  readonly diagnosticAccuracy?: 'exact' | 'delayed' | 'estimated';
}

export interface ParticleEffectBackendResource2D {
  emit(emission: ParticleRuntimeEmission2D): void;
  setPalette(palette: ParticlePalette2D): void;
  update(deltaSeconds: number, timescale: number): void;
  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void;
  clear(): void;
  transferStateTo?(target: ParticleEffectBackendResource2D): boolean;
  diagnostics(): ParticleEffectBackendDiagnostics2D;
  dispose(): void;
}

export interface ParticleEffectRuntimeBackend2D {
  readonly kind: 'webgl2' | 'webgpu' | 'test';
  create(program: CompiledParticleProgram2D, capacity: number): ParticleEffectBackendResource2D;
}

/** Capability/failure wrapper used for internal WebGPU -> WebGL2 fallback. */
export class FallbackParticleEffectRuntimeBackend2D implements ParticleEffectRuntimeBackend2D {
  readonly kind: ParticleEffectRuntimeBackend2D['kind'];
  constructor(
    private readonly preferred: ParticleEffectRuntimeBackend2D,
    private readonly fallback: ParticleEffectRuntimeBackend2D,
  ) { this.kind = preferred.kind; }
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
  ) { this.resource = preferred.create(program, capacity); this.fallbackCount = initialFallbackCount; }
  emit(value: ParticleRuntimeEmission2D): void { this.invoke((resource) => { resource.emit(value); }); }
  setPalette(value: ParticlePalette2D): void { this.invoke((resource) => { resource.setPalette(value); }); }
  update(deltaSeconds: number, timescale: number): void { this.invoke((resource) => { resource.update(deltaSeconds, timescale); }); }
  render(target: GpuRenderTarget2D, tier: ParticleRenderTier2D): void { this.invoke((resource) => { resource.render(target, tier); }); }
  clear(): void { this.invoke((resource) => { resource.clear(); }); }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean { return this.resource.transferStateTo?.(target) ?? false; }
  diagnostics(): ParticleEffectBackendDiagnostics2D { return { ...this.resource.diagnostics(), backendFallbackCount: this.fallbackCount }; }
  dispose(): void { this.resource.dispose(); }
  private invoke(operation: (resource: ParticleEffectBackendResource2D) => void): void {
    try { operation(this.resource); }
    catch (error) {
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
  readonly activeEmitters: number;
}

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
  setTimescale(value: number): void;
  setQualityTier(tier: ParticleRenderTier2D): void;
  state(): ParticleEffectInstanceState2D;
  diagnostics(): ParticleEffectBackendDiagnostics2D;
  dispose(): void;
}

export interface ParticleEffectsDiagnostics2D {
  readonly backend: ParticleEffectRuntimeBackend2D['kind'];
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
  readonly diagnosticAccuracy: 'exact' | 'delayed' | 'estimated';
}

export interface ParticleEffects2D {
  register(program: CompiledParticleProgram2D): void;
  replace(program: CompiledParticleProgram2D): void;
  createInstance(effectId: string, options?: ParticleEffectInstanceOptions2D): ParticleEffectInstance2D;
  update(deltaSeconds: number): void;
  render(target: GpuRenderTarget2D): void;
  diagnostics(): ParticleEffectsDiagnostics2D;
  dispose(): void;
}

interface ProgramRecord {
  program: CompiledParticleProgram2D;
  backend: ParticleEffectBackendResource2D;
  instances: Set<RuntimeParticleEffectInstance2D>;
}

const DEFAULT_TRANSFORM: ParticleTransform2D = Object.freeze({ position: [0, 0] as const, rotation: 0, scale: [1, 1] as const });
const EMPTY_PALETTE: ParticlePalette2D = Object.freeze({ colors: [[1, 1, 1] as const], revision: 0 });

export class EngineParticleEffects2D implements ParticleEffects2D {
  private readonly programs = new Map<string, ProgramRecord>();
  private readonly instances = new Map<number, RuntimeParticleEffectInstance2D>();
  private nextInstanceId = 1;
  private disposed = false;

  constructor(private readonly backend: ParticleEffectRuntimeBackend2D) {}

  register(program: CompiledParticleProgram2D): void {
    this.assertUsable();
    const id = program.effect.source.id;
    if (this.programs.has(id)) throw new Error(`Particle effect program is already registered: ${id}`);
    const capacity = program.effect.source.capacity.default;
    this.programs.set(id, { program, backend: this.backend.create(program, capacity), instances: new Set() });
  }

  replace(program: CompiledParticleProgram2D): void {
    this.assertUsable();
    const id = program.effect.source.id;
    const previous = this.programs.get(id);
    if (!previous) { this.register(program); return; }
    const replacement = this.backend.create(program, program.effect.source.capacity.default);
    if (previous.program.effect.abiHash === program.effect.abiHash) previous.backend.transferStateTo?.(replacement);
    previous.backend.dispose();
    previous.backend = replacement;
    previous.program = program;
    for (const instance of previous.instances) instance.replaceProgram(program, replacement);
  }

  createInstance(effectId: string, options: ParticleEffectInstanceOptions2D = {}): ParticleEffectInstance2D {
    this.assertUsable();
    const record = this.programs.get(effectId);
    if (!record) throw new Error(`Unknown compiled particle effect: ${effectId}`);
    const instance = new RuntimeParticleEffectInstance2D(
      this.nextInstanceId++, record.program, record.backend, options,
      (id) => { this.removeInstance(effectId, id); },
      (referenceId) => { const child = this.createInstance(referenceId); child.start(); },
    );
    this.instances.set(instance.id, instance);
    record.instances.add(instance);
    return instance;
  }

  update(deltaSeconds: number): void {
    this.assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Particle runtime delta must be finite and non-negative');
    for (const instance of this.instances.values()) instance.update(deltaSeconds);
    for (const record of this.programs.values()) {
      let maxTimescale = 0;
      for (const instance of record.instances) if (instance.isAdvancing) maxTimescale = Math.max(maxTimescale, instance.currentTimescale);
      if (maxTimescale > 0) record.backend.update(deltaSeconds, maxTimescale);
    }
  }

  render(target: GpuRenderTarget2D): void {
    this.assertUsable();
    for (const record of this.programs.values()) {
      let tier: ParticleRenderTier2D | undefined;
      for (const instance of record.instances) if (instance.isVisible) tier = higherTier(tier, instance.currentTier);
      if (tier) record.backend.render(target, tier);
    }
  }

  diagnostics(): ParticleEffectsDiagnostics2D {
    let capacity = 0, activeEstimate = 0, spawnedParticles = 0, droppedParticles = 0, simulationPasses = 0, renderPasses = 0, uploadBytes = 0, allocatedBytes = 0;
    let eventPasses = 0, eventAttempts = 0, eventLosses = 0, backendFallbackCount = 0, allocationsAfterWarmup = 0;
    let diagnosticAccuracy: ParticleEffectsDiagnostics2D['diagnosticAccuracy'] = 'exact';
    for (const record of this.programs.values()) {
      const diagnostics = record.backend.diagnostics();
      capacity += diagnostics.capacity; activeEstimate += diagnostics.activeEstimate; spawnedParticles += diagnostics.spawnedParticles;
      droppedParticles += diagnostics.droppedParticles; simulationPasses += diagnostics.simulationPasses; renderPasses += diagnostics.renderPasses;
      uploadBytes += diagnostics.uploadBytes; allocatedBytes += diagnostics.allocatedBytes;
      eventPasses += diagnostics.eventCount; eventAttempts += diagnostics.eventAttempts;
      eventLosses += diagnostics.eventOccupiedDrops + diagnostics.eventBudgetDrops + (diagnostics.eventContentionLosses ?? 0) + (diagnostics.eventGenerationDrops ?? 0);
      backendFallbackCount += diagnostics.backendFallbackCount ?? 0; allocationsAfterWarmup += diagnostics.allocationsAfterWarmup ?? 0;
      if (diagnostics.diagnosticAccuracy === undefined || diagnostics.diagnosticAccuracy === 'estimated') diagnosticAccuracy = 'estimated';
      else if (diagnostics.diagnosticAccuracy === 'delayed' && diagnosticAccuracy === 'exact') diagnosticAccuracy = 'delayed';
    }
    return Object.freeze({ backend: this.backend.kind, activeInstances: this.instances.size, registeredPrograms: this.programs.size, capacity, activeEstimate, spawnedParticles, droppedParticles, simulationPasses, renderPasses, uploadBytes, allocatedBytes, eventPasses, eventAttempts, eventLosses, backendFallbackCount, allocationsAfterWarmup, diagnosticAccuracy });
  }

  dispose(): void {
    if (this.disposed) return;
    for (const instance of [...this.instances.values()]) instance.dispose();
    for (const record of this.programs.values()) record.backend.dispose();
    this.instances.clear(); this.programs.clear(); this.disposed = true;
  }

  private removeInstance(effectId: string, id: number): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    this.instances.delete(id);
    this.programs.get(effectId)?.instances.delete(instance);
  }

  private assertUsable(): void { if (this.disposed) throw new Error('Particle effects runtime is disposed'); }
}

class MutableEmission implements ParticleRuntimeEmission2D {
  instanceId = 0; emitterIndex = 0; count = 0; positionX = 0; positionY = 0; direction = 0; spread = 0; power = 0; seed = 0; importance = 0;
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

  constructor(readonly definition: ParticleEmitterDefinition2D, readonly index: number) {}
  reset(): void { this.active = false; this.elapsed = 0; this.rateAccumulator = 0; this.burstIndex = 0; this.loops = 0; this.lastX = 0; this.lastY = 0; }
}

class MutableEmissionOverride implements ParticleEmissionOverride2D {
  count?: number; position?: readonly [number, number]; direction?: number; spread?: number; power?: number; seed?: number;
  readonly point: [number, number] = [0, 0];
  clear(): void { delete this.count; delete this.position; delete this.direction; delete this.spread; delete this.power; delete this.seed; }
}

class RuntimeParticleEmitterHandle2D implements ParticleEmitterHandle2D, ParticleEmissionWriter2D {
  private readonly override = new MutableEmissionOverride();
  constructor(readonly id: string, private readonly owner: RuntimeParticleEffectInstance2D) {}
  emit(count?: number): void { this.override.clear(); if (count !== undefined) this.override.count = count; this.owner.emit(this.id, this.override); }
  emitAt(x: number, y: number, count?: number): void { this.override.clear(); this.override.point[0] = x; this.override.point[1] = y; this.override.position = this.override.point; if (count !== undefined) this.override.count = count; this.owner.emit(this.id, this.override); }
  writer(): ParticleEmissionWriter2D { return this.reset(); }
  count(value: number): ParticleEmissionWriter2D { this.override.count = value; return this; }
  position(x: number, y: number): ParticleEmissionWriter2D { this.override.point[0] = x; this.override.point[1] = y; this.override.position = this.override.point; return this; }
  direction(value: number): ParticleEmissionWriter2D { this.override.direction = value; return this; }
  spread(value: number): ParticleEmissionWriter2D { this.override.spread = value; return this; }
  power(value: number): ParticleEmissionWriter2D { this.override.power = value; return this; }
  seed(value: number): ParticleEmissionWriter2D { this.override.seed = value; return this; }
  submit(): void { this.owner.emit(this.id, this.override); this.override.clear(); }
  reset(): ParticleEmissionWriter2D { this.override.clear(); return this; }
}

class RuntimeParticleEffectInstance2D implements ParticleEffectInstance2D {
  private program: CompiledParticleProgram2D;
  private backend: ParticleEffectBackendResource2D;
  private statusValue: ParticleEffectInstanceStatus2D = 'idle';
  private elapsed = 0;
  private seed: number;
  private transform: ParticleTransform2D;
  private parameters: Record<string, ParticleParameterValue2D>;
  private palette: ParticlePalette2D;
  private timescale: number;
  private tier: ParticleRenderTier2D;
  private drainRemaining = 0;
  private readonly emitters: EmitterRuntime[];
  private readonly emitterHandles: Map<string, RuntimeParticleEmitterHandle2D>;
  private readonly scheduler: ParticleGraphScheduler2D;

  constructor(
    readonly id: number,
    program: CompiledParticleProgram2D,
    backend: ParticleEffectBackendResource2D,
    options: ParticleEffectInstanceOptions2D,
    private readonly onDispose: (id: number) => void,
    onReference: (effectId: string) => void,
  ) {
    this.program = program; this.backend = backend; this.seed = options.seed ?? mixSeed(id, 0x9e3779b9);
    this.transform = options.transform ?? DEFAULT_TRANSFORM;
    this.parameters = { ...resolveParticleParameters2D(program.effect.source, options.parameters) };
    this.palette = options.palette ?? EMPTY_PALETTE; this.timescale = validateTimescale(options.timescale ?? 1);
    this.tier = options.qualityTier ?? program.effect.source.quality.defaultTier;
    this.emitters = program.effect.source.emitters.map((entry, index) => new EmitterRuntime(entry, index));
    this.emitterHandles = new Map(this.emitters.map((entry) => [entry.definition.id, new RuntimeParticleEmitterHandle2D(entry.definition.id, this)]));
    this.scheduler = new ParticleGraphScheduler2D(
      program.effect.source,
      () => this.parameters,
      {
        emit: (emitterId) => { this.activateGraphEmitter(emitterId); },
        stop: (emitterId, mode) => { if (emitterId) { const emitter = this.emitters.find((entry) => entry.definition.id === emitterId); if (emitter) emitter.active = false; } else this.stop(mode); },
        signal: (signal) => { this.scheduler.trigger({ kind: 'signal', signal }); },
        reference: onReference,
      },
      this.seed,
    );
    backend.setPalette(this.palette);
  }

  get isAdvancing(): boolean { return this.statusValue === 'running' || this.statusValue === 'draining'; }
  get isVisible(): boolean { return this.statusValue !== 'idle' && this.statusValue !== 'complete' && this.statusValue !== 'disposed'; }
  get currentTimescale(): number { return this.timescale; }
  get currentTier(): ParticleRenderTier2D { return this.tier; }

  start(): void {
    this.assertUsable();
    if (this.statusValue === 'running') return;
    this.statusValue = 'running';
    this.emitters.forEach((emitter) => { emitter.reset(); });
    this.scheduler.start();
  }

  stop(mode: ParticleEmitterStopMode2D = 'drain'): void {
    this.assertUsable();
    for (const emitter of this.emitters) emitter.active = false;
    this.statusValue = mode === 'kill' ? 'complete' : 'draining';
    if (mode === 'kill') this.backend.clear();
  }

  pause(): void { this.assertUsable(); if (this.statusValue === 'running' || this.statusValue === 'draining') this.statusValue = 'paused'; }
  resume(): void { this.assertUsable(); if (this.statusValue === 'paused') this.statusValue = 'running'; }

  restart(seed = mixSeed(this.seed, 0x85ebca6b)): void {
    this.assertUsable(); this.seed = seed >>> 0; this.elapsed = 0; this.backend.clear(); this.emitters.forEach((emitter) => { emitter.reset(); }); this.scheduler.reset(this.seed); this.statusValue = 'idle'; this.start();
  }

  trigger(signal: string, payload: ParticleSignalPayload2D = {}): void {
    this.assertUsable();
    if (signal.trim().length === 0) throw new Error('Particle effect signal cannot be empty');
    if (payload.position) this.transform = { ...this.transform, position: payload.position };
    this.scheduler.trigger({ kind: 'signal', signal });
  }

  emit(emitterId: string, override: ParticleEmissionOverride2D = {}): void {
    this.assertUsable();
    const emitter = this.emitters.find((entry) => entry.definition.id === emitterId);
    if (!emitter) throw new Error(`Unknown particle emitter: ${emitterId}`);
    if (this.statusValue === 'idle' || this.statusValue === 'complete') this.statusValue = 'running';
    this.submit(emitter, override.count ?? firstBurstCount(emitter.definition), override);
  }
  emitter(emitterId: string): ParticleEmitterHandle2D {
    this.assertUsable();
    const handle = this.emitterHandles.get(emitterId);
    if (!handle) throw new Error(`Unknown particle emitter: ${emitterId}`);
    return handle;
  }

  setTransform(transform: ParticleTransform2D): void { this.assertUsable(); validateTransform(transform); this.transform = transform; }
  setParameter(name: string, value: ParticleParameterValue2D): void { this.assertUsable(); this.parameters = { ...resolveParticleParameters2D(this.program.effect.source, { ...this.parameters, [name]: value }) }; }
  setPalette(palette: ParticlePalette2D): void { this.assertUsable(); this.palette = palette; this.backend.setPalette(palette); }
  setTimescale(value: number): void { this.assertUsable(); this.timescale = validateTimescale(value); }
  setQualityTier(tier: ParticleRenderTier2D): void { this.assertUsable(); if (!this.program.effect.source.renderRecipes.recipes.some((entry) => entry.tier === tier)) throw new Error(`Particle effect does not render tier: ${tier}`); this.tier = tier; }

  state(): ParticleEffectInstanceState2D {
    return Object.freeze({ id: this.id, effectId: this.program.effect.source.id, status: this.statusValue, elapsed: this.elapsed, seed: this.seed, timescale: this.timescale, qualityTier: this.tier, activeEmitters: this.emitters.reduce((count, emitter) => count + Number(emitter.active), 0) });
  }
  diagnostics(): ParticleEffectBackendDiagnostics2D { return this.backend.diagnostics(); }
  dispose(): void { if (this.statusValue === 'disposed') return; this.statusValue = 'disposed'; this.onDispose(this.id); }

  update(deltaSeconds: number): void {
    if (!this.isAdvancing) return;
    const delta = deltaSeconds * this.timescale;
    this.elapsed += delta;
    this.scheduler.update(delta);
    let active = false;
    for (const emitter of this.emitters) { if (emitter.active) { active = true; this.advanceEmitter(emitter, delta); } }
    if (!active && this.statusValue === 'running') this.statusValue = 'draining';
    if (!active && this.statusValue === 'draining') {
      this.drainRemaining = Math.max(0, this.drainRemaining - delta);
      if (this.drainRemaining === 0) this.statusValue = 'complete';
    }
  }

  replaceProgram(program: CompiledParticleProgram2D, backend: ParticleEffectBackendResource2D): void {
    if (program.effect.abiHash !== this.program.effect.abiHash) throw new Error(`Hot reload of ${program.effect.source.id} changed its particle ABI; restart its instances`);
    this.program = program; this.backend = backend; this.parameters = { ...resolveParticleParameters2D(program.effect.source, this.parameters) }; backend.setPalette(this.palette);
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
      if (count > 0) { emitter.rateAccumulator -= count; this.submit(emitter, count); }
    }
    const duration = timeline.duration;
    if (duration !== undefined && emitter.elapsed >= duration) {
      if (timeline.loop && (timeline.maxLoops === undefined || emitter.loops + 1 < timeline.maxLoops)) {
        emitter.elapsed %= Math.max(duration, Number.EPSILON); emitter.burstIndex = 0; emitter.loops += 1;
      } else emitter.active = false;
    }
  }

  private submit(emitter: EmitterRuntime, requestedCount: number, override: ParticleEmissionOverride2D = {}): void {
    const qualityScale = emitter.definition.limits.qualityScale?.[this.tier] ?? 1;
    const count = Math.max(0, Math.min(Math.round(requestedCount * qualityScale), emitter.definition.limits.maxPerFrame ?? Number.MAX_SAFE_INTEGER));
    if (count === 0) return;
    const emission = emitter.emission;
    emission.instanceId = this.id; emission.emitterIndex = emitter.index; emission.count = count;
    emission.positionX = override.position?.[0] ?? this.transform.position[0]; emission.positionY = override.position?.[1] ?? this.transform.position[1];
    emission.direction = override.direction ?? this.transform.rotation; emission.spread = override.spread ?? sourceNumber(emitter.definition.initialization?.spread, this.parameters, this.seed, emitter.index, 0);
    emission.power = override.power ?? sourceNumber(emitter.definition.initialization?.power, this.parameters, this.seed, emitter.index, 1);
    emission.seed = override.seed ?? mixSeed(this.seed, emitter.index + Math.round(this.elapsed * 1000));
    emission.importance = importanceCode(emitter.definition.limits.importance);
    this.backend.emit(emission);
    const archetype = this.program.effect.source.archetypes[this.program.effect.archetypeIds[emitter.definition.archetypeId] ?? -1];
    if (archetype) this.drainRemaining = Math.max(this.drainRemaining, archetype.lifecycle.lifetime * (1 + (archetype.lifecycle.lifetimeVariability ?? 0)));
  }

  private activateGraphEmitter(emitterId: string): void {
    const emitter = this.emitters.find((entry) => entry.definition.id === emitterId);
    if (!emitter) throw new Error(`Unknown particle emitter: ${emitterId}`);
    const timeline = emitter.definition.timeline;
    if (timeline.manual) { this.submit(emitter, firstBurstCount(emitter.definition)); return; }
    emitter.reset(); emitter.active = true; emitter.elapsed = -(timeline.startDelay ?? 0);
    if (timeline.prewarm && (timeline.duration ?? 0) > 0) this.advanceEmitter(emitter, timeline.duration ?? 0);
  }

  private assertUsable(): void { if (this.statusValue === 'disposed') throw new Error('Particle effect instance is disposed'); }
}

function firstBurstCount(emitter: ParticleEmitterDefinition2D): number { return emitter.timeline.bursts?.[0]?.count ?? 1; }
function importanceCode(importance: ParticleEmitterDefinition2D['limits']['importance']): number { return ['cosmetic', 'secondary', 'primary', 'critical'].indexOf(importance); }
function higherTier(current: ParticleRenderTier2D | undefined, next: ParticleRenderTier2D): ParticleRenderTier2D { return !current || ['basic', 'enhanced', 'ultra'].indexOf(next) > ['basic', 'enhanced', 'ultra'].indexOf(current) ? next : current; }
function validateTimescale(value: number): number { if (!Number.isFinite(value) || value < 0 || value > 16) throw new Error('Particle effect timescale must be between 0 and 16'); return value; }
function validateTransform(transform: ParticleTransform2D): void { if (![...transform.position, transform.rotation, ...transform.scale].every(Number.isFinite)) throw new Error('Particle transform values must be finite'); }
function mixSeed(a: number, b: number): number { let value = (a ^ b) >>> 0; value = Math.imul(value ^ (value >>> 16), 0x7feb352d); value = Math.imul(value ^ (value >>> 15), 0x846ca68b); return (value ^ (value >>> 16)) >>> 0; }
function random01(seed: number): number { return mixSeed(seed, 0x27d4eb2d) / 0x1_0000_0000; }
function evaluateRate(source: import('./ParticleEffectGraph2D.js').ParticleValueSource2D | undefined, parameters: Readonly<Record<string, ParticleParameterValue2D>>, seed: number, salt: number): number { return sourceNumber(source, parameters, seed, salt, 0); }
function sourceNumber(source: import('./ParticleEffectGraph2D.js').ParticleValueSource2D | undefined, parameters: Readonly<Record<string, ParticleParameterValue2D>>, seed: number, salt: number, fallback: number): number {
  if (!source) return fallback;
  if (source.kind === 'constant') return source.value;
  if (source.kind === 'parameter') { const value = parameters[source.parameterId]; return typeof value === 'number' ? value * (source.scale ?? 1) + (source.offset ?? 0) : fallback; }
  if (source.kind === 'random') return source.min + (source.max - source.min) * random01(mixSeed(seed, salt));
  return source.curve.keys[0]?.value ?? fallback;
}
