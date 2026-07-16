import type {
  ParticleArchetype2D,
  ParticleCapacityPolicy2D,
  ParticleEffectDefinition2D,
  ParticleRenderRecipeSet2D,
  ParticleRenderTier2D,
  ParticleSettingValue2D,
  ParticleSpawnShape2D,
} from './ParticleEffects2D.js';

export const PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION = 1;
export const PARTICLE_EFFECT_COMPILER_VERSION = 1;

export type ParticleParameterValue2D = ParticleSettingValue2D | readonly [number, number] | readonly [number, number, number, number];
export type ParticleParameterKind2D = 'number' | 'boolean' | 'enum' | 'vector2' | 'color' | 'palette';
export type ParticleCoordinateSpace2D = 'local' | 'parent' | 'effect' | 'scene' | 'world';
export type ParticleEmitterImportance2D = 'critical' | 'primary' | 'secondary' | 'cosmetic';
export type ParticleEmitterStopMode2D = 'drain' | 'kill';
export type ParticleOverflowPolicy2D = 'recycle-oldest' | 'drop-new' | 'reserve-priority';
export type ParticleBackendFallbackPolicy2D = 'webgl2' | 'static-preview' | 'fail';
export type ParticleInterpolation2D = 'linear' | 'smooth' | 'step' | 'exponential' | 'cubic';

export interface ParticleParameterDefinition2D {
  readonly id: string;
  readonly kind: ParticleParameterKind2D;
  readonly defaultValue: ParticleParameterValue2D;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly string[];
}

export interface ParticleCurveKey2D {
  readonly time: number;
  readonly value: number;
  readonly interpolation?: ParticleInterpolation2D;
}

export interface ParticleCurve2D {
  readonly keys: readonly ParticleCurveKey2D[];
}

export type ParticleValueSource2D =
  | { readonly kind: 'constant'; readonly value: number }
  | { readonly kind: 'parameter'; readonly parameterId: string; readonly scale?: number; readonly offset?: number }
  | { readonly kind: 'random'; readonly min: number; readonly max: number }
  | { readonly kind: 'curve'; readonly curve: ParticleCurve2D };

export type ParticleSpawnSource2D =
  | { readonly kind: ParticleSpawnShape2D; readonly radius?: number; readonly length?: number; readonly arc?: number; readonly spread?: number }
  | { readonly kind: 'rectangle'; readonly width: number; readonly height: number }
  | { readonly kind: 'path'; readonly points: readonly (readonly [number, number])[]; readonly closed?: boolean }
  | { readonly kind: 'texture-mask'; readonly textureId: string; readonly threshold?: number }
  | { readonly kind: 'mesh'; readonly meshId: string; readonly sample: 'vertices' | 'edges' | 'surface' }
  | { readonly kind: 'particles'; readonly archetypeId?: string }
  | { readonly kind: 'collision-contacts'; readonly colliderSetId?: string }
  | { readonly kind: 'external-points'; readonly sourceId: string }
  | { readonly kind: 'custom'; readonly moduleId: string; readonly parameters?: Readonly<Record<string, number>> };

export interface ParticleEmitterBurst2D {
  readonly time: number;
  readonly count: number;
  readonly cycles?: number;
  readonly interval?: number;
}

export interface ParticleEmitterTimeline2D {
  readonly duration?: number;
  readonly startDelay?: number;
  readonly loop?: boolean;
  readonly maxLoops?: number;
  readonly prewarm?: boolean;
  readonly rate?: ParticleValueSource2D;
  readonly distanceRate?: ParticleValueSource2D;
  readonly bursts?: readonly ParticleEmitterBurst2D[];
  readonly manual?: boolean;
}

export interface ParticleTransformPolicy2D {
  readonly space: ParticleCoordinateSpace2D;
  readonly inheritPosition?: boolean;
  readonly inheritRotation?: boolean;
  readonly inheritScale?: boolean;
}

export interface ParticleInheritancePolicy2D {
  readonly velocity?: number;
  readonly palette?: boolean;
  readonly seed?: boolean;
  readonly timescale?: boolean;
  readonly qualityTier?: boolean;
}

export interface ParticleEmitterLimits2D {
  readonly maxAlive?: number;
  readonly maxPerFrame?: number;
  readonly maxGeneration?: number;
  readonly importance: ParticleEmitterImportance2D;
  readonly qualityScale?: Partial<Record<ParticleRenderTier2D, number>>;
}

export interface ParticleInitialization2D {
  readonly direction?: ParticleValueSource2D;
  readonly spread?: ParticleValueSource2D;
  readonly power?: ParticleValueSource2D;
  readonly lifetimeScale?: ParticleValueSource2D;
  readonly paletteSeed?: ParticleValueSource2D;
}

export interface ParticleParameterBinding2D {
  readonly target: string;
  readonly source: ParticleValueSource2D;
}

export interface ParticleEmitterDefinition2D {
  readonly id: string;
  readonly archetypeId: string;
  readonly timeline: ParticleEmitterTimeline2D;
  readonly source: ParticleSpawnSource2D;
  readonly initialization?: ParticleInitialization2D;
  readonly transform: ParticleTransformPolicy2D;
  readonly inheritance?: ParticleInheritancePolicy2D;
  readonly limits: ParticleEmitterLimits2D;
  readonly parameters?: readonly ParticleParameterBinding2D[];
  readonly outputs?: readonly string[];
}

export type ParticleGraphEvent2D =
  | { readonly kind: 'effect-start' | 'effect-stop' | 'effect-complete' }
  | { readonly kind: 'emitter-start' | 'emitter-burst' | 'emitter-loop' | 'emitter-stop' | 'emitter-complete'; readonly emitterId: string }
  | { readonly kind: 'particle-birth' | 'particle-death' | 'particle-collision'; readonly archetypeId: string }
  | { readonly kind: 'particle-age'; readonly archetypeId: string; readonly age: number }
  | { readonly kind: 'signal'; readonly signal: string }
  | { readonly kind: 'marker'; readonly marker: string };

export type ParticleCondition2D =
  | { readonly kind: 'parameter'; readonly parameterId: string; readonly operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; readonly value: ParticleParameterValue2D }
  | { readonly kind: 'chance'; readonly probability: number };

export type ParticleEmitterGraphNode2D =
  | { readonly kind: 'emit'; readonly emitterId: string }
  | { readonly kind: 'effect-reference'; readonly effectId: string; readonly inherit?: ParticleInheritancePolicy2D; readonly parameterMap?: Readonly<Record<string, string>> }
  | { readonly kind: 'sequence' | 'parallel'; readonly children: readonly ParticleEmitterGraphNode2D[] }
  | { readonly kind: 'delay'; readonly duration: number; readonly child: ParticleEmitterGraphNode2D }
  | { readonly kind: 'repeat'; readonly count: number; readonly interval?: number; readonly child: ParticleEmitterGraphNode2D }
  | { readonly kind: 'random-choice'; readonly children: readonly ParticleEmitterGraphNode2D[] }
  | { readonly kind: 'weighted-choice'; readonly choices: readonly { readonly weight: number; readonly child: ParticleEmitterGraphNode2D }[] }
  | { readonly kind: 'condition'; readonly condition: ParticleCondition2D; readonly then: ParticleEmitterGraphNode2D; readonly otherwise?: ParticleEmitterGraphNode2D }
  | { readonly kind: 'gate'; readonly event: ParticleGraphEvent2D; readonly child: ParticleEmitterGraphNode2D }
  | { readonly kind: 'timeline'; readonly markers: readonly { readonly time: number; readonly marker: string }[]; readonly child: ParticleEmitterGraphNode2D }
  | { readonly kind: 'parameter-remap'; readonly map: Readonly<Record<string, string>>; readonly child: ParticleEmitterGraphNode2D }
  | { readonly kind: 'transform'; readonly space: ParticleCoordinateSpace2D; readonly child: ParticleEmitterGraphNode2D }
  | { readonly kind: 'trigger'; readonly signal: string }
  | { readonly kind: 'stop'; readonly emitterId?: string; readonly mode?: ParticleEmitterStopMode2D }
  | { readonly kind: 'wait-for-completion'; readonly emitterId?: string };

export interface ParticleEmitterGraph2D {
  readonly root: ParticleEmitterGraphNode2D;
}

export interface ParticleQualityPolicy2D {
  readonly defaultTier: ParticleRenderTier2D;
  readonly allowRuntimeScaling?: boolean;
  readonly targetFrameMs?: number;
  readonly previewCapacity?: number;
  readonly demoCapacity?: number;
  readonly previewEmissionScale?: number;
}

export interface ParticleArchetypeCapacity2D {
  readonly archetypeId: string;
  readonly share: number;
  readonly reserved?: number;
  readonly overflow: ParticleOverflowPolicy2D;
}

export interface ParticlePersistedSettingBinding2D {
  readonly parameterId: string;
  readonly key: string;
  readonly aliases?: readonly string[];
}

export interface ParticleBackendRequirements2D {
  readonly metadata: boolean;
  readonly events: boolean;
  readonly floatTargets: boolean;
  readonly floatBlend?: boolean;
  readonly minimumDrawBuffers: number;
}

export interface ParticleEffectGraph2D {
  readonly schemaVersion: number;
  readonly id: string;
  readonly parameters: readonly ParticleParameterDefinition2D[];
  readonly archetypes: readonly ParticleArchetype2D[];
  readonly emitters: readonly ParticleEmitterDefinition2D[];
  readonly graph: ParticleEmitterGraph2D;
  readonly renderRecipes: ParticleRenderRecipeSet2D;
  readonly capacity: ParticleCapacityPolicy2D;
  readonly quality: ParticleQualityPolicy2D;
  readonly archetypeCapacity?: readonly ParticleArchetypeCapacity2D[];
  readonly persistedBindings?: readonly ParticlePersistedSettingBinding2D[];
  readonly customModules?: readonly string[];
  readonly fallbackPolicy?: ParticleBackendFallbackPolicy2D;
}

export type ParticleGraphInstruction2D =
  | { readonly opcode: 'emit'; readonly operand: number }
  | { readonly opcode: 'begin-sequence' | 'end-sequence' | 'begin-parallel' | 'end-parallel'; readonly operand: number }
  | { readonly opcode: 'delay' | 'repeat'; readonly operand: number }
  | { readonly opcode: 'gate'; readonly operand: number }
  | { readonly opcode: 'effect-reference'; readonly operand: number }
  | { readonly opcode: 'control'; readonly operand: number };

export interface ParticleEffectCompileReport2D {
  readonly archetypeCount: number;
  readonly emitterCount: number;
  readonly instructionCount: number;
  readonly maximumEventGeneration: number;
  readonly maximumChildrenPerEvent: number;
  readonly requiredStateTargets: 2 | 3;
  readonly referencedEffects: readonly string[];
  readonly warnings: readonly string[];
}

export interface CompiledParticleEffect2D {
  readonly compilerVersion: number;
  readonly stateAbiVersion: number;
  readonly graphHash: string;
  readonly abiHash: string;
  readonly source: ParticleEffectGraph2D;
  readonly legacyDefinition: ParticleEffectDefinition2D;
  readonly archetypeIds: Readonly<Record<string, number>>;
  readonly emitterIds: Readonly<Record<string, number>>;
  readonly parameterIds: Readonly<Record<string, number>>;
  readonly instructions: readonly ParticleGraphInstruction2D[];
  readonly report: ParticleEffectCompileReport2D;
  readonly archetypeCapacity: readonly ParticleArchetypeCapacity2D[];
  readonly backendRequirements: ParticleBackendRequirements2D;
  readonly fallbackPolicy: ParticleBackendFallbackPolicy2D;
  readonly persistedBindings: readonly ParticlePersistedSettingBinding2D[];
}

export function defineParticleEffect2D<const T extends ParticleEffectGraph2D>(definition: T): T {
  validateParticleEffectGraph2D(definition);
  return Object.freeze(definition);
}

export function emitter2D(definition: ParticleEmitterDefinition2D): ParticleEmitterDefinition2D {
  return Object.freeze(definition);
}

export const particleGraph2D = Object.freeze({
  emit: (emitterId: string): ParticleEmitterGraphNode2D => ({ kind: 'emit', emitterId }),
  effect: (effectId: string, inherit?: ParticleInheritancePolicy2D): ParticleEmitterGraphNode2D => inherit ? ({ kind: 'effect-reference', effectId, inherit }) : ({ kind: 'effect-reference', effectId }),
  sequence: (...children: readonly ParticleEmitterGraphNode2D[]): ParticleEmitterGraphNode2D => ({ kind: 'sequence', children }),
  parallel: (...children: readonly ParticleEmitterGraphNode2D[]): ParticleEmitterGraphNode2D => ({ kind: 'parallel', children }),
  delay: (duration: number, child: ParticleEmitterGraphNode2D): ParticleEmitterGraphNode2D => ({ kind: 'delay', duration, child }),
  repeat: (count: number, child: ParticleEmitterGraphNode2D, interval?: number): ParticleEmitterGraphNode2D => interval === undefined ? ({ kind: 'repeat', count, child }) : ({ kind: 'repeat', count, interval, child }),
  gate: (event: ParticleGraphEvent2D, child: ParticleEmitterGraphNode2D): ParticleEmitterGraphNode2D => ({ kind: 'gate', event, child }),
  signal: (signal: string): ParticleEmitterGraphNode2D => ({ kind: 'trigger', signal }),
});

export function particleConstant2D(value: number): ParticleValueSource2D { return { kind: 'constant', value }; }
export function particleParameter2D(parameterId: string, scale?: number, offset?: number): ParticleValueSource2D {
  return {
    kind: 'parameter',
    parameterId,
    ...(scale === undefined ? {} : { scale }),
    ...(offset === undefined ? {} : { offset }),
  };
}
export function particleRandom2D(min: number, max: number): ParticleValueSource2D { return { kind: 'random', min, max }; }

export function particleOnce2D(count = 1): ParticleEmitterTimeline2D {
  return { duration: 0, bursts: [{ time: 0, count }] };
}

export function particleRate2D(rate: ParticleValueSource2D, duration?: number, loop = false): ParticleEmitterTimeline2D {
  return { rate, loop, ...(duration === undefined ? {} : { duration }) };
}

export function adaptParticleEffectDefinition2D(definition: ParticleEffectDefinition2D): ParticleEffectGraph2D {
  const emitters = definition.archetypes.map((archetype): ParticleEmitterDefinition2D => ({
    id: archetype.id,
    archetypeId: archetype.id,
    timeline: { manual: true },
    source: { kind: archetype.spawn.shape, spread: archetype.spawn.spread, ...(archetype.spawn.radius === undefined ? {} : { radius: archetype.spawn.radius }), ...(archetype.spawn.arc === undefined ? {} : { arc: archetype.spawn.arc }) },
    transform: { space: 'scene' },
    limits: { importance: archetype.id === 'core' || archetype.id === 'shell' ? 'critical' : archetype.id === 'primary' ? 'primary' : 'secondary' },
  }));
  return defineParticleEffect2D({
    schemaVersion: PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION,
    id: definition.id,
    parameters: [],
    archetypes: definition.archetypes,
    emitters,
    graph: { root: { kind: 'parallel', children: emitters.map((emitter) => ({ kind: 'emit', emitterId: emitter.id })) } },
    renderRecipes: definition.renderRecipes,
    capacity: definition.capacity,
    quality: { defaultTier: definition.renderRecipes.defaultTier, allowRuntimeScaling: true, targetFrameMs: 16.67 },
  });
}

export function compileParticleEffect2D(graph: ParticleEffectGraph2D): CompiledParticleEffect2D {
  validateParticleEffectGraph2D(graph);
  const archetypeIds = stableIds(graph.archetypes.map((entry) => entry.id));
  const emitterIds = stableIds(graph.emitters.map((entry) => entry.id));
  const parameterIds = stableIds(graph.parameters.map((entry) => entry.id));
  const instructions: ParticleGraphInstruction2D[] = [];
  const references = new Set<string>();
  compileNode(graph.graph.root, emitterIds, instructions, references);
  let maximumEventGeneration = 0;
  let maximumChildrenPerEvent = 0;
  for (const archetype of graph.archetypes) {
    for (const event of archetype.events ?? []) {
      maximumEventGeneration = Math.max(maximumEventGeneration, event.maxGeneration);
      maximumChildrenPerEvent = Math.max(maximumChildrenPerEvent, event.count);
    }
  }
  const legacyDefinition: ParticleEffectDefinition2D = Object.freeze({
    id: graph.id,
    capacity: graph.capacity,
    archetypes: graph.archetypes,
    modules: {
      motion: true,
      lifecycle: true,
      collisions: graph.archetypes.some((entry) => entry.collision !== undefined),
      events: graph.archetypes.some((entry) => (entry.events?.length ?? 0) > 0),
      turbulence: graph.archetypes.some((entry) => (entry.motion.turbulence ?? 0) !== 0),
      rotation: graph.archetypes.some((entry) => (entry.motion.angularVelocity ?? 0) !== 0),
    },
    renderRecipes: graph.renderRecipes,
  });
  const archetypeCapacity = resolveArchetypeCapacity(graph);
  const backendRequirements: ParticleBackendRequirements2D = Object.freeze({
    metadata: maximumEventGeneration > 0 || graph.archetypes.some((entry) => entry.events?.length),
    events: graph.archetypes.some((entry) => entry.events?.length),
    floatTargets: true,
    floatBlend: false,
    minimumDrawBuffers: maximumEventGeneration > 0 || graph.archetypes.some((entry) => entry.events?.length) ? 3 : 2,
  });
  const graphHash = hashParticleGraph2D(graph);
  const abiHash = hashText2D(JSON.stringify({ state: 1, archetypes: graph.archetypes.map((entry) => entry.id), metadata: backendRequirements.metadata }));
  return Object.freeze({
    compilerVersion: PARTICLE_EFFECT_COMPILER_VERSION,
    stateAbiVersion: 1,
    graphHash,
    abiHash,
    source: graph,
    legacyDefinition,
    archetypeIds: Object.freeze(archetypeIds),
    emitterIds: Object.freeze(emitterIds),
    parameterIds: Object.freeze(parameterIds),
    instructions: Object.freeze(instructions),
    report: Object.freeze({
      archetypeCount: graph.archetypes.length,
      emitterCount: graph.emitters.length,
      instructionCount: instructions.length,
      maximumEventGeneration,
      maximumChildrenPerEvent,
      requiredStateTargets: maximumEventGeneration > 0 || graph.archetypes.some((entry) => entry.events?.length) ? 3 : 2,
      referencedEffects: Object.freeze([...references].sort()),
      warnings: Object.freeze(collectWarnings(graph)),
    }),
    archetypeCapacity: Object.freeze(archetypeCapacity),
    backendRequirements,
    fallbackPolicy: graph.fallbackPolicy ?? 'webgl2',
    persistedBindings: Object.freeze([...(graph.persistedBindings ?? [])]),
  });
}

export function hashParticleGraph2D(graph: ParticleEffectGraph2D): string {
  return hashText2D(canonicalJson2D(graph));
}

export function validateParticleEffectGraph2D(graph: ParticleEffectGraph2D): ParticleEffectGraph2D {
  if (graph.schemaVersion !== PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION) throw new Error(`Unsupported particle effect graph schema: ${graph.schemaVersion}`);
  requireId(graph.id, 'effect');
  const archetypes = uniqueIds(graph.archetypes, 'archetype');
  const emitters = uniqueIds(graph.emitters, 'emitter');
  const parameters = uniqueIds(graph.parameters, 'parameter');
  if (archetypes.size === 0) throw new Error(`Particle effect ${graph.id} requires at least one archetype`);
  for (const parameter of graph.parameters) validateParameter(parameter);
  for (const emitter of graph.emitters) {
    if (!archetypes.has(emitter.archetypeId)) throw new Error(`Particle emitter ${emitter.id} references unknown archetype ${emitter.archetypeId}`);
    validateEmitter(emitter, parameters, archetypes);
  }
  validateArchetypeCapacity(graph, archetypes);
  validatePersistedBindings(graph, parameters);
  validateEventCycles(graph);
  validateGraphNode(graph.graph.root, emitters, archetypes, parameters, 'root', 0);
  if (!graph.renderRecipes.recipes.some((entry) => entry.tier === graph.quality.defaultTier)) throw new Error(`Particle effect ${graph.id} quality tier is not rendered`);
  return graph;
}

function validateArchetypeCapacity(graph: ParticleEffectGraph2D, archetypes: ReadonlySet<string>): void {
  if (!graph.archetypeCapacity) return;
  const seen = new Set<string>(); let share = 0;
  for (const policy of graph.archetypeCapacity) {
    if (!archetypes.has(policy.archetypeId) || seen.has(policy.archetypeId)) throw new Error(`Invalid particle archetype capacity policy: ${policy.archetypeId}`);
    if (!Number.isFinite(policy.share) || policy.share <= 0 || policy.share > 1) throw new Error(`Particle archetype ${policy.archetypeId} has an invalid capacity share`);
    if (policy.reserved !== undefined && (!Number.isSafeInteger(policy.reserved) || policy.reserved < 0)) throw new Error(`Particle archetype ${policy.archetypeId} has an invalid reservation`);
    seen.add(policy.archetypeId); share += policy.share;
  }
  if (share > 1.000001) throw new Error('Particle archetype capacity shares exceed one');
}

function validatePersistedBindings(graph: ParticleEffectGraph2D, parameters: ReadonlySet<string>): void {
  const keys = new Set<string>();
  for (const binding of graph.persistedBindings ?? []) {
    if (!parameters.has(binding.parameterId)) throw new Error(`Particle persisted binding references unknown parameter ${binding.parameterId}`);
    for (const key of [binding.key, ...(binding.aliases ?? [])]) {
      if (keys.has(key)) throw new Error(`Duplicate particle persisted setting key or alias: ${key}`);
      keys.add(key);
    }
  }
}

function validateEventCycles(graph: ParticleEffectGraph2D): void {
  const edges = new Map(graph.archetypes.map((entry) => [entry.id, entry.events ?? []] as const));
  const visit = (id: string, path: Set<string>): void => {
    if (path.has(id)) return;
    const nextPath = new Set(path); nextPath.add(id);
    for (const event of edges.get(id) ?? []) {
      if (nextPath.has(event.childArchetypeId) && event.maxGeneration > 8) throw new Error(`Particle event cycle at ${event.childArchetypeId} exceeds the supported generation depth`);
      visit(event.childArchetypeId, nextPath);
    }
  };
  graph.archetypes.forEach((entry) => { visit(entry.id, new Set()); });
}

function validateParameter(parameter: ParticleParameterDefinition2D): void {
  if (parameter.kind === 'number') {
    if (typeof parameter.defaultValue !== 'number' || !Number.isFinite(parameter.defaultValue)) throw new Error(`Particle number parameter ${parameter.id} requires a finite default`);
    if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) throw new Error(`Particle parameter ${parameter.id} has an invalid range`);
  }
  if (parameter.kind === 'enum' && (!parameter.values || parameter.values.length === 0 || !parameter.values.includes(String(parameter.defaultValue)))) throw new Error(`Particle enum parameter ${parameter.id} requires values containing its default`);
}

function validateEmitter(emitter: ParticleEmitterDefinition2D, parameters: ReadonlySet<string>, archetypes: ReadonlySet<string>): void {
  if (emitter.timeline.duration !== undefined && (!Number.isFinite(emitter.timeline.duration) || emitter.timeline.duration < 0)) throw new Error(`Particle emitter ${emitter.id} has an invalid duration`);
  if (emitter.timeline.loop && emitter.timeline.maxLoops === undefined && emitter.timeline.duration === undefined) throw new Error(`Particle emitter ${emitter.id} has an unbounded loop without a duration`);
  for (const burst of emitter.timeline.bursts ?? []) {
    if (!Number.isFinite(burst.time) || burst.time < 0 || !Number.isSafeInteger(burst.count) || burst.count < 0) throw new Error(`Particle emitter ${emitter.id} has an invalid burst`);
  }
  if (emitter.limits.maxGeneration !== undefined && (!Number.isSafeInteger(emitter.limits.maxGeneration) || emitter.limits.maxGeneration < 0)) throw new Error(`Particle emitter ${emitter.id} has an invalid generation limit`);
  validateSource(emitter.source, archetypes, emitter.id);
  for (const source of Object.values(emitter.initialization ?? {})) if (source) validateValueSource(source, parameters, emitter.id);
  for (const binding of emitter.parameters ?? []) validateValueSource(binding.source, parameters, emitter.id);
}

function validateSource(source: ParticleSpawnSource2D, archetypes: ReadonlySet<string>, emitterId: string): void {
  if (source.kind === 'path' && source.points.length < 2) throw new Error(`Particle emitter ${emitterId} path requires at least two points`);
  if (source.kind === 'particles' && source.archetypeId && !archetypes.has(source.archetypeId)) throw new Error(`Particle emitter ${emitterId} samples unknown archetype ${source.archetypeId}`);
  if (source.kind === 'rectangle' && (source.width < 0 || source.height < 0)) throw new Error(`Particle emitter ${emitterId} rectangle dimensions must be non-negative`);
}

function validateValueSource(source: ParticleValueSource2D, parameters: ReadonlySet<string>, owner: string): void {
  if (source.kind === 'parameter' && !parameters.has(source.parameterId)) throw new Error(`Particle ${owner} references unknown parameter ${source.parameterId}`);
  if (source.kind === 'random' && (!Number.isFinite(source.min) || !Number.isFinite(source.max) || source.min > source.max)) throw new Error(`Particle ${owner} has an invalid random range`);
  if (source.kind === 'curve') validateCurve(source.curve, owner);
}

function validateCurve(curve: ParticleCurve2D, owner: string): void {
  if (curve.keys.length === 0) throw new Error(`Particle ${owner} curve requires keys`);
  let previous = -Infinity;
  for (const key of curve.keys) {
    if (!Number.isFinite(key.time) || !Number.isFinite(key.value) || key.time < previous) throw new Error(`Particle ${owner} curve keys must be finite and ordered`);
    previous = key.time;
  }
}

function validateGraphNode(node: ParticleEmitterGraphNode2D, emitters: ReadonlySet<string>, archetypes: ReadonlySet<string>, parameters: ReadonlySet<string>, path: string, depth: number): void {
  if (depth > 64) throw new Error(`Particle graph ${path} exceeds the maximum nesting depth`);
  if (node.kind === 'emit' && !emitters.has(node.emitterId)) throw new Error(`Particle graph ${path} references unknown emitter ${node.emitterId}`);
  if ((node.kind === 'sequence' || node.kind === 'parallel' || node.kind === 'random-choice') && node.children.length === 0) throw new Error(`Particle graph ${path} requires children`);
  if (node.kind === 'repeat' && (!Number.isSafeInteger(node.count) || node.count < 1 || node.count > 10_000)) throw new Error(`Particle graph ${path} repeat must be bounded`);
  if (node.kind === 'delay' && (!Number.isFinite(node.duration) || node.duration < 0)) throw new Error(`Particle graph ${path} delay must be non-negative`);
  if (node.kind === 'weighted-choice' && (node.choices.length === 0 || node.choices.some((entry) => !Number.isFinite(entry.weight) || entry.weight <= 0))) throw new Error(`Particle graph ${path} has invalid weighted choices`);
  if (node.kind === 'condition' && node.condition.kind === 'parameter' && !parameters.has(node.condition.parameterId)) throw new Error(`Particle graph ${path} references unknown parameter ${node.condition.parameterId}`);
  if (node.kind === 'gate' && 'archetypeId' in node.event && !archetypes.has(node.event.archetypeId)) throw new Error(`Particle graph ${path} references unknown archetype ${node.event.archetypeId}`);
  if (node.kind === 'gate' && 'emitterId' in node.event && !emitters.has(node.event.emitterId)) throw new Error(`Particle graph ${path} references unknown emitter ${node.event.emitterId}`);
  for (const [index, child] of nodeChildren(node).entries()) validateGraphNode(child, emitters, archetypes, parameters, `${path}.${node.kind}[${index}]`, depth + 1);
}

function nodeChildren(node: ParticleEmitterGraphNode2D): readonly ParticleEmitterGraphNode2D[] {
  if (node.kind === 'sequence' || node.kind === 'parallel' || node.kind === 'random-choice') return node.children;
  if (node.kind === 'weighted-choice') return node.choices.map((entry) => entry.child);
  if (node.kind === 'delay' || node.kind === 'repeat' || node.kind === 'gate' || node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') return [node.child];
  if (node.kind === 'condition') return node.otherwise ? [node.then, node.otherwise] : [node.then];
  return [];
}

function compileNode(node: ParticleEmitterGraphNode2D, emitters: Readonly<Record<string, number>>, output: ParticleGraphInstruction2D[], references: Set<string>): void {
  if (node.kind === 'emit') { output.push({ opcode: 'emit', operand: emitters[node.emitterId] ?? -1 }); return; }
  if (node.kind === 'effect-reference') { references.add(node.effectId); output.push({ opcode: 'effect-reference', operand: references.size - 1 }); return; }
  if (node.kind === 'sequence' || node.kind === 'parallel') {
    output.push({ opcode: node.kind === 'sequence' ? 'begin-sequence' : 'begin-parallel', operand: node.children.length });
    node.children.forEach((child) => { compileNode(child, emitters, output, references); });
    output.push({ opcode: node.kind === 'sequence' ? 'end-sequence' : 'end-parallel', operand: 0 });
    return;
  }
  if (node.kind === 'delay' || node.kind === 'repeat') output.push({ opcode: node.kind, operand: node.kind === 'delay' ? node.duration : node.count });
  else if (node.kind === 'gate') output.push({ opcode: 'gate', operand: graphEventCode(node.event) });
  else output.push({ opcode: 'control', operand: 0 });
  nodeChildren(node).forEach((child) => { compileNode(child, emitters, output, references); });
}

function graphEventCode(event: ParticleGraphEvent2D): number {
  return ['effect-start', 'effect-stop', 'effect-complete', 'emitter-start', 'emitter-burst', 'emitter-loop', 'emitter-stop', 'emitter-complete', 'particle-birth', 'particle-death', 'particle-collision', 'particle-age', 'signal', 'marker'].indexOf(event.kind);
}

function collectWarnings(graph: ParticleEffectGraph2D): string[] {
  const warnings: string[] = [];
  if (graph.emitters.length === 0) warnings.push('Effect has no emitters');
  if (graph.capacity.previewMax > 262_144) warnings.push('Preview capacity exceeds the recommended 262144-particle ceiling');
  if (graph.archetypes.some((entry) => (entry.events ?? []).some((event) => event.count > 1024))) warnings.push('A particle event emits more than 1024 children');
  return warnings;
}

function resolveArchetypeCapacity(graph: ParticleEffectGraph2D): ParticleArchetypeCapacity2D[] {
  if (graph.archetypeCapacity) return [...graph.archetypeCapacity];
  const share = 1 / graph.archetypes.length;
  return graph.archetypes.map((entry, index) => ({ archetypeId: entry.id, share, overflow: index === 0 ? 'reserve-priority' : 'recycle-oldest' }));
}

function canonicalJson2D(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson2D).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson2D(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashText2D(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableIds(ids: readonly string[]): Record<string, number> {
  const output: Record<string, number> = {};
  ids.forEach((id, index) => { output[id] = index; });
  return output;
}

function uniqueIds<T extends { readonly id: string }>(values: readonly T[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    requireId(value.id, label);
    if (ids.has(value.id)) throw new Error(`Duplicate particle ${label} id: ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

function requireId(id: string, label: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid particle ${label} id: ${id}`);
}
