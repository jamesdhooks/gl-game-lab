import { describe, expect, it, vi } from 'vitest';
import { ParticleEffectBudgetController2D, ParticleEffectRecorder2D, ParticleEffectReplayPlayer2D, type ParticleEffectInstance2D, type ParticleEffectsDiagnostics2D } from '../index.js';

const diagnostics: ParticleEffectsDiagnostics2D = { backend: 'test', activeInstances: 1, registeredPrograms: 1, capacity: 100, activeEstimate: 50, spawnedParticles: 50, droppedParticles: 0, simulationPasses: 1, renderPasses: 1, uploadBytes: 64, allocatedBytes: 1024 };

describe('ParticleEffectTools2D', () => {
  it('degrades cosmetic work first and recovers with hysteresis', () => {
    const budget = new ParticleEffectBudgetController2D({ targetFrameMs: 16, maximumParticles: 100, maximumUploadBytes: 1024, maximumSimulationPasses: 2, recoveryFrames: 2 });
    expect(budget.evaluate(10, diagnostics, 'ultra')).toMatchObject({ constrained: false, tier: 'ultra' });
    expect(budget.evaluate(20, diagnostics, 'ultra')).toMatchObject({ constrained: true, tier: 'enhanced', reason: 'frame-time', emissionScale: { critical: 1, cosmetic: 0.2 } });
    expect(budget.evaluate(10, diagnostics, 'ultra').constrained).toBe(true);
    expect(budget.evaluate(10, diagnostics, 'ultra').constrained).toBe(false);
  });

  it('records and deterministically replays control events rather than particle snapshots', () => {
    const recorder = new ParticleEffectRecorder2D('test', 42);
    recorder.record({ time: 0.1, kind: 'signal', name: 'burst', payload: { value: 2 } });
    recorder.record({ time: 0.2, kind: 'timescale', value: 0.5 });
    const instance = {
      state: () => ({ effectId: 'test' }), restart: vi.fn(), trigger: vi.fn(), setTimescale: vi.fn(),
    } as unknown as ParticleEffectInstance2D;
    const player = new ParticleEffectReplayPlayer2D(recorder.finish(), instance);
    expect(instance.restart).toHaveBeenCalledWith(42);
    expect(player.update(0.15)).toBe(false); expect(instance.trigger).toHaveBeenCalledWith('burst', { value: 2 });
    expect(player.update(0.1)).toBe(true); expect(instance.setTimescale).toHaveBeenCalledWith(0.5);
  });

  it('rejects nonchronological recording', () => {
    const recorder = new ParticleEffectRecorder2D('test', 1);
    recorder.record({ time: 1, kind: 'start' });
    expect(() => recorder.record({ time: 0.5, kind: 'pause' })).toThrow('chronological');
  });
});
