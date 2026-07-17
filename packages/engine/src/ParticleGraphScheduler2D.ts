import type {
  ParticleCondition2D,
  ParticleCoordinateSpace2D,
  ParticleEffectGraph2D,
  ParticleEmitterGraphNode2D,
  ParticleGraphEvent2D,
  ParticleInheritancePolicy2D,
  ParticleParameterValue2D,
} from './ParticleEffectGraph2D.js';

const EMPTY_CONTEXT: ParticleGraphExecutionContext2D = Object.freeze({});

export interface ParticleGraphExecutionContext2D {
  readonly parameterMap?: Readonly<Record<string, string>>;
  readonly space?: ParticleCoordinateSpace2D;
}

export interface ParticleGraphEffectReference2D {
  readonly effectId: string;
  readonly inherit?: ParticleInheritancePolicy2D;
  readonly parameterMap?: Readonly<Record<string, string>>;
}

export interface ParticleGraphSchedulerCallbacks2D {
  emit(emitterId: string, context: ParticleGraphExecutionContext2D): void;
  stop(emitterId: string | undefined, mode: 'drain' | 'kill'): void;
  signal(signal: string): void;
  reference(reference: ParticleGraphEffectReference2D, context: ParticleGraphExecutionContext2D): void;
  complete?(emitterId: string | undefined): boolean;
}

interface ScheduledNode {
  node: ParticleEmitterGraphNode2D | undefined;
  event: ParticleGraphEvent2D | undefined;
  context: ParticleGraphExecutionContext2D;
  due: number;
  active: boolean;
  continuation: readonly ParticleEmitterGraphNode2D[] | undefined;
  continuationIndex: number;
}

export class ParticleGraphScheduler2D {
  private readonly scheduled: ScheduledNode[];
  private elapsed = 0;
  private randomState: number;
  private dropped = 0;
  private flushing = false;

  constructor(
    private readonly graph: ParticleEffectGraph2D,
    private readonly parameters: () => Readonly<Record<string, ParticleParameterValue2D>>,
    private readonly callbacks: ParticleGraphSchedulerCallbacks2D,
    seed: number,
    capacity = 256,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Particle graph scheduler capacity must be positive');
    this.scheduled = Array.from({ length: capacity }, (): ScheduledNode => ({ node: undefined, event: undefined, context: EMPTY_CONTEXT, due: 0, active: false, continuation: undefined, continuationIndex: 0 }));
    this.randomState = seed >>> 0;
  }

  get droppedActions(): number { return this.dropped; }
  get pendingActions(): number { return this.scheduled.reduce((count, action) => count + Number(action.active), 0); }

  start(): void { this.reset(this.randomState); this.scheduleStart(this.graph.graph.root, 0, EMPTY_CONTEXT); this.flush(); }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Particle graph scheduler delta must be finite and non-negative');
    this.elapsed += deltaSeconds;
    this.flush();
  }

  trigger(event: ParticleGraphEvent2D): void {
    this.visitGates(this.graph.graph.root, event);
    if (!this.flushing) this.flush();
  }

  reset(seed: number): void {
    this.elapsed = 0; this.randomState = seed >>> 0; this.dropped = 0;
    for (const action of this.scheduled) { action.node = undefined; action.event = undefined; action.context = EMPTY_CONTEXT; action.due = 0; action.active = false; action.continuation = undefined; action.continuationIndex = 0; }
  }

  private flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    let progressed = true;
    try {
      while (progressed) {
        progressed = false;
        for (const action of this.scheduled) {
          if (!action.active || action.due > this.elapsed) continue;
          const node = action.node, event = action.event, context = action.context, continuation = action.continuation, continuationIndex = action.continuationIndex;
          action.active = false; action.node = undefined; action.event = undefined; action.context = EMPTY_CONTEXT;
          action.continuation = undefined; action.continuationIndex = 0;
          if (event) this.visitGates(this.graph.graph.root, event);
          else if (node?.kind === 'wait-for-completion') {
            if (this.callbacks.complete?.(node.emitterId) ?? true) {
              if (continuation) this.scheduleSequence(continuation, continuationIndex, action.due, context);
            } else this.enqueueWait(node, this.elapsed + 1 / 240, context, continuation, continuationIndex);
          } else if (node) this.execute(node, action.due, context);
          progressed = true;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private execute(node: ParticleEmitterGraphNode2D, due: number, context: ParticleGraphExecutionContext2D): void {
    if (node.kind === 'emit') { this.callbacks.emit(node.emitterId, context); return; }
    if (node.kind === 'effect-reference') {
      const parameterMap = node.parameterMap ? composeParameterMaps(context.parameterMap, node.parameterMap) : context.parameterMap;
      this.callbacks.reference({ effectId: node.effectId, ...(node.inherit ? { inherit: node.inherit } : {}), ...(parameterMap ? { parameterMap } : {}) }, context);
      return;
    }
    if (node.kind === 'trigger') { this.callbacks.signal(node.signal); return; }
    if (node.kind === 'stop') { this.callbacks.stop(node.emitterId, node.mode ?? 'drain'); return; }
    if (node.kind === 'wait-for-completion' || node.kind === 'gate') return;
    if (node.kind === 'delay') { this.enqueue(node.child, due + node.duration, context); return; }
    if (node.kind === 'sequence') { this.scheduleSequence(node.children, 0, due, context); return; }
    if (node.kind === 'parallel') { node.children.forEach((child) => { this.enqueue(child, due, context); }); return; }
    if (node.kind === 'repeat') {
      const duration = nodeDuration(node.child, this.graph) + (node.interval ?? 0);
      for (let index = 0; index < node.count; index += 1) this.enqueue(node.child, due + duration * index, context);
      return;
    }
    if (node.kind === 'random-choice') { this.enqueue(node.children[Math.floor(this.random() * node.children.length)]!, due, context); return; }
    if (node.kind === 'weighted-choice') { this.enqueue(weightedChoice(node.choices, this.random()), due, context); return; }
    if (node.kind === 'condition') { this.enqueue(evaluateCondition(node.condition, this.parameters(), this.random(), context.parameterMap) ? node.then : node.otherwise, due, context); return; }
    if (node.kind === 'timeline') {
      for (const marker of node.markers) this.enqueueEvent({ kind: 'marker', marker: marker.marker }, due + marker.time);
      this.enqueue(node.child, due, context);
    } else if (node.kind === 'parameter-remap') this.enqueue(node.child, due, { ...context, parameterMap: composeParameterMaps(context.parameterMap, node.map) });
    else if (node.kind === 'transform') this.enqueue(node.child, due, { ...context, space: node.space });
  }

  private scheduleStart(node: ParticleEmitterGraphNode2D, due: number, context: ParticleGraphExecutionContext2D): void {
    if (node.kind === 'gate') { if (node.event.kind === 'effect-start') this.scheduleStart(node.child, due, context); return; }
    if (node.kind === 'delay') { this.scheduleStart(node.child, due + node.duration, context); return; }
    if (node.kind === 'sequence') { this.scheduleStartSequence(node.children, 0, due, context); return; }
    if (node.kind === 'parallel') { node.children.forEach((child) => { this.scheduleStart(child, due, context); }); return; }
    if (node.kind === 'repeat') { const duration = nodeDuration(node.child, this.graph) + (node.interval ?? 0); for (let index = 0; index < node.count; index += 1) this.scheduleStart(node.child, due + duration * index, context); return; }
    if (node.kind === 'random-choice') { this.scheduleStart(node.children[Math.floor(this.random() * node.children.length)]!, due, context); return; }
    if (node.kind === 'weighted-choice') { this.scheduleStart(weightedChoice(node.choices, this.random()), due, context); return; }
    if (node.kind === 'condition') { const child = evaluateCondition(node.condition, this.parameters(), this.random(), context.parameterMap) ? node.then : node.otherwise; if (child) this.scheduleStart(child, due, context); return; }
    if (node.kind === 'timeline') {
      for (const marker of node.markers) this.enqueueEvent({ kind: 'marker', marker: marker.marker }, due + marker.time);
      this.scheduleStart(node.child, due, context);
      return;
    }
    if (node.kind === 'parameter-remap') { this.scheduleStart(node.child, due, { ...context, parameterMap: composeParameterMaps(context.parameterMap, node.map) }); return; }
    if (node.kind === 'transform') { this.scheduleStart(node.child, due, { ...context, space: node.space }); return; }
    this.enqueue(node, due, context);
  }

  private visitGates(node: ParticleEmitterGraphNode2D, event: ParticleGraphEvent2D): void {
    if (node.kind === 'gate') { if (eventsEqual(node.event, event)) this.enqueue(node.child, this.elapsed); return; }
    if (node.kind === 'sequence' || node.kind === 'parallel' || node.kind === 'random-choice') node.children.forEach((child) => { this.visitGates(child, event); });
    else if (node.kind === 'weighted-choice') node.choices.forEach((choice) => { this.visitGates(choice.child, event); });
    else if (node.kind === 'condition') { this.visitGates(node.then, event); if (node.otherwise) this.visitGates(node.otherwise, event); }
    else if (node.kind === 'delay' || node.kind === 'repeat' || node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') this.visitGates(node.child, event);
  }

  private enqueue(node: ParticleEmitterGraphNode2D | undefined, due: number, context: ParticleGraphExecutionContext2D = EMPTY_CONTEXT): void {
    if (!node) return;
    const slot = this.scheduled.find((action) => !action.active);
    if (!slot) { this.dropped += 1; return; }
    slot.node = node; slot.event = undefined; slot.context = context; slot.due = due; slot.active = true;
  }

  private enqueueWait(node: Extract<ParticleEmitterGraphNode2D, { readonly kind: 'wait-for-completion' }>, due: number, context: ParticleGraphExecutionContext2D, continuation?: readonly ParticleEmitterGraphNode2D[], continuationIndex = 0): void {
    const slot = this.scheduled.find((action) => !action.active);
    if (!slot) { this.dropped += 1; return; }
    slot.node = node; slot.event = undefined; slot.context = context; slot.due = due; slot.active = true;
    slot.continuation = continuation; slot.continuationIndex = continuationIndex;
  }

  private scheduleSequence(children: readonly ParticleEmitterGraphNode2D[], startIndex: number, due: number, context: ParticleGraphExecutionContext2D): void {
    let cursor = due;
    for (let index = startIndex; index < children.length; index += 1) {
      const child = children[index]!;
      if (child.kind === 'wait-for-completion') { this.enqueueWait(child, cursor, context, children, index + 1); return; }
      this.enqueue(child, cursor, context);
      cursor += nodeDuration(child, this.graph);
    }
  }

  private scheduleStartSequence(children: readonly ParticleEmitterGraphNode2D[], startIndex: number, due: number, context: ParticleGraphExecutionContext2D): void {
    let cursor = due;
    for (let index = startIndex; index < children.length; index += 1) {
      const child = children[index]!;
      if (child.kind === 'wait-for-completion') { this.enqueueWait(child, cursor, context, children, index + 1); return; }
      this.scheduleStart(child, cursor, context);
      cursor += nodeDuration(child, this.graph);
    }
  }

  private enqueueEvent(event: ParticleGraphEvent2D, due: number): void {
    const slot = this.scheduled.find((action) => !action.active);
    if (!slot) { this.dropped += 1; return; }
    slot.node = undefined; slot.event = event; slot.context = EMPTY_CONTEXT; slot.due = due; slot.active = true;
  }

  private random(): number {
    let value = this.randomState += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 0x1_0000_0000;
  }
}

function nodeDuration(node: ParticleEmitterGraphNode2D, graph: ParticleEffectGraph2D): number {
  if (node.kind === 'emit') { const timeline = graph.emitters.find((emitter) => emitter.id === node.emitterId)?.timeline; return (timeline?.startDelay ?? 0) + (timeline?.duration ?? 0); }
  if (node.kind === 'delay') return node.duration + nodeDuration(node.child, graph);
  if (node.kind === 'sequence') return node.children.reduce((sum, child) => sum + nodeDuration(child, graph), 0);
  if (node.kind === 'parallel' || node.kind === 'random-choice') return Math.max(0, ...node.children.map((child) => nodeDuration(child, graph)));
  if (node.kind === 'weighted-choice') return Math.max(0, ...node.choices.map((choice) => nodeDuration(choice.child, graph)));
  if (node.kind === 'repeat') return node.count * (nodeDuration(node.child, graph) + (node.interval ?? 0));
  if (node.kind === 'condition') return Math.max(nodeDuration(node.then, graph), node.otherwise ? nodeDuration(node.otherwise, graph) : 0);
  if (node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') return nodeDuration(node.child, graph);
  if (node.kind === 'wait-for-completion') return estimatedCompletionDuration(node.emitterId, graph);
  return 0;
}

function estimatedCompletionDuration(emitterId: string | undefined, graph: ParticleEffectGraph2D): number {
  let duration = 0;
  for (const emitter of graph.emitters) {
    if (emitterId !== undefined && emitter.id !== emitterId) continue;
    const archetype = graph.archetypes.find((entry) => entry.id === emitter.archetypeId);
    duration = Math.max(duration, (emitter.timeline.startDelay ?? 0) + (emitter.timeline.duration ?? 0) + (archetype?.lifecycle.lifetime ?? 0) * (1 + (archetype?.lifecycle.lifetimeVariability ?? 0)));
  }
  return duration;
}

function evaluateCondition(condition: ParticleCondition2D, parameters: Readonly<Record<string, ParticleParameterValue2D>>, random: number, parameterMap?: Readonly<Record<string, string>>): boolean {
  if (condition.kind === 'chance') return random < condition.probability;
  const left = parameters[parameterMap?.[condition.parameterId] ?? condition.parameterId], right = condition.value;
  if (condition.operator === 'eq') return left === right;
  if (condition.operator === 'neq') return left !== right;
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (condition.operator === 'lt') return left < right;
  if (condition.operator === 'lte') return left <= right;
  if (condition.operator === 'gt') return left > right;
  return left >= right;
}

function composeParameterMaps(parent: Readonly<Record<string, string>> | undefined, child: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  if (!parent) return child;
  const result: Record<string, string> = { ...parent };
  for (const [target, source] of Object.entries(child)) result[target] = parent[source] ?? source;
  return Object.freeze(result);
}

function weightedChoice(choices: readonly { readonly weight: number; readonly child: ParticleEmitterGraphNode2D }[], random: number): ParticleEmitterGraphNode2D {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0); let cursor = random * total;
  for (const choice of choices) { cursor -= choice.weight; if (cursor <= 0) return choice.child; }
  return choices[choices.length - 1]!.child;
}

function eventsEqual(left: ParticleGraphEvent2D, right: ParticleGraphEvent2D): boolean {
  if (left.kind !== right.kind) return false;
  if ('signal' in left && 'signal' in right) return left.signal === right.signal;
  if ('marker' in left && 'marker' in right) return left.marker === right.marker;
  if ('emitterId' in left && 'emitterId' in right) return left.emitterId === right.emitterId;
  if ('archetypeId' in left && 'archetypeId' in right) return left.archetypeId === right.archetypeId && (!('age' in left) || !('age' in right) || left.age === right.age);
  return true;
}
