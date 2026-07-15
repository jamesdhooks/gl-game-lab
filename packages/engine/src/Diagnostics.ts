import type { AssetCacheDiagnostics, SystemProfiler } from '@hooksjam/gl-game-lab-core';

export type PerformanceTier = 'desktop' | 'mobile';

export interface SystemTimingSample {
  readonly id: string;
  readonly stage: string;
  readonly calls: number;
  readonly cpuMs: number;
}

export interface RendererDiagnostics {
  readonly backend: string;
  readonly drawCalls: number;
  readonly points: number;
  readonly triangles: number;
  readonly bufferUploadBytes: number;
  readonly textureUploadBytes: number;
  readonly transientAllocationBytes: number;
  readonly gpuResourceCount: number;
  readonly gpuResourceBytes: number;
  readonly renderPasses: readonly string[];
  readonly gpuMs?: number;
}

export interface EngineDiagnosticsSnapshot {
  readonly frame: number;
  readonly frameCpuMs: number;
  readonly requestedDeltaMs: number;
  readonly fps: number;
  readonly systems: readonly SystemTimingSample[];
  readonly assets: AssetCacheDiagnostics;
  readonly renderer: RendererDiagnostics | undefined;
}

export interface PerformanceBudget {
  readonly minimumSamples: number;
  readonly p95FrameMs: number;
  readonly maxDrawCalls: number;
  readonly maxUploadBytesPerFrame: number;
  readonly maxGpuResourceBytes: number;
  readonly maxTransientAllocationBytes: number;
}

export interface PerformanceBudgetResult {
  readonly tier: PerformanceTier;
  readonly samples: number;
  readonly p95FrameMs: number;
  readonly passed: boolean;
  readonly violations: readonly string[];
}

export const DEFAULT_PERFORMANCE_BUDGETS: Readonly<Record<PerformanceTier, PerformanceBudget>> = Object.freeze({
  desktop: Object.freeze({ minimumSamples: 120, p95FrameMs: 16.67, maxDrawCalls: 64, maxUploadBytesPerFrame: 32 * 1024 * 1024, maxGpuResourceBytes: 512 * 1024 * 1024, maxTransientAllocationBytes: 2 * 1024 * 1024 }),
  mobile: Object.freeze({ minimumSamples: 120, p95FrameMs: 33.34, maxDrawCalls: 48, maxUploadBytesPerFrame: 12 * 1024 * 1024, maxGpuResourceBytes: 256 * 1024 * 1024, maxTransientAllocationBytes: 1024 * 1024 }),
});

interface MutableSystemTiming { id: string; stage: string; calls: number; cpuMs: number }
const FPS_HISTORY_LIMIT = 60;

/** Low-overhead CPU/system profiler and machine-readable release capture. */
export class EngineDiagnostics implements SystemProfiler {
  private readonly frameDurations: number[] = [];
  private readonly requestedDeltaHistory: number[] = [];
  private requestedDeltaTotal = 0;
  private readonly systems = new Map<string, MutableSystemTiming>();
  private frameStartedAt = 0;
  private requestedDeltaMs = 0;
  private frameNumber = 0;
  private renderer: RendererDiagnostics | undefined;
  private current: EngineDiagnosticsSnapshot | undefined;

  constructor(private readonly now: () => number = defaultNow, private readonly historyLimit = 600) {
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) throw new Error('Diagnostics history limit must be a positive integer');
  }

  beginFrame(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Diagnostics frame delta must be non-negative');
    this.systems.clear();
    this.renderer = undefined;
    this.requestedDeltaMs = deltaSeconds * 1000;
    this.frameStartedAt = this.now();
  }

  measure(systemId: string, stage: string, run: () => void): void {
    const started = this.now();
    try { run(); } finally {
      const elapsed = Math.max(0, this.now() - started);
      const key = `${stage}\u0000${systemId}`;
      const timing = this.systems.get(key) ?? { id: systemId, stage, calls: 0, cpuMs: 0 };
      timing.calls += 1;
      timing.cpuMs += elapsed;
      this.systems.set(key, timing);
    }
  }

  reportRenderer(snapshot: RendererDiagnostics): void { this.renderer = freezeRenderer(snapshot); }

  endFrame(assets: AssetCacheDiagnostics): EngineDiagnosticsSnapshot {
    const frameCpuMs = Math.max(0, this.now() - this.frameStartedAt);
    this.frameDurations.push(frameCpuMs);
    if (this.frameDurations.length > this.historyLimit) this.frameDurations.shift();
    if (this.requestedDeltaMs > 0) {
      this.requestedDeltaHistory.push(this.requestedDeltaMs);
      this.requestedDeltaTotal += this.requestedDeltaMs;
      if (this.requestedDeltaHistory.length > Math.min(this.historyLimit, FPS_HISTORY_LIMIT)) {
        this.requestedDeltaTotal -= this.requestedDeltaHistory.shift() ?? 0;
      }
    }
    const averageRequestedDeltaMs = this.requestedDeltaHistory.length > 0
      ? this.requestedDeltaTotal / this.requestedDeltaHistory.length
      : 0;
    this.frameNumber += 1;
    this.current = Object.freeze({
      frame: this.frameNumber,
      frameCpuMs,
      requestedDeltaMs: this.requestedDeltaMs,
      fps: averageRequestedDeltaMs > 0 ? 1000 / averageRequestedDeltaMs : 0,
      systems: Object.freeze([...this.systems.values()].map((timing) => Object.freeze({ ...timing }))),
      assets,
      renderer: this.renderer,
    });
    return this.current;
  }

  snapshot(): EngineDiagnosticsSnapshot | undefined { return this.current; }

  capture(): string {
    return JSON.stringify({ snapshot: this.current, frameDurationsMs: this.frameDurations });
  }

  evaluate(tier: PerformanceTier, override: Partial<PerformanceBudget> = {}): PerformanceBudgetResult {
    const budget = { ...DEFAULT_PERFORMANCE_BUDGETS[tier], ...override };
    const p95 = percentile(this.frameDurations, 0.95);
    const violations: string[] = [];
    if (this.frameDurations.length < budget.minimumSamples) violations.push(`requires ${budget.minimumSamples} samples; captured ${this.frameDurations.length}`);
    if (p95 > budget.p95FrameMs) violations.push(`p95 frame ${p95.toFixed(2)}ms exceeds ${budget.p95FrameMs.toFixed(2)}ms`);
    const renderer = this.current?.renderer;
    if (renderer && renderer.drawCalls > budget.maxDrawCalls) violations.push(`draw calls ${renderer.drawCalls} exceed ${budget.maxDrawCalls}`);
    if (renderer && renderer.bufferUploadBytes + renderer.textureUploadBytes > budget.maxUploadBytesPerFrame) violations.push('per-frame uploads exceed budget');
    if (renderer && renderer.gpuResourceBytes > budget.maxGpuResourceBytes) violations.push('GPU resources exceed budget');
    if (renderer && renderer.transientAllocationBytes > budget.maxTransientAllocationBytes) violations.push('tracked transient allocations exceed budget');
    return Object.freeze({ tier, samples: this.frameDurations.length, p95FrameMs: p95, passed: violations.length === 0, violations: Object.freeze(violations) });
  }
}

function freezeRenderer(snapshot: RendererDiagnostics): RendererDiagnostics {
  return Object.freeze({ ...snapshot, renderPasses: Object.freeze([...snapshot.renderPasses]) });
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}
