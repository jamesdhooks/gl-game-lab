import { describe, expect, it } from "vitest";
import { EngineParticleEffects2D, FallbackParticleEffectRuntimeBackend2D, adaptParticleEffectDefinition2D, compileParticleEffect2D, compileParticleProgram2D, type GpuRenderTarget2D, type ParticleEffectBackendDiagnostics2D, type ParticleEffectBackendResource2D, type ParticleEffectDefinition2D, type ParticleEffectRuntimeBackend2D, type ParticleColliderSet2D, type ParticleDomain2D, type ParticleEmitterSourceOverride2D, type ParticleEventParameters2D, type ParticleForceFieldSet2D, type ParticlePalette2D, type ParticleRenderParameters2D, type ParticleRuntimeEmission2D, type ParticleRenderTier2D, type ParticleViewport2D } from "../index.js";

class TestResource implements ParticleEffectBackendResource2D {
  emissions: ParticleRuntimeEmission2D[] = [];
  updates = 0;
  renders = 0;
  renderedTiers: ParticleRenderTier2D[] = [];
  transferred = false;
  parameters: Readonly<Record<string, unknown>> = {};
  paletteRevision = -1;
  renderScale = 1;
  colliders?: ParticleColliderSet2D;
  forceFields?: ParticleForceFieldSet2D;
  domain?: ParticleDomain2D;
  viewport?: ParticleViewport2D;
  renderParameters?: ParticleRenderParameters2D;
  emitterSources = new Map<number, ParticleEmitterSourceOverride2D>();
  eventParameters = new Map<string, ParticleEventParameters2D>();
  disposed = false;
  emit(emission: ParticleRuntimeEmission2D): void {
    this.emissions.push({ ...emission });
  }
  setPalette(palette: ParticlePalette2D): void {
    this.paletteRevision = palette.revision;
  }
  setParameters(parameters: Readonly<Record<string, import("../index.js").ParticleParameterValue2D>>): void {
    this.parameters = parameters;
  }
  setColliders(colliders: ParticleColliderSet2D): void {
    this.colliders = colliders;
  }
  setForceFields(fields: ParticleForceFieldSet2D): void {
    this.forceFields = fields;
  }
  setDomain(domain: ParticleDomain2D): void {
    this.domain = domain;
  }
  setEmitterSource(index: number, source: ParticleEmitterSourceOverride2D): void {
    this.emitterSources.set(index, source);
  }
  setEventParameters(archetypeIndex: number, eventIndex: number, parameters: ParticleEventParameters2D): void {
    this.eventParameters.set(`${archetypeIndex}:${eventIndex}`, parameters);
  }
  setViewport(viewport: ParticleViewport2D): void {
    this.viewport = viewport;
  }
  setRenderParameters(parameters: ParticleRenderParameters2D): void {
    this.renderParameters = parameters;
  }
  setRenderScale(scale: number): void {
    this.renderScale = scale;
  }
  update(): void {
    this.updates += 1;
  }
  render(_target: GpuRenderTarget2D, _tier: ParticleRenderTier2D): void {
    this.renders += 1;
    this.renderedTiers.push(_tier);
  }
  clear(): void {
    this.emissions = [];
  }
  transferStateTo(target: ParticleEffectBackendResource2D): boolean {
    (target as TestResource).transferred = true;
    return true;
  }
  diagnostics(): ParticleEffectBackendDiagnostics2D {
    return {
      capacity: 64,
      activeEstimate: this.emissions.reduce((sum, entry) => sum + entry.count, 0),
      queuedCommands: 0,
      droppedCommands: 0,
      spawnedParticles: this.emissions.reduce((sum, entry) => sum + entry.count, 0),
      droppedParticles: 0,
      eventCount: 0,
      simulationPasses: this.updates,
      renderPasses: this.renders,
      uploadBytes: 0,
      contextGeneration: 0,
      rebuildCount: 0,
      allocatedBytes: 4096,
      eventAttempts: 0,
      eventOccupiedDrops: 0,
      eventBudgetDrops: 0,
    };
  }
  dispose(): void {
    this.disposed = true;
  }
}

class TestBackend implements ParticleEffectRuntimeBackend2D {
  readonly kind = "test";
  readonly resources: TestResource[] = [];
  create(): ParticleEffectBackendResource2D {
    const resource = new TestResource();
    this.resources.push(resource);
    return resource;
  }
}

const definition: ParticleEffectDefinition2D = {
  id: "runtime-test",
  capacity: { min: 4, default: 64, max: 128, previewMax: 32 },
  archetypes: [
    {
      id: "spark",
      spawn: { shape: "point", spread: 0 },
      motion: { gravity: 0, drag: 0 },
      lifecycle: { lifetime: 1 },
      appearance: {
        size: { start: 1, end: 0 },
        alpha: { start: 1, end: 0 },
        intensity: { start: 1, end: 0 },
      },
    },
  ],
  modules: { motion: true, lifecycle: true },
  renderRecipes: {
    defaultTier: "basic",
    recipes: [
      { tier: "basic", points: true, blend: "additive" },
      { tier: "enhanced", points: true, streaks: true, blend: "additive" },
      { tier: "ultra", points: true, streaks: true, trails: true, bloom: true, blend: "additive" },
    ],
  },
};

describe("EngineParticleEffects2D", () => {
  it("owns instance lifecycle, timeline emission, update, and render", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const graph = {
      ...adaptParticleEffectDefinition2D(definition),
      parameters: [
        {
          id: "power",
          kind: "number" as const,
          defaultValue: 1,
          min: 0,
          max: 10,
        },
      ],
    };
    const emitter = {
      ...graph.emitters[0]!,
      timeline: { duration: 1, rate: { kind: "constant" as const, value: 10 } },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D({ ...graph, emitters: [emitter] })));
    const instance = runtime.createInstance("runtime-test", { seed: 4 });
    instance.start();
    runtime.update(0.5);
    expect(backend.resources[0]!.emissions).toHaveLength(1);
    expect(backend.resources[0]!.emissions[0]!.count).toBe(5);
    runtime.render({} as GpuRenderTarget2D);
    expect(runtime.diagnostics()).toMatchObject({
      activeInstances: 1,
      registeredPrograms: 1,
      spawnedParticles: 5,
      simulationPasses: 1,
      renderPasses: 1,
    });
    instance.pause();
    runtime.update(0.5);
    expect(backend.resources[0]!.updates).toBe(1);
    instance.resume();
    instance.stop("kill");
    expect(instance.state().status).toBe("complete");
    runtime.dispose();
  });

  it("supports manual emission, signals, parameters, and deterministic restart", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const graph = {
      ...adaptParticleEffectDefinition2D(definition),
      parameters: [
        {
          id: "power",
          kind: "number" as const,
          defaultValue: 1,
          min: 0,
          max: 10,
        },
      ],
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance("runtime-test", { seed: 10 });
    instance.emit("spark", { count: 7, power: 3 });
    expect(backend.resources[0]!.emissions[0]).toMatchObject({
      count: 7,
      power: 3,
    });
    expect(backend.resources[0]!.emissions[0]!.seed).toEqual(expect.any(Number));
    instance.restart(99);
    expect(instance.state()).toMatchObject({ status: "running", seed: 99 });
    expect(() => instance.setTimescale(20)).toThrow("between 0 and 16");
    instance.setParameter("power", 3);
    expect(backend.resources[0]!.parameters).toMatchObject({ power: 3 });
    instance.setRenderScale(0.25);
    expect(backend.resources[0]!.renderScale).toBe(0.25);
    expect(() => instance.setRenderScale(0)).toThrow("between 0.0625 and 1");
    instance.setForceFields({
      revision: 1,
      attractors: [{ x: 10, y: 20, strength: 1, softening: 4, falloff: "inverse-square" }],
    });
    expect(() =>
      instance.setForceFields({
        revision: 2,
        attractors: [{ x: 0, y: 0, strength: 1, softening: -1 }],
      }),
    ).toThrow("softening");
    expect(() =>
      instance.setForceFields({
        revision: 3,
        attractors: Array.from({ length: 17 }, () => ({
          x: 0,
          y: 0,
          strength: 1,
        })),
      }),
    ).toThrow("at most 16");
    instance.setDomain({
      revision: 1,
      shape: "circle",
      behavior: "wrap",
      center: [10, 20],
      radius: 30,
    });
    expect(() =>
      instance.setDomain({
        revision: 2,
        shape: "circle",
        behavior: "wrap",
        center: [0, 0],
        radius: 0,
      }),
    ).toThrow("positive radius");
    instance.setEmitterSource("spark", { radius: 20, innerRadius: 10 });
    expect(() => instance.setEmitterSource("missing", { radius: 2 })).toThrow("Unknown particle emitter");
    const handle = instance.emitter("spark");
    expect(handle).toBe(instance.emitter("spark"));
    handle.writer().position(12, 18).count(3).power(7).lifetime(2.5).lifetimeVariability(0.4).submit();
    expect(backend.resources[0]!.emissions.at(-1)).toMatchObject({
      count: 3,
      positionX: 12,
      positionY: 18,
      power: 7,
      lifetime: 2.5,
      lifetimeVariability: 0.4,
    });
    expect(() => handle.writer().lifetime(0).submit()).toThrow("positive and finite");
    expect(() => handle.writer().lifetimeVariability(1.1).submit()).toThrow("between zero and one");
    expect(instance.state().status).toBe("running");
    runtime.update(2.6);
    expect(instance.state().status).toBe("complete");
  });

  it("validates and forwards dynamic event parameters", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition);
    const graph = {
      ...base,
      archetypes: base.archetypes.map((archetype) => ({
        ...archetype,
        events: [{ trigger: "death" as const, childArchetypeId: "spark", probability: 1, count: 2, maxGeneration: 1 }],
      })),
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance("runtime-test");
    instance.setEventParameters("spark", 0, { probability: 0.5, count: 7, delay: 0.2, powerScale: 0.8, minimumSpeed: 40, countSpeedScale: 2, speedReference: 500, basePower: 120, lifetimeVariability: 0.4, powerVariability: 0.6 });
    expect(backend.resources[0]!.eventParameters.get("0:0")).toEqual({ probability: 0.5, count: 7, delay: 0.2, powerScale: 0.8, minimumSpeed: 40, countSpeedScale: 2, speedReference: 500, basePower: 120, lifetimeVariability: 0.4, powerVariability: 0.6 });
    expect(() => instance.setEventParameters("spark", 0, { probability: 2 })).toThrow("between zero and one");
    expect(() => instance.setEventParameters("spark", 0, { lifetimeVariability: 1.1 })).toThrow("between zero and one");
    expect(() => instance.setEventParameters("missing", 0, {})).toThrow("Unknown particle event");
    runtime.dispose();
  });

  it("hot replaces compatible programs and rejects use after disposal", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program);
    const instance = runtime.createInstance("runtime-test");
    runtime.replace(program);
    expect(backend.resources).toHaveLength(2);
    expect(backend.resources[1]!.transferred).toBe(true);
    instance.dispose();
    expect(runtime.diagnostics().activeInstances).toBe(0);
    runtime.dispose();
    expect(() => runtime.createInstance("runtime-test")).toThrow("disposed");
  });

  it("compiles hot-reloaded graphs and explains state preservation versus deterministic reset", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const graph = adaptParticleEffectDefinition2D(definition);
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    runtime.createInstance("runtime-test");
    const compatible = runtime.reloadGraph({
      ...graph,
      archetypes: graph.archetypes.map((archetype) => ({
        ...archetype,
        appearance: { ...archetype.appearance, flicker: 0.2 },
      })),
    });
    expect(compatible).toMatchObject({ action: "preserved", abiCompatible: true, instances: 1, statePreserved: 1 });
    expect(compatible.explanation).toContain("transferred");
    const incompatible = runtime.reloadGraph({
      ...graph,
      archetypes: [...graph.archetypes, {
        ...graph.archetypes[0]!,
        id: "secondary",
      }],
    });
    expect(incompatible).toMatchObject({ action: "reset", abiCompatible: false, instances: 1, statePreserved: 0 });
    expect(incompatible.explanation).toContain("ABI changed");
    expect(runtime.inspect().hotReloads).toEqual([compatible, incompatible]);
    runtime.dispose();
  });

  it("retains dynamic bindings across backend replacement and resets when state cannot transfer", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program);
    const instance = runtime.createInstance("runtime-test", { seed: 17 });
    instance.setColliders({
      revision: 2,
      circles: [{ x: 1, y: 2, radius: 3 }],
    });
    instance.setForceFields({
      revision: 3,
      attractors: [{ x: 4, y: 5, strength: 6 }],
    });
    instance.setDomain({
      revision: 4,
      shape: "circle",
      behavior: "wrap",
      center: [7, 8],
      radius: 9,
    });
    instance.setEmitterSource("spark", { radius: 10 });
    instance.setViewport({ width: 320, height: 180, dpr: 2 });
    instance.setRenderParameters({ pointScale: 1.5, trailFade: 0.9 });
    backend.resources[0]!.transferStateTo = () => false;
    runtime.setCapacity("runtime-test", 128);
    expect(backend.resources[1]).toMatchObject({
      colliders: { revision: 2 },
      forceFields: { revision: 3 },
      domain: { revision: 4 },
      viewport: { width: 320, height: 180, dpr: 2 },
      renderParameters: { pointScale: 1.5, trailFade: 0.9 },
    });
    expect(backend.resources[1]!.emitterSources.get(0)).toEqual({ radius: 10 });
    expect(instance.state()).toMatchObject({
      status: "running",
      elapsed: 0,
      seed: 17,
    });
    expect(() => runtime.setCapacity("runtime-test", 129)).toThrow("outside its compiled policy");
    runtime.dispose();
  });

  it("isolates GPU state and mutable bindings between effect instances", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program);
    const first = runtime.createInstance("runtime-test", {
      palette: { revision: 1, colors: [[1, 0, 0]] },
    });
    const second = runtime.createInstance("runtime-test", {
      palette: { revision: 2, colors: [[0, 0, 1]] },
    });
    expect(backend.resources).toHaveLength(2);
    expect(backend.resources.map((resource) => resource.paletteRevision)).toEqual([1, 2]);
    first.emitter("spark").emit(3);
    second.emitter("spark").emit(5);
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

  it("prewarms and reuses isolated backend resources without reallocating", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program);
    runtime.prewarm("runtime-test");
    expect(backend.resources).toHaveLength(1);
    const first = runtime.createInstance("runtime-test");
    expect(backend.resources).toHaveLength(1);
    first.dispose();
    const second = runtime.createInstance("runtime-test");
    expect(backend.resources).toHaveLength(1);
    second.dispose();
    runtime.dispose();
    expect(backend.resources[0]!.disposed).toBe(true);
  });

  it("falls back internally when the preferred backend fails", () => {
    const preferred = new TestBackend();
    preferred.create = () => {
      throw new Error("device unavailable");
    };
    const fallback = new TestBackend();
    const runtime = new EngineParticleEffects2D(new FallbackParticleEffectRuntimeBackend2D(preferred, fallback));
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))));
    const instance = runtime.createInstance("runtime-test");
    instance.emitter("spark").emit(2);
    expect(instance.diagnostics().backendFallbackCount).toBe(1);
  });

  it("exposes immutable compiled graph and instance inspection data", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition)));
    runtime.register(program);
    runtime.prewarm("runtime-test");
    const instance = runtime.createInstance("runtime-test", {
      qualityTier: "enhanced",
    });
    const inspection = runtime.inspect();
    expect(inspection.backend).toBe("test");
    expect(inspection.programs[0]).toMatchObject({
      id: "runtime-test",
      graphHash: program.effect.graphHash,
      abiHash: program.effect.abiHash,
      archetypes: ["spark"],
      emitters: ["spark"],
    });
    expect(inspection.programs[0]!.capabilityRequirements).toContain("floating-point state targets");
    expect(inspection.programs[0]!.resources.length).toBeGreaterThan(0);
    expect(inspection.programs[0]!.shaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backend: "webgl2", hash: expect.any(String), source: expect.any(String) }),
        expect.objectContaining({ backend: "webgpu", hash: expect.any(String), source: expect.any(String) }),
      ]),
    );
    expect(inspection.instances[0]).toMatchObject({
      id: instance.id,
      effectId: "runtime-test",
      qualityTier: "enhanced",
      parameters: {},
      diagnostics: { capacity: 64 },
    });
    expect(Object.isFrozen(inspection.programs)).toBe(true);
    runtime.dispose();
  });

  it("supports interactive inspector controls without bypassing instance validation", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))));
    const instance = runtime.createInstance("runtime-test", { seed: 11 });
    instance.start();
    runtime.controlInstance(instance.id, { action: "pause" });
    expect(instance.state().status).toBe("paused");
    runtime.controlInstance(instance.id, { action: "step", deltaSeconds: 1 / 30 });
    expect(instance.state()).toMatchObject({ status: "paused", elapsed: 1 / 30 });
    expect(backend.resources[0]!.updates).toBe(1);
    runtime.controlInstance(instance.id, { action: "resume" });
    expect(instance.state().status).toBe("running");
    runtime.controlInstance(instance.id, { action: "reseed", seed: 99 });
    expect(instance.state()).toMatchObject({ status: "running", seed: 99, elapsed: 0 });
    runtime.controlInstance(instance.id, { action: "reset" });
    expect(instance.state()).toMatchObject({ status: "running", seed: 99, elapsed: 0 });
    expect(() => runtime.controlInstance(instance.id, { action: "step", deltaSeconds: 2 })).toThrow("between zero and one");
    expect(() => runtime.controlInstance(999, { action: "pause" })).toThrow("Unknown particle effect instance");
    runtime.dispose();
  });

  it("adapts render density and tier without changing simulation emission quality", () => {
    const backend = new TestBackend(), runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition), adaptiveProgram = compileParticleProgram2D(compileParticleEffect2D({ ...base, emitters: base.emitters.map((emitter) => ({ ...emitter, timeline: { duration: 20, rate: { kind: "constant" as const, value: 1 } } })) }));
    runtime.register(adaptiveProgram);
    const instance = runtime.createInstance("runtime-test", { qualityTier: "ultra", adaptiveTargetFps: 60 });
    instance.start();
    for (let frame = 0; frame < 8; frame += 1) runtime.update(0.04);
    expect(instance.state()).toMatchObject({ qualityTier: "ultra", effectiveQualityTier: "ultra", adaptiveLodLevel: 1, renderScale: 0.5 });
    for (let frame = 0; frame < 8; frame += 1) runtime.update(0.04);
    expect(instance.state()).toMatchObject({ qualityTier: "ultra", effectiveQualityTier: "enhanced", adaptiveLodLevel: 2, renderScale: 0.25 });
    runtime.render({} as GpuRenderTarget2D);
    expect(backend.resources[0]!.renderedTiers.at(-1)).toBe("enhanced");
    for (let frame = 0; frame < 120; frame += 1) runtime.update(1 / 60);
    expect(instance.state()).toMatchObject({ adaptiveLodLevel: 1, renderScale: 0.5 });
    runtime.dispose();

    const previewBackend = new TestBackend(), previewRuntime = new EngineParticleEffects2D(previewBackend);
    previewRuntime.register(adaptiveProgram);
    const preview = previewRuntime.createInstance("runtime-test", { preview: true, qualityTier: "enhanced" });
    preview.start();
    for (let frame = 0; frame < 20; frame += 1) previewRuntime.update(1 / 30);
    expect(preview.state().adaptiveLodLevel).toBe(0);
    previewRuntime.dispose();
  });
});
