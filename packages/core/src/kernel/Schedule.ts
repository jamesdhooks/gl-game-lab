import { CommandBuffer } from '../ecs/CommandBuffer.js';
import type { World } from '../ecs/World.js';
import type { TimeSnapshot } from './Time.js';

export const STANDARD_SCHEDULE_STAGES = [
  'startup',
  'preFixed',
  'fixedUpdate',
  'postFixed',
  'preUpdate',
  'update',
  'postUpdate',
  'renderExtract',
  'renderPrepare',
  'render',
  'postRender',
  'shutdown',
] as const;

export type StandardScheduleStage = typeof STANDARD_SCHEDULE_STAGES[number];
export type ScheduleStageKind = 'startup' | 'fixed' | 'frame' | 'shutdown';

export interface SystemAccess {
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
}

export interface SystemContext {
  readonly world: World;
  readonly commands: CommandBuffer;
  readonly time: TimeSnapshot;
  readonly stage: string;
}

export interface SystemDefinition {
  readonly id: string;
  readonly stage: string;
  readonly before?: readonly string[];
  readonly after?: readonly string[];
  readonly access?: SystemAccess;
  readonly run: (context: SystemContext) => void;
}

export interface SystemProfiler {
  measure(systemId: string, stage: string, run: () => void): void;
}

interface RegisteredSystem {
  readonly definition: SystemDefinition;
  readonly registrationOrder: number;
}

export class Schedule {
  private readonly stages: string[] = [...STANDARD_SCHEDULE_STAGES];
  private readonly stageKinds = new Map<string, ScheduleStageKind>([
    ['startup', 'startup'],
    ['preFixed', 'fixed'],
    ['fixedUpdate', 'fixed'],
    ['postFixed', 'fixed'],
    ['preUpdate', 'frame'],
    ['update', 'frame'],
    ['postUpdate', 'frame'],
    ['renderExtract', 'frame'],
    ['renderPrepare', 'frame'],
    ['render', 'frame'],
    ['postRender', 'frame'],
    ['shutdown', 'shutdown'],
  ]);
  private readonly systems = new Map<string, RegisteredSystem>();
  private compiled = new Map<string, readonly SystemDefinition[]>();
  private registrationOrder = 0;
  private dirty = true;
  private runningStage: string | undefined;
  private profiler: SystemProfiler | undefined;

  setProfiler(profiler: SystemProfiler | undefined): void {
    this.assertNotRunning();
    this.profiler = profiler;
  }

  get stageIds(): readonly string[] {
    return this.stages;
  }

  stageKind(id: string): ScheduleStageKind {
    const kind = this.stageKinds.get(id);
    if (!kind) throw new Error(`Unknown schedule stage: ${id}`);
    return kind;
  }

  addStage(id: string, options: { readonly before?: string; readonly after?: string } = {}): this {
    this.assertNotRunning();
    const normalized = normalizeId(id, 'Schedule stage');
    if (this.stages.includes(normalized)) throw new Error(`Schedule stage already exists: ${normalized}`);
    if (options.before && options.after) throw new Error('A schedule stage cannot specify both before and after');

    const target = options.before ?? options.after ?? 'shutdown';
    const targetKind = this.stageKinds.get(target);
    if (!targetKind) throw new Error(`Schedule stage target does not exist: ${target}`);
    const targetIndex = this.stages.indexOf(target);
    if (targetIndex < 0) throw new Error(`Schedule stage target does not exist: ${target}`);
    this.stages.splice(targetIndex + (options.after ? 1 : 0), 0, normalized);
    this.stageKinds.set(normalized, targetKind === 'shutdown' && !options.after ? 'frame' : targetKind);
    this.dirty = true;
    return this;
  }

  addSystem(definition: SystemDefinition): this {
    this.assertNotRunning();
    const id = normalizeId(definition.id, 'System');
    const stage = normalizeId(definition.stage, 'System stage');
    if (!this.stages.includes(stage)) throw new Error(`System ${id} references unknown stage ${stage}`);
    if (this.systems.has(id)) throw new Error(`System already exists: ${id}`);
    this.systems.set(id, {
      definition: { ...definition, id, stage },
      registrationOrder: this.registrationOrder,
    });
    this.registrationOrder += 1;
    this.dirty = true;
    return this;
  }

  removeSystem(id: string): boolean {
    this.assertNotRunning();
    const removed = this.systems.delete(id);
    this.dirty ||= removed;
    return removed;
  }

  orderedSystems(stage: string): readonly SystemDefinition[] {
    this.compile();
    return this.compiled.get(stage) ?? [];
  }

  runStage(stage: string, world: World, time: TimeSnapshot): void {
    this.assertNotRunning();
    if (!this.stages.includes(stage)) throw new Error(`Unknown schedule stage: ${stage}`);
    const systems = this.orderedSystems(stage);
    const commands = new CommandBuffer();
    this.runningStage = stage;
    try {
      world.withStructuralChangesDeferred(() => {
        for (const system of systems) {
          const run = (): void => { system.run({ world, commands, time, stage }); };
          if (this.profiler) this.profiler.measure(system.id, stage, run);
          else run();
        }
      });
      commands.apply(world);
    } catch (error) {
      commands.clear();
      throw error;
    } finally {
      this.runningStage = undefined;
    }
  }

  private compile(): void {
    if (!this.dirty) return;
    const next = new Map<string, readonly SystemDefinition[]>();
    for (const stage of this.stages) {
      const systems = [...this.systems.values()].filter(({ definition }) => definition.stage === stage);
      next.set(stage, orderSystems(stage, systems));
    }
    this.compiled = next;
    this.dirty = false;
  }

  private assertNotRunning(): void {
    if (this.runningStage) throw new Error(`Schedule cannot be changed or re-entered during ${this.runningStage}`);
  }
}

function orderSystems(stage: string, systems: readonly RegisteredSystem[]): readonly SystemDefinition[] {
  const byId = new Map(systems.map((system) => [system.definition.id, system]));
  const outgoing = new Map(systems.map((system) => [system.definition.id, new Set<string>()]));
  const incoming = new Map(systems.map((system) => [system.definition.id, 0]));

  const connect = (from: string, to: string): void => {
    if (!byId.has(from) || !byId.has(to)) {
      const missing = byId.has(from) ? to : from;
      throw new Error(`System ordering in ${stage} references unknown system ${missing}`);
    }
    const targets = outgoing.get(from);
    if (!targets || targets.has(to)) return;
    targets.add(to);
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
  };

  for (const { definition } of systems) {
    for (const target of definition.before ?? []) connect(definition.id, target);
    for (const target of definition.after ?? []) connect(target, definition.id);
  }

  const ready = systems.filter(({ definition }) => incoming.get(definition.id) === 0);
  ready.sort((left, right) => left.registrationOrder - right.registrationOrder);
  const ordered: SystemDefinition[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    ordered.push(current.definition);
    for (const target of outgoing.get(current.definition.id) ?? []) {
      const count = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, count);
      if (count === 0) {
        const system = byId.get(target);
        if (system) {
          ready.push(system);
          ready.sort((left, right) => left.registrationOrder - right.registrationOrder);
        }
      }
    }
  }

  if (ordered.length !== systems.length) throw new Error(`System ordering cycle detected in stage ${stage}`);
  return ordered;
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}
