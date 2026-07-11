import { describe, expect, it } from 'vitest';
import { AdaptiveQualityService, EngineDiagnostics } from '../index.js';

const EMPTY_ASSETS = Object.freeze({
  records: 0, ready: 0, references: 0, byteLength: 0,
  budgetBytes: undefined, overBudget: false,
});

describe('EngineDiagnostics', () => {
  it('selects stable recommended desktop and mobile quality tiers', () => {
    const quality = new AdaptiveQualityService();
    expect(quality.configureViewport(1280, 720)).toMatchObject({ tier: 'desktop', targetFps: 60 });
    expect(quality.configureViewport(390, 844, 2)).toMatchObject({ tier: 'mobile', targetFps: 30, particleScale: 0.4 });
    expect(() => quality.configureViewport(0, 720)).toThrow('positive');
  });
  it('captures system timings and exports machine-readable frame state', () => {
    let now = 0;
    const diagnostics = new EngineDiagnostics(() => now, 8);
    diagnostics.beginFrame(1 / 60);
    diagnostics.measure('game.update', 'update', () => { now += 4; });
    diagnostics.reportRenderer({
      backend: 'test', drawCalls: 3, points: 12, triangles: 8,
      bufferUploadBytes: 128, textureUploadBytes: 0,
      transientAllocationBytes: 0,
      gpuResourceCount: 2, gpuResourceBytes: 1024, renderPasses: ['frame.render'],
    });
    now += 6;
    const snapshot = diagnostics.endFrame(EMPTY_ASSETS);

    expect(snapshot.frameCpuMs).toBe(10);
    expect(snapshot.systems).toEqual([{ id: 'game.update', stage: 'update', calls: 1, cpuMs: 4 }]);
    expect(JSON.parse(diagnostics.capture()).snapshot.renderer.drawCalls).toBe(3);
  });

  it('enforces tier budgets over a configurable sample envelope', () => {
    let now = 0;
    const diagnostics = new EngineDiagnostics(() => now);
    for (let frame = 0; frame < 3; frame += 1) {
      diagnostics.beginFrame(1 / 60);
      diagnostics.reportRenderer({
        backend: 'test', drawCalls: 4, points: 0, triangles: 2,
        bufferUploadBytes: 64, textureUploadBytes: 0,
        transientAllocationBytes: 0,
        gpuResourceCount: 1, gpuResourceBytes: 512, renderPasses: [],
      });
      now += 8;
      diagnostics.endFrame(EMPTY_ASSETS);
    }
    expect(diagnostics.evaluate('desktop', { minimumSamples: 3 })).toMatchObject({ passed: true, p95FrameMs: 8 });
    expect(diagnostics.evaluate('desktop', { minimumSamples: 3, p95FrameMs: 4 })).toMatchObject({ passed: false });
  });
});
