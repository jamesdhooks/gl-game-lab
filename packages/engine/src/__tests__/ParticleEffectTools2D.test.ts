import { describe, expect, it, vi } from 'vitest';
import { ParticleEffectBudgetController2D, ParticleEffectCaptureSession2D, ParticleEffectRecorder2D, ParticleEffectReplayPlayer2D, type ParticleEffectInstance2D, type ParticleEffectsDiagnostics2D } from '../index.js';

const diagnostics: ParticleEffectsDiagnostics2D = { backend: 'test', activeInstances: 1, registeredPrograms: 1, capacity: 100, activeEstimate: 50, spawnedParticles: 50, droppedParticles: 0, simulationPasses: 1, renderPasses: 1, uploadBytes: 64, allocatedBytes: 1024, eventPasses: 0, eventAttempts: 0, eventLosses: 0, backendFallbackCount: 0, allocationsAfterWarmup: 0, diagnosticAccuracy: 'exact' };

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

  it('captures and replays spawn commands, palettes, parameters, and pointer provenance', () => {
    let time = 0;
    const source = {
      state: () => ({ effectId: 'test', seed: 27 }),
      emit: vi.fn(),
      setPalette: vi.fn(),
      setParameter: vi.fn(),
      trigger: vi.fn(),
    } as unknown as ParticleEffectInstance2D;
    const capture = new ParticleEffectCaptureSession2D(source, () => time);
    capture.setPalette({ revision: 3, colors: [[1, 0.5, 0]] });
    time = 0.1;
    capture.setParameter('power', 4);
    time = 0.2;
    capture.emit('burst', { count: 12, position: [10, 20], seed: 8 });
    time = 0.3;
    capture.emitFromPointer('trail', { phase: 'move', pointerId: 4, x: 30, y: 40, buttons: 1 }, { count: 2, position: [30, 40] });
    const replay = capture.finish();
    expect(replay).toMatchObject({
      initialSeed: 27,
      events: [
        { kind: 'palette' },
        { kind: 'parameter', name: 'power', value: 4 },
        { kind: 'emission', emitterId: 'burst' },
        { kind: 'pointer-emission', emitterId: 'trail', pointer: { pointerId: 4, phase: 'move' } },
      ],
    });
    const emission = replay.events[2]!;
    expect(emission.kind).toBe('emission');
    expect(emission.kind === 'emission' && Object.isFrozen(emission.override?.position)).toBe(true);

    const target = {
      state: () => ({ effectId: 'test' }), restart: vi.fn(), emit: vi.fn(), setPalette: vi.fn(), setParameter: vi.fn(),
    } as unknown as ParticleEffectInstance2D;
    const player = new ParticleEffectReplayPlayer2D(replay, target);
    expect(player.update(1)).toBe(true);
    expect(target.setPalette).toHaveBeenCalledWith({ revision: 3, colors: [[1, 0.5, 0]] });
    expect(target.setParameter).toHaveBeenCalledWith('power', 4);
    expect(target.emit).toHaveBeenNthCalledWith(1, 'burst', expect.objectContaining({ count: 12, seed: 8 }));
    expect(target.emit).toHaveBeenNthCalledWith(2, 'trail', expect.objectContaining({ position: [30, 40] }));
  });
});
