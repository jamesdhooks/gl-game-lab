import { describe, expect, it } from 'vitest';
import {
  EngineParticleEffects2D,
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  type GpuRenderTarget2D,
  type ParticleEffectBackendDiagnostics2D,
  type ParticleEffectBackendResource2D,
  type ParticleEffectDefinition2D,
  type ParticleEffectRuntimeBackend2D,
  type ParticlePalette2D,
  type ParticleRuntimeEmission2D,
  type ParticleRenderTier2D,
} from '../index.js';

class TestResource implements ParticleEffectBackendResource2D {
  emissions: ParticleRuntimeEmission2D[] = [];
  updates = 0;
  renders = 0;
  emit(emission: ParticleRuntimeEmission2D): void { this.emissions.push({ ...emission }); }
  setPalette(_palette: ParticlePalette2D): void {}
  update(): void { this.updates += 1; }
  render(_target: GpuRenderTarget2D, _tier: ParticleRenderTier2D): void { this.renders += 1; }
  clear(): void { this.emissions = []; }
  diagnostics(): ParticleEffectBackendDiagnostics2D { return { capacity: 64, activeEstimate: this.emissions.reduce((sum, entry) => sum + entry.count, 0), queuedCommands: 0, droppedCommands: 0, spawnedParticles: this.emissions.reduce((sum, entry) => sum + entry.count, 0), droppedParticles: 0, eventCount: 0, simulationPasses: this.updates, renderPasses: this.renders, uploadBytes: 0, contextGeneration: 0, rebuildCount: 0, allocatedBytes: 4096, eventAttempts: 0, eventOccupiedDrops: 0, eventBudgetDrops: 0 }; }
  dispose(): void {}
}

class TestBackend implements ParticleEffectRuntimeBackend2D {
  readonly kind = 'test';
  readonly resources: TestResource[] = [];
  create(): ParticleEffectBackendResource2D { const resource = new TestResource(); this.resources.push(resource); return resource; }
}

const definition: ParticleEffectDefinition2D = {
  id: 'runtime-test', capacity: { min: 4, default: 64, max: 128, previewMax: 32 },
  archetypes: [{ id: 'spark', spawn: { shape: 'point', spread: 0 }, motion: { gravity: 0, drag: 0 }, lifecycle: { lifetime: 1 }, appearance: { size: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } } }],
  modules: { motion: true, lifecycle: true }, renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
};

describe('EngineParticleEffects2D', () => {
  it('owns instance lifecycle, timeline emission, update, and render', () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const graph = adaptParticleEffectDefinition2D(definition);
    const emitter = { ...graph.emitters[0]!, timeline: { duration: 1, rate: { kind: 'constant' as const, value: 10 } } };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D({ ...graph, emitters: [emitter] })));
    const instance = runtime.createInstance('runtime-test', { seed: 4 });
    instance.start(); runtime.update(0.5);
    expect(backend.resources[0]!.emissions).toHaveLength(1);
    expect(backend.resources[0]!.emissions[0]!.count).toBe(5);
    runtime.render({} as GpuRenderTarget2D);
    expect(runtime.diagnostics()).toMatchObject({ activeInstances: 1, registeredPrograms: 1, spawnedParticles: 5, simulationPasses: 1, renderPasses: 1 });
    instance.pause(); runtime.update(0.5); expect(backend.resources[0]!.updates).toBe(1);
    instance.resume(); instance.stop('kill'); expect(instance.state().status).toBe('complete');
    runtime.dispose();
  });

  it('supports manual emission, signals, parameters, and deterministic restart', () => {
    const backend = new TestBackend(); const runtime = new EngineParticleEffects2D(backend);
    const graph = adaptParticleEffectDefinition2D(definition);
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance('runtime-test', { seed: 10 });
    instance.emit('spark', { count: 7, power: 3 });
    expect(backend.resources[0]!.emissions[0]).toMatchObject({ count: 7, power: 3 });
    expect(backend.resources[0]!.emissions[0]!.seed).toEqual(expect.any(Number));
    instance.restart(99); expect(instance.state()).toMatchObject({ status: 'running', seed: 99 });
    expect(() => instance.setTimescale(20)).toThrow('between 0 and 16');
  });

  it('hot replaces compatible programs and rejects use after disposal', () => {
    const backend = new TestBackend(); const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program); const instance = runtime.createInstance('runtime-test');
    runtime.replace(program); expect(backend.resources).toHaveLength(2);
    instance.dispose(); expect(runtime.diagnostics().activeInstances).toBe(0);
    runtime.dispose(); expect(() => runtime.createInstance('runtime-test')).toThrow('disposed');
  });
});
