import {
  compileParticleEffect2D,
  validateParticleEffectGraph2D,
  type CompiledParticleEffect2D,
  type ParticleEffectGraph2D,
  type ParticleEmitterGraphNode2D,
  type ParticleParameterValue2D,
} from './ParticleEffectGraph2D.js';

export interface ParticleEffectAsset2D {
  readonly format: 'gl-game-lab-particle-effect';
  readonly graph: ParticleEffectGraph2D;
}

export interface ParticleEffectLibraryDiagnostics2D {
  readonly effectCount: number;
  readonly referenceCount: number;
  readonly compilationOrder: readonly string[];
}

export class ParticleEffectLibrary2D {
  private readonly graphs = new Map<string, ParticleEffectGraph2D>();
  private revisionValue = 0;

  get revision(): number { return this.revisionValue; }
  get size(): number { return this.graphs.size; }

  register(graph: ParticleEffectGraph2D): void {
    validateParticleEffectGraph2D(graph);
    if (this.graphs.has(graph.id)) throw new Error(`Particle effect is already registered: ${graph.id}`);
    this.graphs.set(graph.id, graph);
    try { this.validateReferences(); }
    catch (error) { this.graphs.delete(graph.id); throw error; }
    this.revisionValue += 1;
  }

  replace(graph: ParticleEffectGraph2D): void {
    validateParticleEffectGraph2D(graph);
    const previous = this.graphs.get(graph.id);
    this.graphs.set(graph.id, graph);
    try { this.validateReferences(); }
    catch (error) {
      if (previous) this.graphs.set(graph.id, previous); else this.graphs.delete(graph.id);
      throw error;
    }
    this.revisionValue += 1;
  }

  unregister(id: string): void {
    if (!this.graphs.has(id)) return;
    const removed = this.graphs.get(id)!;
    this.graphs.delete(id);
    try { this.validateReferences(); }
    catch (error) { this.graphs.set(id, removed); throw error; }
    this.revisionValue += 1;
  }

  get(id: string): ParticleEffectGraph2D {
    const graph = this.graphs.get(id);
    if (!graph) throw new Error(`Unknown particle effect: ${id}`);
    return graph;
  }

  compile(id: string): CompiledParticleEffect2D {
    this.validateReferences();
    return compileParticleEffect2D(this.get(id));
  }

  compileAll(): readonly CompiledParticleEffect2D[] {
    return this.compilationOrder().map((id) => compileParticleEffect2D(this.get(id)));
  }

  diagnostics(): ParticleEffectLibraryDiagnostics2D {
    const order = this.compilationOrder();
    return Object.freeze({
      effectCount: this.graphs.size,
      referenceCount: [...this.graphs.values()].reduce((sum, graph) => sum + effectReferences2D(graph).length, 0),
      compilationOrder: Object.freeze(order),
    });
  }

  private validateReferences(): void {
    this.compilationOrder();
    for (const graph of this.graphs.values()) {
      const parentParameters = new Set(graph.parameters.map((entry) => entry.id));
      visitNodes(graph.graph.root, (node) => {
        if (node.kind !== 'effect-reference' || !node.parameterMap) return;
        const child = this.graphs.get(node.effectId);
        if (!child) return;
        const childParameters = new Set(child.parameters.map((entry) => entry.id));
        for (const [childParameter, parentParameter] of Object.entries(node.parameterMap)) {
          if (!childParameters.has(childParameter)) throw new Error(`Particle effect reference ${graph.id} -> ${child.id} maps unknown child parameter ${childParameter}`);
          if (!parentParameters.has(parentParameter)) throw new Error(`Particle effect reference ${graph.id} -> ${child.id} maps unknown parent parameter ${parentParameter}`);
        }
      });
    }
  }

  private compilationOrder(): string[] {
    const result: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Recursive particle effect reference detected at ${id}`);
      const graph = this.graphs.get(id);
      if (!graph) throw new Error(`Unknown referenced particle effect: ${id}`);
      visiting.add(id);
      for (const reference of effectReferences2D(graph)) visit(reference);
      visiting.delete(id);
      visited.add(id);
      result.push(id);
    };
    [...this.graphs.keys()].sort().forEach(visit);
    return result;
  }
}

export function serializeParticleEffect2D(graph: ParticleEffectGraph2D): string {
  validateParticleEffectGraph2D(graph);
  const asset: ParticleEffectAsset2D = { format: 'gl-game-lab-particle-effect', graph };
  return JSON.stringify(asset, stableJsonOrder2D, 2);
}

export function parseParticleEffect2D(source: string): ParticleEffectGraph2D {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || parsed.format !== 'gl-game-lab-particle-effect' || !isRecord(parsed.graph)) throw new Error('Invalid GLGameLab particle effect asset');
  return validateParticleEffectGraph2D(parsed.graph as unknown as ParticleEffectGraph2D);
}

export function resolveParticleParameters2D(
  graph: ParticleEffectGraph2D,
  overrides: Readonly<Record<string, ParticleParameterValue2D>> = {},
): Readonly<Record<string, ParticleParameterValue2D>> {
  const resolved: Record<string, ParticleParameterValue2D> = {};
  for (const parameter of graph.parameters) {
    const value = overrides[parameter.id] ?? parameter.defaultValue;
    validateParameterValue(parameter.id, parameter.kind, value, parameter.values);
    if (parameter.kind === 'number') {
      const numeric = value as number;
      resolved[parameter.id] = Math.min(parameter.max ?? Infinity, Math.max(parameter.min ?? -Infinity, numeric));
    } else resolved[parameter.id] = value;
  }
  for (const key of Object.keys(overrides)) if (!graph.parameters.some((parameter) => parameter.id === key)) throw new Error(`Unknown particle parameter override: ${key}`);
  return Object.freeze(resolved);
}

export interface ParticlePersistedSettingsResolution2D {
  readonly parameters: Readonly<Record<string, ParticleParameterValue2D>>;
  readonly consumedKeys: readonly string[];
  readonly unknownKeys: readonly string[];
  readonly migratedAliases: readonly { readonly from: string; readonly to: string }[];
}

/** Resolves stable scene keys and legacy aliases without silently discarding data. */
export function resolveParticlePersistedSettings2D(
  graph: ParticleEffectGraph2D,
  settings: Readonly<Record<string, ParticleParameterValue2D>>,
): ParticlePersistedSettingsResolution2D {
  const overrides: Record<string, ParticleParameterValue2D> = {};
  const consumed = new Set<string>();
  const migrated: Array<{ from: string; to: string }> = [];
  for (const binding of graph.persistedBindings ?? []) {
    let sourceKey: string | undefined;
    if (Object.prototype.hasOwnProperty.call(settings, binding.key)) sourceKey = binding.key;
    else sourceKey = binding.aliases?.find((alias) => Object.prototype.hasOwnProperty.call(settings, alias));
    if (!sourceKey) continue;
    overrides[binding.parameterId] = settings[sourceKey]!;
    consumed.add(sourceKey);
    if (sourceKey !== binding.key) migrated.push({ from: sourceKey, to: binding.key });
  }
  const parameterIds = new Set(graph.parameters.map((parameter) => parameter.id));
  for (const [key, value] of Object.entries(settings)) {
    if (consumed.has(key)) continue;
    if (parameterIds.has(key)) { overrides[key] = value; consumed.add(key); }
  }
  return Object.freeze({
    parameters: resolveParticleParameters2D(graph, overrides),
    consumedKeys: Object.freeze([...consumed].sort()),
    unknownKeys: Object.freeze(Object.keys(settings).filter((key) => !consumed.has(key)).sort()),
    migratedAliases: Object.freeze(migrated),
  });
}

export function effectReferences2D(graph: ParticleEffectGraph2D): readonly string[] {
  const references = new Set<string>();
  visitNodes(graph.graph.root, (node) => { if (node.kind === 'effect-reference') references.add(node.effectId); });
  return Object.freeze([...references].sort());
}

function visitNodes(node: ParticleEmitterGraphNode2D, visitor: (node: ParticleEmitterGraphNode2D) => void): void {
  visitor(node);
  if (node.kind === 'sequence' || node.kind === 'parallel' || node.kind === 'random-choice') node.children.forEach((child) => { visitNodes(child, visitor); });
  else if (node.kind === 'weighted-choice') node.choices.forEach((entry) => { visitNodes(entry.child, visitor); });
  else if (node.kind === 'delay' || node.kind === 'repeat' || node.kind === 'gate' || node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') visitNodes(node.child, visitor);
  else if (node.kind === 'condition') { visitNodes(node.then, visitor); if (node.otherwise) visitNodes(node.otherwise, visitor); }
}

function validateParameterValue(id: string, kind: string, value: ParticleParameterValue2D, values?: readonly string[]): void {
  if (kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Particle parameter ${id} requires a finite number`);
  if (kind === 'boolean' && typeof value !== 'boolean') throw new Error(`Particle parameter ${id} requires a boolean`);
  if (kind === 'enum' && (typeof value !== 'string' || !values?.includes(value))) throw new Error(`Particle parameter ${id} requires a declared enum value`);
  if (kind === 'vector2' && (!Array.isArray(value) || value.length !== 2)) throw new Error(`Particle parameter ${id} requires a vector2`);
  if (kind === 'color' && (!Array.isArray(value) || value.length !== 4)) throw new Error(`Particle parameter ${id} requires a color`);
}

function stableJsonOrder2D(_key: string, value: unknown): unknown {
  if (!isRecord(value) || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
