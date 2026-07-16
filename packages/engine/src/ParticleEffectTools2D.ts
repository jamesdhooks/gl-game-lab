import type { ParticleEmitterImportance2D, ParticleParameterValue2D } from './ParticleEffectGraph2D.js';
import type { ParticleEffectInstance2D, ParticleEffectsDiagnostics2D, ParticleSignalPayload2D, ParticleTransform2D } from './ParticleEffectRuntime2D.js';
import type { ParticleRenderTier2D } from './ParticleEffects2D.js';

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
  | { readonly time: number; readonly kind: 'timescale'; readonly value: number };

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
    this.events.push(Object.freeze(event));
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
  }
}

function budgetReason(frameMs: number, diagnostics: ParticleEffectsDiagnostics2D, limits: ParticleBudgetLimits2D): ParticleBudgetDecision2D['reason'] | undefined {
  if (frameMs > limits.targetFrameMs) return 'frame-time';
  if (diagnostics.activeEstimate > limits.maximumParticles) return 'particles';
  if (diagnostics.uploadBytes > limits.maximumUploadBytes) return 'uploads';
  if (diagnostics.simulationPasses > limits.maximumSimulationPasses) return 'passes';
  return undefined;
}

function lowerTier(tier: ParticleRenderTier2D): ParticleRenderTier2D { return tier === 'ultra' ? 'enhanced' : 'basic'; }
