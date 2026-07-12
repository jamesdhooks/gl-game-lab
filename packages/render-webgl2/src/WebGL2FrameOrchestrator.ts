import type { RendererDiagnostics } from '@hooksjam/gl-game-lab-engine';
import type { ParticlePointDrawPlan } from './ParticlePointRenderer.js';
import type { SpriteDrawPlan } from './SpriteRenderer.js';
import {
  FrameRenderPipeline,
  type FrameRenderDestination,
  type FrameRenderStages,
} from './FrameRenderPipeline.js';
import type { WebGL2DeviceDiagnostics } from './WebGL2Device.js';

interface GpuFrameDiagnostics {
  readonly drawCalls: number;
  readonly points: number;
  readonly uploadBytes: number;
  readonly submissions: number;
}

interface GpuFrameTimer {
  readonly latestMs: number | undefined;
  begin(): void;
  end(): void;
}

export interface WebGL2FrameStages extends Omit<FrameRenderStages, 'particles' | 'sprites'> {
  particles(destination: FrameRenderDestination): ParticlePointDrawPlan;
  sprites(destination: FrameRenderDestination): SpriteDrawPlan;
}

export interface WebGL2FrameMetricSources {
  readonly backendId: string;
  readonly timer: GpuFrameTimer;
  beginGpuFrame(): void;
  gpuDiagnostics(): GpuFrameDiagnostics;
  deviceDiagnostics(): WebGL2DeviceDiagnostics;
  fallbackSpritePlan(): SpriteDrawPlan;
  fallbackParticlePlan(): ParticlePointDrawPlan;
  effectCount(): number;
  gpuPassCount(): number;
  bloomPassCount(): number;
  consumeTransientAllocationBytes(): number;
}

export interface WebGL2FrameCounters {
  readonly bufferUploadBytes: number;
  readonly textureUploadBytes: number;
  readonly gpuDrawCalls: number;
  readonly backdropEnabled: boolean;
}

/** Owns one shipping frame's pass execution and diagnostics aggregation. */
export class WebGL2FrameOrchestrator {
  readonly pipeline: FrameRenderPipeline;
  private renderedSpritePlan: SpriteDrawPlan | undefined;
  private renderedParticlePlan: ParticlePointDrawPlan | undefined;

  constructor(
    stages: WebGL2FrameStages,
    private readonly metrics: WebGL2FrameMetricSources,
  ) {
    this.pipeline = new FrameRenderPipeline({
      clear: stages.clear,
      backdrop: stages.backdrop,
      gpuSimulation: stages.gpuSimulation,
      effects: stages.effects,
      particles: (destination) => {
        this.renderedParticlePlan = stages.particles(destination);
      },
      sprites: (destination) => {
        this.renderedSpritePlan = stages.sprites(destination);
      },
      composite: stages.composite,
    });
  }

  execute(destination: FrameRenderDestination, counters: WebGL2FrameCounters): RendererDiagnostics {
    this.renderedSpritePlan = undefined;
    this.renderedParticlePlan = undefined;
    this.metrics.beginGpuFrame();
    this.metrics.timer.begin();
    try {
      this.pipeline.execute(destination);
    } finally {
      this.metrics.timer.end();
    }

    const sprites = this.renderedSpritePlan ?? this.metrics.fallbackSpritePlan();
    const particles = this.renderedParticlePlan ?? this.metrics.fallbackParticlePlan();
    const gpu = this.metrics.gpuDiagnostics();
    const device = this.metrics.deviceDiagnostics();
    const bloomPasses = this.metrics.bloomPassCount();
    const rawGpuPasses = Math.max(0, this.metrics.gpuPassCount() - gpu.submissions);
    const backdropPasses = counters.backdropEnabled ? 1 : 0;
    const gpuMs = this.metrics.timer.latestMs;

    return Object.freeze({
      backend: this.metrics.backendId,
      drawCalls: sprites.batches.length + particles.drawCalls + this.metrics.effectCount()
        + gpu.drawCalls + counters.gpuDrawCalls + rawGpuPasses + backdropPasses + bloomPasses,
      points: particles.particleCount + gpu.points,
      triangles: sprites.spriteCount * 2 + this.metrics.effectCount() + rawGpuPasses
        + backdropPasses + bloomPasses,
      bufferUploadBytes: counters.bufferUploadBytes
        + sprites.spriteCount * 15 * Float32Array.BYTES_PER_ELEMENT
        + particles.particleCount * 4 * Float32Array.BYTES_PER_ELEMENT
        + gpu.uploadBytes,
      textureUploadBytes: counters.textureUploadBytes,
      transientAllocationBytes: this.metrics.consumeTransientAllocationBytes(),
      gpuResourceCount: device.textureCount + device.ownedContextResourceCount,
      gpuResourceBytes: device.estimatedGpuBytes,
      renderPasses: this.pipeline.snapshot().passes,
      ...(gpuMs === undefined ? {} : { gpuMs }),
    });
  }
}
