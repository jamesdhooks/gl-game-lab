import { describe, expect, it } from 'vitest';
import {
  EngineParticleEffects2D,
  FallbackParticleEffectRuntimeBackend2D,
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
  transferred = false;
  parameters: Readonly<Record<string, unknown>> = {};
  paletteRevision = -1;
  disposed = false;
  emit(emission: ParticleRuntimeEmission2D): void { this.emissions.push({ ...emission }); }
  setPalette(palette: ParticlePalette2D): void { this.paletteRevision = palette.revision; }
  setParameters(parameters: Readonly<Record<string, import('../index.js').ParticleParameterValue2D>>): void { this.parameters = parameters; }
  update(): void { this.updates += 1; }
  render(_target: GpuRenderTarget2D, _tier: ParticleRenderTier2D): void { this.renders += 1; }
  clear(): void { this.emissions = []; }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean { (target as TestResource).transferred = true; return true; }
  diagnostics(): ParticleEffectBackendDiagnostics2D { return { capacity: 64, activeEstimate: this.emissions.reduce((sum, entry) => sum + entry.count, 0), queuedCommands: 0, droppedCommands: 0, spawnedParticles: this.emissions.reduce((sum, entry) => sum + entry.count, 0), droppedParticles: 0, eventCount: 0, simulationPasses: this.updates, renderPasses: this.renders, uploadBytes: 0, contextGeneration: 0, rebuildCount: 0, allocatedBytes: 4096, eventAttempts: 0, eventOccupiedDrops: 0, eventBudgetDrops: 0 }; }
  dispose(): void { this.disposed = true; }
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
    const graph = { ...adaptParticleEffectDefinition2D(definition), parameters: [{ id: 'power', kind: 'number' as const, defaultValue: 1, min: 0, max: 10 }] };
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
    const graph = { ...adaptParticleEffectDefinition2D(definition), parameters: [{ id: 'power', kind: 'number' as const, defaultValue: 1, min: 0, max: 10 }] };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance('runtime-test', { seed: 10 });
    instance.emit('spark', { count: 7, power: 3 });
    expect(backend.resources[0]!.emissions[0]).toMatchObject({ count: 7, power: 3 });
    expect(backend.resources[0]!.emissions[0]!.seed).toEqual(expect.any(Number));
    instance.restart(99); expect(instance.state()).toMatchObject({ status: 'running', seed: 99 });
    expect(() => instance.setTimescale(20)).toThrow('between 0 and 16');
    instance.setParameter('power', 3);
    expect(backend.resources[0]!.parameters).toMatchObject({ power: 3 });
    const handle = instance.emitter('spark');
    expect(handle).toBe(instance.emitter('spark'));
    handle.writer().position(12, 18).count(3).power(7).submit();
    expect(backend.resources[0]!.emissions.at(-1)).toMatchObject({ count: 3, positionX: 12, positionY: 18, power: 7 });
    expect(instance.state().status).toBe('running');
    runtime.update(1.1);
    expect(instance.state().status).toBe('complete');
  });

  it('hot replaces compatible programs and rejects use after disposal', () => {
    const backend = new TestBackend(); const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program); const instance = runtime.createInstance('runtime-test');
    runtime.replace(program); expect(backend.resources).toHaveLength(2);
    expect(backend.resources[1]!.transferred).toBe(true);
    instance.dispose(); expect(runtime.diagnostics().activeInstances).toBe(0);
    runtime.dispose(); expect(() => runtime.createInstance('runtime-test')).toThrow('disposed');
  });

  it('isolates GPU state and mutable bindings between effect instances', () => {
    const backend = new TestBackend(); const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program);
    const first = runtime.createInstance('runtime-test', { palette: { revision: 1, colors: [[1, 0, 0]] } });
    const second = runtime.createInstance('runtime-test', { palette: { revision: 2, colors: [[0, 0, 1]] } });
    expect(backend.resources).toHaveLength(2);
    expect(backend.resources.map((resource) => resource.paletteRevision)).toEqual([1, 2]);
    first.emitter('spark').emit(3); second.emitter('spark').emit(5);
    runtime.update(0.016);
    expect(backend.resources[0]!.emissions[0]!.count).toBe(3);
    expect(backend.resources[1]!.emissions[0]!.count).toBe(5);
    first.restart(7);
    expect(backend.resources[0]!.emissions).toHaveLength(1);
    expect(backend.resources[1]!.emissions).toHaveLength(1);
    first.dispose();
    expect(backend.resources[0]!.disposed).toBe(false);
    expect(backend.resources[1]!.disposed).toBe(false);
    runtime.dispose();
    expect(backend.resources[0]!.disposed).toBe(true);
    expect(backend.resources[1]!.disposed).toBe(true);
  });

  it('prewarms and reuses isolated backend resources without reallocating', () => {
    const backend = new TestBackend(); const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program); runtime.prewarm('runtime-test');
    expect(backend.resources).toHaveLength(1);
    const first = runtime.createInstance('runtime-test');
    expect(backend.resources).toHaveLength(1);
    first.dispose();
    const second = runtime.createInstance('runtime-test');
    expect(backend.resources).toHaveLength(1);
    second.dispose(); runtime.dispose();
    expect(backend.resources[0]!.disposed).toBe(true);
  });

  it('falls back internally when the preferred backend fails', () => {
    const preferred = new TestBackend();
    preferred.create = () => { throw new Error('device unavailable'); };
    const fallback = new TestBackend();
    const runtime = new EngineParticleEffects2D(new FallbackParticleEffectRuntimeBackend2D(preferred, fallback));
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))));
    const instance = runtime.createInstance('runtime-test');
    instance.emitter('spark').emit(2);
    expect(instance.diagnostics().backendFallbackCount).toBe(1);
  });
});
