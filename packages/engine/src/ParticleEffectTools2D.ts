import type { ParticleEmitterImportance2D, ParticleParameterValue2D } from './ParticleEffectGraph2D.js';
import type { ParticleEffectInstance2D, ParticleEffectsDiagnostics2D, ParticleEmissionOverride2D, ParticleSignalPayload2D, ParticleTransform2D } from './ParticleEffectRuntime2D.js';
import type { ParticlePalette2D, ParticleRenderTier2D } from './ParticleEffects2D.js';

export interface ParticleBudgetLimits2D {
  readonly targetFrameMs: number;
  readonly maximumParticles: number;
  readonly maximumUploadBytes: number;
  readonly maximumSimulationPasses: number;
  readonly recoveryFrames?: number;
}

export interface ParticleBudgetDecision2D {
  readonly tier: ParticleRenderTier2D;
  readonly emissionScale: Readonly<Record<ParticleEmitterImportance2D, number>>;
  readonly constrained: boolean;
  readonly reason?: 'frame-time' | 'particles' | 'uploads' | 'passes';
}

const FULL_EMISSION = Object.freeze({ critical: 1, primary: 1, secondary: 1, cosmetic: 1 });

export class ParticleEffectBudgetController2D {
  private constrainedFrames = 0;
  private recoveryFrames = 0;

  constructor(private readonly limits: ParticleBudgetLimits2D) {
    if (!Number.isFinite(limits.targetFrameMs) || limits.targetFrameMs <= 0) throw new Error('Particle budget target frame time must be positive');
  }

  evaluate(frameMs: number, diagnostics: ParticleEffectsDiagnostics2D, requestedTier: ParticleRenderTier2D): ParticleBudgetDecision2D {
    const reason = budgetReason(frameMs, diagnostics, this.limits);
    if (reason) { this.constrainedFrames += 1; this.recoveryFrames = 0; }
    else if (this.constrainedFrames > 0) {
      this.recoveryFrames += 1;
      if (this.recoveryFrames >= (this.limits.recoveryFrames ?? 45)) { this.constrainedFrames = 0; this.recoveryFrames = 0; }
    }
    if (this.constrainedFrames === 0) return Object.freeze({ tier: requestedTier, emissionScale: FULL_EMISSION, constrained: false });
    const severe = this.constrainedFrames >= 8 || frameMs > this.limits.targetFrameMs * 1.75;
    return Object.freeze({
      tier: severe ? 'basic' : lowerTier(requestedTier),
      emissionScale: Object.freeze({ critical: 1, primary: severe ? 0.72 : 0.88, secondary: severe ? 0.25 : 0.58, cosmetic: severe ? 0 : 0.2 }),
      constrained: true,
      ...(reason ? { reason } : {}),
    });
  }
}

export type ParticleReplayEvent2D =
  | { readonly time: number; readonly kind: 'start' | 'pause' | 'resume' | 'restart' | 'stop'; readonly numberValue?: number; readonly stringValue?: string }
  | { readonly time: number; readonly kind: 'signal'; readonly name: string; readonly payload?: ParticleSignalPayload2D }
  | { readonly time: number; readonly kind: 'parameter'; readonly name: string; readonly value: ParticleParameterValue2D }
  | { readonly time: number; readonly kind: 'transform'; readonly value: ParticleTransform2D }
  | { readonly time: number; readonly kind: 'tier'; readonly value: ParticleRenderTier2D }
  | { readonly time: number; readonly kind: 'timescale'; readonly value: number }
  | { readonly time: number; readonly kind: 'palette'; readonly value: ParticlePalette2D }
  | { readonly time: number; readonly kind: 'emission'; readonly emitterId: string; readonly override?: ParticleEmissionOverride2D }
  | { readonly time: number; readonly kind: 'pointer-emission'; readonly emitterId: string; readonly pointer: ParticlePointerEmissionSource2D; readonly override?: ParticleEmissionOverride2D };

export interface ParticlePointerEmissionSource2D {
  readonly phase: 'down' | 'move' | 'up';
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
}

export interface ParticleEffectReplay2D {
  readonly effectId: string;
  readonly initialSeed: number;
  readonly events: readonly ParticleReplayEvent2D[];
}

export class ParticleEffectRecorder2D {
  private readonly events: ParticleReplayEvent2D[] = [];
  constructor(readonly effectId: string, readonly initialSeed: number) {}
  record(event: ParticleReplayEvent2D): void {
    if (!Number.isFinite(event.time) || event.time < 0) throw new Error('Particle replay event time must be finite and non-negative');
    const previous = this.events[this.events.length - 1];
    if (previous && event.time < previous.time) throw new Error('Particle replay events must be chronological');
    this.events.push(freezeReplayEvent(event));
  }
  finish(): ParticleEffectReplay2D { return Object.freeze({ effectId: this.effectId, initialSeed: this.initialSeed, events: Object.freeze([...this.events]) }); }
}

export class ParticleEffectReplayPlayer2D {
  private index = 0;
  private elapsed = 0;
  constructor(private readonly replay: ParticleEffectReplay2D, private readonly instance: ParticleEffectInstance2D) {
    if (instance.state().effectId !== replay.effectId) throw new Error('Particle replay effect does not match its target instance');
    instance.restart(replay.initialSeed);
  }
  update(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Particle replay delta must be finite and non-negative');
    this.elapsed += deltaSeconds;
    while (this.index < this.replay.events.length && this.replay.events[this.index]!.time <= this.elapsed) this.apply(this.replay.events[this.index++]!);
    return this.index >= this.replay.events.length;
  }
  reset(): void { this.index = 0; this.elapsed = 0; this.instance.restart(this.replay.initialSeed); }
  private apply(event: ParticleReplayEvent2D): void {
    if (event.kind === 'start') this.instance.start();
    else if (event.kind === 'pause') this.instance.pause();
    else if (event.kind === 'resume') this.instance.resume();
    else if (event.kind === 'restart') this.instance.restart(event.numberValue);
    else if (event.kind === 'stop') this.instance.stop(event.stringValue === 'kill' ? 'kill' : 'drain');
    else if (event.kind === 'signal') this.instance.trigger(event.name, event.payload);
    else if (event.kind === 'parameter') this.instance.setParameter(event.name, event.value);
    else if (event.kind === 'transform') this.instance.setTransform(event.value);
    else if (event.kind === 'tier') this.instance.setQualityTier(event.value);
    else if (event.kind === 'timescale') this.instance.setTimescale(event.value);
    else if (event.kind === 'palette') this.instance.setPalette(event.value);
    else if (event.kind === 'emission' || event.kind === 'pointer-emission') this.instance.emit(event.emitterId, event.override);
  }
}

/** Records and applies authoring-level commands while keeping particle state GPU-resident. */
export class ParticleEffectCaptureSession2D {
  readonly recorder: ParticleEffectRecorder2D;
  constructor(
    private readonly instance: ParticleEffectInstance2D,
    private readonly clock: () => number,
  ) {
    const state = instance.state();
    this.recorder = new ParticleEffectRecorder2D(state.effectId, state.seed);
  }
  emit(emitterId: string, override?: ParticleEmissionOverride2D): void {
    this.instance.emit(emitterId, override);
    this.recorder.record({ time: this.time(), kind: 'emission', emitterId, ...(override ? { override } : {}) });
  }
  emitFromPointer(emitterId: string, pointer: ParticlePointerEmissionSource2D, override?: ParticleEmissionOverride2D): void {
    this.instance.emit(emitterId, override);
    this.recorder.record({ time: this.time(), kind: 'pointer-emission', emitterId, pointer, ...(override ? { override } : {}) });
  }
  setParameter(name: string, value: ParticleParameterValue2D): void {
    this.instance.setParameter(name, value);
    this.recorder.record({ time: this.time(), kind: 'parameter', name, value });
  }
  setPalette(value: ParticlePalette2D): void {
    this.instance.setPalette(value);
    this.recorder.record({ time: this.time(), kind: 'palette', value });
  }
  trigger(name: string, payload?: ParticleSignalPayload2D): void {
    this.instance.trigger(name, payload);
    this.recorder.record({ time: this.time(), kind: 'signal', name, ...(payload ? { payload } : {}) });
  }
  finish(): ParticleEffectReplay2D { return this.recorder.finish(); }
  private time(): number {
    const value = this.clock();
    if (!Number.isFinite(value) || value < 0) throw new Error('Particle capture clock must be finite and non-negative');
    return value;
  }
}

function freezeReplayEvent(event: ParticleReplayEvent2D): ParticleReplayEvent2D {
  if (event.kind === 'palette') {
    return Object.freeze({ ...event, value: Object.freeze({ revision: event.value.revision, colors: Object.freeze(event.value.colors.map((color) => Object.freeze([...color] as [number, number, number]))) }) });
  }
  if (event.kind === 'emission' || event.kind === 'pointer-emission') {
    const override = event.override ? Object.freeze({ ...event.override, ...(event.override.position ? { position: Object.freeze([...event.override.position] as [number, number]) } : {}), ...(event.override.inheritedVelocity ? { inheritedVelocity: Object.freeze([...event.override.inheritedVelocity] as [number, number]) } : {}) }) : undefined;
    if (event.kind === 'pointer-emission') return Object.freeze({ ...event, pointer: Object.freeze({ ...event.pointer }), ...(override ? { override } : {}) });
    return Object.freeze({ ...event, ...(override ? { override } : {}) });
  }
  if (event.kind === 'signal') return Object.freeze({ ...event, ...(event.payload ? { payload: Object.freeze({ ...event.payload, ...(event.payload.position ? { position: Object.freeze([...event.payload.position] as [number, number]) } : {}), ...(event.payload.velocity ? { velocity: Object.freeze([...event.payload.velocity] as [number, number]) } : {}) }) } : {}) });
  if (event.kind === 'transform') return Object.freeze({ ...event, value: Object.freeze({ ...event.value, position: Object.freeze([...event.value.position] as [number, number]), scale: Object.freeze([...event.value.scale] as [number, number]) }) });
  return Object.freeze({ ...event });
}

function budgetReason(frameMs: number, diagnostics: ParticleEffectsDiagnostics2D, limits: ParticleBudgetLimits2D): ParticleBudgetDecision2D['reason'] | undefined {
  if (frameMs > limits.targetFrameMs) return 'frame-time';
  if (diagnostics.activeEstimate > limits.maximumParticles) return 'particles';
  if (diagnostics.uploadBytes > limits.maximumUploadBytes) return 'uploads';
  if (diagnostics.simulationPasses > limits.maximumSimulationPasses) return 'passes';
  return undefined;
}

function lowerTier(tier: ParticleRenderTier2D): ParticleRenderTier2D { return tier === 'ultra' ? 'enhanced' : 'basic'; }
