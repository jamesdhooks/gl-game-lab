import type {
  ParticleCondition2D,
  ParticleEffectGraph2D,
  ParticleEmitterGraphNode2D,
  ParticleGraphEvent2D,
  ParticleParameterValue2D,
} from './ParticleEffectGraph2D.js';

export interface ParticleGraphSchedulerCallbacks2D {
  emit(emitterId: string): void;
  stop(emitterId: string | undefined, mode: 'drain' | 'kill'): void;
  signal(signal: string): void;
  reference(effectId: string): void;
}

interface ScheduledNode {
  node: ParticleEmitterGraphNode2D | undefined;
  due: number;
  active: boolean;
}

export class ParticleGraphScheduler2D {
  private readonly scheduled: ScheduledNode[];
  private elapsed = 0;
  private randomState: number;
  private dropped = 0;

  constructor(
    private readonly graph: ParticleEffectGraph2D,
    private readonly parameters: () => Readonly<Record<string, ParticleParameterValue2D>>,
    private readonly callbacks: ParticleGraphSchedulerCallbacks2D,
    seed: number,
    capacity = 256,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Particle graph scheduler capacity must be positive');
    this.scheduled = Array.from({ length: capacity }, (): ScheduledNode => ({ node: undefined, due: 0, active: false }));
    this.randomState = seed >>> 0;
  }

  get droppedActions(): number { return this.dropped; }
  get pendingActions(): number { return this.scheduled.reduce((count, action) => count + Number(action.active), 0); }

  start(): void { this.reset(this.randomState); this.scheduleStart(this.graph.graph.root, 0); this.flush(); }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Particle graph scheduler delta must be finite and non-negative');
    this.elapsed += deltaSeconds;
    this.flush();
  }

  trigger(event: ParticleGraphEvent2D): void {
    this.visitGates(this.graph.graph.root, event);
    this.flush();
  }

  reset(seed: number): void {
    this.elapsed = 0; this.randomState = seed >>> 0; this.dropped = 0;
    for (const action of this.scheduled) { action.node = undefined; action.due = 0; action.active = false; }
  }

  private flush(): void {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const action of this.scheduled) {
        if (!action.active || action.due > this.elapsed || !action.node) continue;
        const node = action.node; action.active = false; action.node = undefined;
        this.execute(node, action.due); progressed = true;
      }
    }
  }

  private execute(node: ParticleEmitterGraphNode2D, due: number): void {
    if (node.kind === 'emit') { this.callbacks.emit(node.emitterId); return; }
    if (node.kind === 'effect-reference') { this.callbacks.reference(node.effectId); return; }
    if (node.kind === 'trigger') { this.callbacks.signal(node.signal); return; }
    if (node.kind === 'stop') { this.callbacks.stop(node.emitterId, node.mode ?? 'drain'); return; }
    if (node.kind === 'wait-for-completion' || node.kind === 'gate') return;
    if (node.kind === 'delay') { this.enqueue(node.child, due + node.duration); return; }
    if (node.kind === 'sequence') {
      let cursor = due;
      for (const child of node.children) { this.enqueue(child, cursor); cursor += nodeDuration(child, this.graph); }
      return;
    }
    if (node.kind === 'parallel') { node.children.forEach((child) => { this.enqueue(child, due); }); return; }
    if (node.kind === 'repeat') {
      const duration = nodeDuration(node.child, this.graph) + (node.interval ?? 0);
      for (let index = 0; index < node.count; index += 1) this.enqueue(node.child, due + duration * index);
      return;
    }
    if (node.kind === 'random-choice') { this.enqueue(node.children[Math.floor(this.random() * node.children.length)]!, due); return; }
    if (node.kind === 'weighted-choice') { this.enqueue(weightedChoice(node.choices, this.random()), due); return; }
    if (node.kind === 'condition') { this.enqueue(evaluateCondition(node.condition, this.parameters(), this.random()) ? node.then : node.otherwise, due); return; }
    if (node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') this.enqueue(node.child, due);
  }

  private scheduleStart(node: ParticleEmitterGraphNode2D, due: number): void {
    if (node.kind === 'gate') { if (node.event.kind === 'effect-start') this.scheduleStart(node.child, due); return; }
    if (node.kind === 'delay') { this.scheduleStart(node.child, due + node.duration); return; }
    if (node.kind === 'sequence') { let cursor = due; for (const child of node.children) { this.scheduleStart(child, cursor); cursor += nodeDuration(child, this.graph); } return; }
    if (node.kind === 'parallel') { node.children.forEach((child) => { this.scheduleStart(child, due); }); return; }
    if (node.kind === 'repeat') { const duration = nodeDuration(node.child, this.graph) + (node.interval ?? 0); for (let index = 0; index < node.count; index += 1) this.scheduleStart(node.child, due + duration * index); return; }
    if (node.kind === 'random-choice') { this.scheduleStart(node.children[Math.floor(this.random() * node.children.length)]!, due); return; }
    if (node.kind === 'weighted-choice') { this.scheduleStart(weightedChoice(node.choices, this.random()), due); return; }
    if (node.kind === 'condition') { const child = evaluateCondition(node.condition, this.parameters(), this.random()) ? node.then : node.otherwise; if (child) this.scheduleStart(child, due); return; }
    if (node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') { this.scheduleStart(node.child, due); return; }
    this.enqueue(node, due);
  }

  private visitGates(node: ParticleEmitterGraphNode2D, event: ParticleGraphEvent2D): void {
    if (node.kind === 'gate') { if (eventsEqual(node.event, event)) this.enqueue(node.child, this.elapsed); return; }
    if (node.kind === 'sequence' || node.kind === 'parallel' || node.kind === 'random-choice') node.children.forEach((child) => { this.visitGates(child, event); });
    else if (node.kind === 'weighted-choice') node.choices.forEach((choice) => { this.visitGates(choice.child, event); });
    else if (node.kind === 'condition') { this.visitGates(node.then, event); if (node.otherwise) this.visitGates(node.otherwise, event); }
    else if (node.kind === 'delay' || node.kind === 'repeat' || node.kind === 'timeline' || node.kind === 'parameter-remap' || node.kind === 'transform') this.visitGates(node.child, event);
  }

  private enqueue(node: ParticleEmitterGraphNode2D | undefined, due: number): void {
    if (!node) return;
    const slot = this.scheduled.find((action) => !action.active);
    if (!slot) { this.dropped += 1; return; }
    slot.node = node; slot.due = due; slot.active = true;
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
  return 0;
}

function evaluateCondition(condition: ParticleCondition2D, parameters: Readonly<Record<string, ParticleParameterValue2D>>, random: number): boolean {
  if (condition.kind === 'chance') return random < condition.probability;
  const left = parameters[condition.parameterId], right = condition.value;
  if (condition.operator === 'eq') return left === right;
  if (condition.operator === 'neq') return left !== right;
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (condition.operator === 'lt') return left < right;
  if (condition.operator === 'lte') return left <= right;
  if (condition.operator === 'gt') return left > right;
  return left >= right;
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
