import { describe, expect, it, vi } from 'vitest';
import type { ParticlePointDrawPlan } from '../ParticlePointRenderer.js';
import type { SpriteDrawPlan } from '../SpriteRenderer.js';
import {
  WebGL2FrameOrchestrator,
  type WebGL2FrameMetricSources,
  type WebGL2FrameStages,
} from '../WebGL2FrameOrchestrator.js';

const SPRITES: SpriteDrawPlan = Object.freeze({ spriteCount: 3, culledCount: 0, batches: Object.freeze([]) });
const PARTICLES: ParticlePointDrawPlan = Object.freeze({ particleCount: 10, drawCalls: 2, batches: Object.freeze([]) });

function createMetrics(overrides: Partial<WebGL2FrameMetricSources> = {}): WebGL2FrameMetricSources {
  return {
    backendId: 'test-backend',
    timer: { latestMs: 2.5, begin: vi.fn(), end: vi.fn() },
    beginGpuFrame: vi.fn(),
    gpuDiagnostics: () => ({ drawCalls: 5, points: 6, triangles: 7, uploadBytes: 13, submissions: 1 }),
    deviceDiagnostics: () => ({
      textureCount: 3,
      contextResourceCount: 4,
      ownedContextResourceCount: 4,
      estimatedTextureBytes: 7,
      estimatedContextBytes: 16,
      estimatedGpuBytes: 23,
      contextGeneration: 0,
    }),
    fallbackSpritePlan: () => SPRITES,
    fallbackParticlePlan: () => PARTICLES,
    effectCount: () => 2,
    gpuPassCount: () => 4,
    bloomPassCount: () => 2,
    consumeTransientAllocationBytes: () => 19,
    ...overrides,
  };
}

function createStages(calls: string[], overrides: Partial<WebGL2FrameStages> = {}): WebGL2FrameStages {
  return {
    clear: () => { calls.push('clear'); },
    backdrop: () => { calls.push('backdrop'); },
    gpuSimulation: () => { calls.push('gpu-simulation'); },
    effects: () => { calls.push('effects'); },
    particles: () => { calls.push('particles'); return PARTICLES; },
    sprites: () => { calls.push('sprites'); return SPRITES; },
    composite: () => { calls.push('composite'); },
    ...overrides,
  };
}

describe('WebGL2FrameOrchestrator', () => {
  it('executes the shipping frame and aggregates one immutable diagnostics snapshot', () => {
    const calls: string[] = [];
    const metrics = createMetrics();
    const orchestrator = new WebGL2FrameOrchestrator(createStages(calls), metrics);

    const diagnostics = orchestrator.execute({ composite: false }, {
      bufferUploadBytes: 11,
      textureUploadBytes: 17,
      gpuDrawCalls: 7,
      backdropEnabled: true,
    });

    expect(calls).toEqual(['clear', 'backdrop', 'gpu-simulation', 'effects', 'particles', 'sprites', 'composite']);
    expect(metrics.beginGpuFrame).toHaveBeenCalledOnce();
    expect(metrics.timer.begin).toHaveBeenCalledOnce();
    expect(metrics.timer.end).toHaveBeenCalledOnce();
    expect(diagnostics).toEqual({
      backend: 'test-backend',
      drawCalls: 22,
      points: 16,
      triangles: 21,
      bufferUploadBytes: 364,
      textureUploadBytes: 17,
      transientAllocationBytes: 19,
      gpuResourceCount: 7,
      gpuResourceBytes: 23,
      renderPasses: [
        'frame.clear',
        'frame.backdrop',
        'frame.gpu-simulation',
        'frame.effects',
        'frame.particles',
        'frame.sprites',
        'frame.composite',
      ],
      gpuMs: 2.5,
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });

  it('always closes an active GPU timer when a frame stage throws', () => {
    const failure = new Error('effect failure');
    const metrics = createMetrics();
    const orchestrator = new WebGL2FrameOrchestrator(createStages([], {
      effects: () => { throw failure; },
    }), metrics);

    expect(() => orchestrator.execute({ composite: false }, {
      bufferUploadBytes: 0,
      textureUploadBytes: 0,
      gpuDrawCalls: 0,
      backdropEnabled: false,
    })).toThrow(failure);
    expect(metrics.timer.begin).toHaveBeenCalledOnce();
    expect(metrics.timer.end).toHaveBeenCalledOnce();
  });
});
