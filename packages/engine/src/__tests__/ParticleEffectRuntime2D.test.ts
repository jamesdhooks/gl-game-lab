import { describe, expect, it } from "vitest";
import {
  EngineParticleEffects2D, FallbackParticleEffectRuntimeBackend2D, adaptParticleEffectDefinition2D,
  compileParticleEffect2D, compileParticleProgram2D, type GpuRenderTarget2D,
  type ParticleEffectBackendDiagnostics2D, type ParticleEffectBackendResource2D,
  type ParticleEffectDefinition2D, type ParticleEffectRuntimeBackend2D, type ParticleColliderSet2D,
  type ParticleDomain2D, type ParticleEmitterSourceOverride2D, type ParticleEventParameters2D,
  type ParticleForceFieldSet2D, type ParticlePalette2D, type ParticleRenderParameters2D,
  type ParticleRuntimeEmission2D, type ParticleRenderTier2D, type ParticleViewport2D,
  type ParticleExtensionBindingSet2D,
} from "../index.js";

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
  extensionBindings?: ParticleExtensionBindingSet2D;
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
  setExtensionBindings(bindings: ParticleExtensionBindingSet2D): void {
    this.extensionBindings = bindings;
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
  it("validates, applies, and updates compiled extension bindings", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const graph = { ...adaptParticleEffectDefinition2D(definition), customModules: ["wind-module"] };
    const extension = {
      id: "wind-module", supports: ["webgl2", "webgpu"] as const, cpuReference: () => undefined,
      glslSimulation: "stateB.xy += uWind * uStrength;", wgslSimulation: "stateB[i].velocity += uWind * uStrength;",
      bindings: [
        { name: "uWind", kind: "uniform" as const, dataType: "vec2", required: true, stages: ["simulation"] as const },
        { name: "uStrength", kind: "uniform" as const, dataType: "f32", required: true, stages: ["simulation"] as const },
      ],
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph), [extension]));
    expect(() => runtime.createInstance(definition.id)).toThrow("Missing required particle extension binding: uWind");
    expect(backend.resources).toHaveLength(0);
    const instance = runtime.createInstance(definition.id, { extensionBindings: { uWind: [2, -1], uStrength: 0.5 } });
    expect(backend.resources[0]!.extensionBindings).toEqual({ uWind: [2, -1], uStrength: 0.5 });
    instance.setExtensionBinding("uStrength", 0.75);
    expect(backend.resources[0]!.extensionBindings).toEqual({ uWind: [2, -1], uStrength: 0.75 });
    expect(() => instance.setExtensionBinding("uWind", [1, 2, 3] as unknown as readonly [number, number])).toThrow("requires vec2");
    expect(() => instance.setExtensionBinding("unknown", 1)).toThrow("Unknown particle extension binding");
  });

  it("rejects a hot reload that introduces an unsatisfied required resource without destroying live state", () => {
    const backend = new TestBackend(), runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition);
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(base)));
    const instance = runtime.createInstance(definition.id);
    instance.start();
    const original = backend.resources[0]!;
    const extension = {
      id: "required-module", supports: ["webgl2", "webgpu"] as const, cpuReference: () => undefined,
      glslSimulation: "stateA.x += uRequired;", wgslSimulation: "stateA[i].position.x += uRequired;",
      bindings: [{ name: "uRequired", kind: "uniform" as const, dataType: "f32", required: true, stages: ["simulation"] as const }],
    };
    expect(() => runtime.reloadGraph({ ...base, customModules: [extension.id] }, [extension])).toThrow("Missing required particle extension binding: uRequired");
    expect(original.disposed).toBe(false);
    expect(instance.state().status).toBe("running");
  });
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
    expect(instance.state().status).toBe("draining");
    runtime.update(0.91);
    expect(instance.state().status).toBe("complete");
  });

  it("keeps manually emitted particles advancing through their overridden lifetime variability", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(definition))));
    const instance = runtime.createInstance("runtime-test");

    instance.emit("spark", { count: 1, lifetime: 1, lifetimeVariability: 1 });
    runtime.update(0.9);
    runtime.render({} as GpuRenderTarget2D);
    runtime.update(0.9);
    runtime.render({} as GpuRenderTarget2D);

    expect(instance.state().status).toBe("draining");
    expect(backend.resources[0]).toMatchObject({ updates: 2, renders: 2 });

    runtime.update(0.21);
    runtime.render({} as GpuRenderTarget2D);
    expect(instance.state().status).toBe("complete");
    expect(backend.resources[0]).toMatchObject({ updates: 3, renders: 2 });
  });

  it("keeps collision children advancing through their live event lifetime overrides", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const eventDefinition: ParticleEffectDefinition2D = {
      ...definition,
      id: "runtime-event-test",
      archetypes: [
        {
          ...definition.archetypes[0]!,
          events: [{ trigger: "collision", childArchetypeId: "bounce", probability: 1, count: 1, maxGeneration: 1 }],
        },
        {
          id: "bounce",
          spawn: { shape: "point", spread: 0 },
          motion: { gravity: 0, drag: 0 },
          lifecycle: { lifetime: 0.5 },
          appearance: {
            size: { start: 1, end: 0 },
            alpha: { start: 1, end: 0 },
            intensity: { start: 1, end: 0 },
          },
        },
      ],
      modules: { motion: true, lifecycle: true, collisions: true, events: true },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(eventDefinition))));
    const instance = runtime.createInstance(eventDefinition.id);

    instance.setEventParameters("spark", 0, { lifetime: 3, lifetimeVariability: 1 });
    instance.emit("spark", { count: 1, lifetime: 1 });
    runtime.update(5);
    runtime.render({} as GpuRenderTarget2D);

    expect(instance.state().status).toBe("draining");
    expect(backend.resources[0]).toMatchObject({ updates: 1, renders: 1 });

    runtime.update(2.01);
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
    instance.setEventParameters("spark", 0, { probability: 0.5, count: 7, delay: 0.2, powerScale: 0.8, impactPowerScale: 1.4, minimumSpeed: 40, countSpeedScale: 2, speedReference: 500, basePower: 120, lifetimeVariability: 0.4, powerVariability: 0.6 });
    expect(backend.resources[0]!.eventParameters.get("0:0")).toEqual({ probability: 0.5, count: 7, delay: 0.2, powerScale: 0.8, impactPowerScale: 1.4, minimumSpeed: 40, countSpeedScale: 2, speedReference: 500, basePower: 120, lifetimeVariability: 0.4, powerVariability: 0.6 });
    expect(() => instance.setEventParameters("spark", 0, { probability: 2 })).toThrow("between zero and one");
    expect(() => instance.setEventParameters("spark", 0, { lifetimeVariability: 1.1 })).toThrow("between zero and one");
    expect(() => instance.setEventParameters("missing", 0, {})).toThrow("Unknown particle event");
    runtime.dispose();
  });

  it("resolves graph coordinate spaces and emitter transform inheritance into emissions and source geometry", () => {
    const backend = new TestBackend(), runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition);
    const graph = {
      ...base,
      emitters: [{
        ...base.emitters[0]!, source: { kind: "disc" as const, radius: 2 },
        transform: { space: "effect" as const, inheritPosition: true, inheritRotation: true, inheritScale: true },
      }],
      graph: { root: { kind: "transform" as const, space: "world" as const, child: { kind: "emit" as const, emitterId: "spark" } } },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance(definition.id, { transform: { position: [1, 2], rotation: 0.25, scale: [1, 1] } });
    instance.setCoordinateTransform("world", { position: [20, 30], rotation: 1.5, scale: [2, 3] });
    instance.start();
    expect(backend.resources[0]!.emissions[0]).toMatchObject({ positionX: 20, positionY: 30, direction: 1.5 });
    expect(backend.resources[0]!.emitterSources.get(0)).toMatchObject({ radius: 6 });
    runtime.dispose();
  });

  it("executes burst cycles, distance emission, per-frame limits, and conservative max-alive limits", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition);
    const emitter = {
      ...base.emitters[0]!,
      timeline: {
        duration: 2,
        distanceRate: { kind: "constant" as const, value: 1 },
        bursts: [{ time: 0, count: 4, cycles: 3, interval: 0.1 }],
      },
      limits: { ...base.emitters[0]!.limits, maxPerFrame: 5, maxAlive: 6 },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D({ ...base, emitters: [emitter] })));
    const instance = runtime.createInstance(definition.id, { seed: 3 });
    instance.start();
    instance.setTransform({ position: [3, 4], rotation: 0, scale: [1, 1] });
    runtime.update(0.05);
    expect(backend.resources[0]!.emissions.map((entry) => entry.count)).toEqual([4, 1]);
    runtime.update(0.06);
    expect(backend.resources[0]!.emissions.map((entry) => entry.count)).toEqual([4, 1, 1]);
    runtime.update(1.1);
    expect(backend.resources[0]!.emissions.map((entry) => entry.count)).toEqual([4, 1, 1, 4]);
    runtime.dispose();
  });

  it("preallocates independent overlapping activations for repeated emitter graphs", () => {
    const backend = new TestBackend(), runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition);
    const emitter = {
      ...base.emitters[0]!,
      timeline: { duration: 1, rate: { kind: "constant" as const, value: 10 } },
      limits: { ...base.emitters[0]!.limits, maxConcurrent: 2 },
    };
    const graph = {
      ...base,
      emitters: [emitter],
      graph: { root: { kind: "parallel" as const, children: [{ kind: "emit" as const, emitterId: emitter.id }, { kind: "emit" as const, emitterId: emitter.id }] } },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance(definition.id);
    instance.start();
    runtime.update(0.15);
    expect(instance.state().activeEmitters).toBe(2);
    expect(instance.state().droppedEmitterActivations).toBe(0);
    expect(backend.resources[0]!.emissions.reduce((sum, emission) => sum + emission.count, 0)).toBe(2);
    runtime.dispose();
  });

  it("reports emitter activation-pool exhaustion", () => {
    const backend = new TestBackend(), runtime = new EngineParticleEffects2D(backend);
    const base = adaptParticleEffectDefinition2D(definition), emitter = {
      ...base.emitters[0]!, timeline: { duration: 1, rate: { kind: "constant" as const, value: 1 } },
      limits: { ...base.emitters[0]!.limits, maxConcurrent: 1 },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D({ ...base, emitters: [emitter], graph: { root: { kind: "parallel" as const, children: [{ kind: "emit" as const, emitterId: emitter.id }, { kind: "emit" as const, emitterId: emitter.id }] } } })));
    const instance = runtime.createInstance(definition.id); instance.start();
    expect(instance.state()).toMatchObject({ activeEmitters: 1, droppedEmitterActivations: 1 });
    runtime.dispose();
  });

  it("instantiates referenced effects with mapped parameters and explicit inheritance, then reclaims them", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const childBase = adaptParticleEffectDefinition2D({ ...definition, id: "runtime-child" });
    const child = {
      ...childBase,
      parameters: [{ id: "power", kind: "number" as const, defaultValue: 1, min: 0, max: 20 }],
      emitters: childBase.emitters.map((emitter) => ({
        ...emitter,
        initialization: { power: { kind: "parameter" as const, parameterId: "power" } },
      })),
    };
    const parentBase = adaptParticleEffectDefinition2D({ ...definition, id: "runtime-parent" });
    const parent = {
      ...parentBase,
      parameters: [{ id: "parent-power", kind: "number" as const, defaultValue: 7, min: 0, max: 20 }],
      graph: {
        root: {
          kind: "effect-reference" as const,
          effectId: child.id,
          parameterMap: { power: "parent-power" },
          inherit: { palette: true, seed: true, timescale: true, qualityTier: true, velocity: 0.5 },
        },
      },
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(child)));
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(parent)));
    const instance = runtime.createInstance(parent.id, {
      palette: { revision: 9, colors: [[1, 0, 0]] }, timescale: 2, qualityTier: "enhanced", inheritedVelocity: [10, 4],
    });
    instance.start();
    expect(runtime.inspect().instances).toHaveLength(2);
    const childState = runtime.inspect().instances.find((entry) => entry.effectId === child.id);
    expect(childState).toMatchObject({ timescale: 2, qualityTier: "enhanced", parameters: { power: 7 } });
    expect(backend.resources[1]!.paletteRevision).toBe(9);
    expect(backend.resources[1]!.emissions[0]).toMatchObject({ power: 7, inheritedVelocityX: 5, inheritedVelocityY: 2 });
    runtime.update(1.1);
    expect(runtime.inspect().instances.map((entry) => entry.effectId)).toEqual([parent.id]);
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
    expect(() => runtime.setDetailedDiagnostics(false)).not.toThrow();
    expect(() => runtime.createInstance("runtime-test")).toThrow("disposed");
  });

  it("compiles hot-reloaded graphs and explains state preservation versus deterministic reset", () => {
    const backend = new TestBackend();
    const runtime = new EngineParticleEffects2D(backend);
    const graph = adaptParticleEffectDefinition2D(definition);
    runtime.register(compileParticleProgram2D(compileParticleEffect2D(graph)));
    const instance = runtime.createInstance("runtime-test");
    const compatible = runtime.reloadGraph({
      ...graph,
      emitters: graph.emitters.map((emitter) => ({ ...emitter, timeline: { ...emitter.timeline, bursts: [{ time: 0, count: 9 }] } })),
      archetypes: graph.archetypes.map((archetype) => ({
        ...archetype,
        appearance: { ...archetype.appearance, flicker: 0.2 },
      })),
    });
    expect(compatible).toMatchObject({ action: "preserved", abiCompatible: true, instances: 1, statePreserved: 1 });
    expect(compatible.explanation).toContain("transferred");
    instance.start();
    expect(backend.resources[1]!.emissions.at(-1)?.count).toBe(9);
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
    expect(backend.resources[1]!.emitterSources.get(0)).toMatchObject({ radius: 10 });
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

  it("replays semantic configuration when a running preferred backend fails", () => {
    const preferred = new TestBackend();
    preferred.create = () => {
      const resource = new TestResource();
      resource.update = () => { throw new Error("device validation failed"); };
      preferred.resources.push(resource);
      return resource;
    };
    const fallback = new TestBackend(), runtime = new EngineParticleEffects2D(new FallbackParticleEffectRuntimeBackend2D(preferred, fallback));
    const base = adaptParticleEffectDefinition2D(definition), extension = {
      id: "fallback-module", supports: ["webgl2", "webgpu"] as const, cpuReference: () => undefined,
      glslSimulation: "stateA.x += uFallbackGain;", wgslSimulation: "stateA[i].position.x += uFallbackGain;",
      bindings: [{ name: "uFallbackGain", kind: "uniform" as const, dataType: "f32", required: true, stages: ["simulation"] as const }],
    };
    runtime.register(compileParticleProgram2D(compileParticleEffect2D({ ...base, customModules: [extension.id] }), [extension]));
    const instance = runtime.createInstance("runtime-test", { palette: { revision: 9, colors: [[0.2, 0.4, 0.8]] }, extensionBindings: { uFallbackGain: 0.75 } });
    instance.setColliders({ revision: 4, circles: [{ x: 10, y: 20, radius: 5, mode: "kill" }], capsules: [{ ax: 1, ay: 2, bx: 3, by: 4, radius: 2 }] });
    instance.setForceFields({ revision: 6, attractors: [{ x: 50, y: 60, strength: 7, velocity: [2, 3] }] });
    instance.setDomain({ revision: 3, shape: "circle", behavior: "wrap", center: [100, 80], radius: 70, damping: 0.9 });
    instance.setEmitterSource("spark", { radius: 12, spread: 0.4 });
    instance.setViewport({ width: 640, height: 360, dpr: 2 });
    instance.setRenderParameters({ pointScale: 3, trailFade: 0.92, trailBackground: [0.1, 0.2, 0.3] });
    instance.setRenderScale(0.5);
    instance.setDetailedDiagnostics(true);
    instance.emitter("spark").emit(1);
    runtime.update(1 / 60);
    const recovered = fallback.resources[0]!;
    expect(recovered.paletteRevision).toBe(9);
    expect(recovered.colliders).toEqual({ revision: 4, circles: [{ x: 10, y: 20, radius: 5, mode: "kill" }], capsules: [{ ax: 1, ay: 2, bx: 3, by: 4, radius: 2 }] });
    expect(recovered.forceFields).toEqual({ revision: 6, attractors: [{ x: 50, y: 60, strength: 7, velocity: [2, 3] }] });
    expect(recovered.domain).toEqual({ revision: 3, shape: "circle", behavior: "wrap", center: [100, 80], radius: 70, damping: 0.9 });
    expect(recovered.emitterSources.get(0)).toEqual({ radius: 12, spread: 0.4 });
    expect(recovered.viewport).toEqual({ width: 640, height: 360, dpr: 2 });
    expect(recovered.renderParameters).toEqual({ pointScale: 3, trailFade: 0.92, trailBackground: [0.1, 0.2, 0.3] });
    expect(recovered.renderScale).toBe(0.5);
    expect(recovered.extensionBindings).toEqual({ uFallbackGain: 0.75 });
    expect(instance.diagnostics()).toMatchObject({ backendFallbackCount: 1, validationFailures: 1 });
    runtime.dispose();
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
