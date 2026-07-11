import type { VascularTreeConfig } from './config.js';
export interface VascularNode {
  readonly x: number;
  readonly y: number;
  readonly parent: number;
  energy: number;
  thickness: number;
  age: number;
  active: boolean;
}
export interface PackedVascularSegments {
  readonly count: number;
  readonly segments: Float32Array;
  readonly styles: Float32Array;
}
export class VascularGrowthModel {
  readonly nodes: VascularNode[] = [];
  private active: number[] = [];
  private guide = {
    x: 0,
    y: 0
  };
  private accumulator = 0;
  private randomState: number;
  constructor(seed = 260617) {
    this.randomState = normalizeSeed(seed);
  }
  reset(width: number, height: number): void {
    this.nodes.length = 0;
    this.active.length = 0;
    this.guide = {
      x: width * 0.5,
      y: height * 0.18
    };
    const root = this.add(width * 0.5, height * 0.92, -1, 1, 7, true);
    this.add(width * 0.45, height * 0.82, root, 1, 6, true);
    this.add(width * 0.55, height * 0.82, root, 1, 6, true);
    this.accumulator = 0;
  }
  update(dt: number, width: number, height: number, config: VascularTreeConfig): void {
    for (const node of this.nodes) {
      node.age += dt;
      node.energy = Math.max(0.04, node.energy - dt * config.pruneRate * 0.012);
      node.thickness = Math.max(0.8, node.thickness - dt * config.pruneRate * 0.002);
    }
    this.accumulator += dt * config.growthRate * 22;
    while (this.accumulator >= 1 && this.nodes.length < config.branchBudget) {
      this.grow(width, height, config);
      this.accumulator -= 1;
    }
  }
  guideTo(x: number, y: number, force = false): void {
    this.guide = {
      x,
      y
    };
    if (force)
      this.grow(Math.max(x * 2, 640), Math.max(y * 2, 480), {
        timeScale: 1,
        resolution: 128,
        branchBudget: 1024,
        growthRate: 1,
        nutrientFlow: 1,
        pruneRate: 0.22
      });
  }
  feed(x: number, y: number, radius: number, amount: number): void {
    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];
      if (!node)
        continue;
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance > radius)
        continue;
      const falloff = 1 - distance / radius;
      node.energy = Math.min(1.8, node.energy + amount * falloff);
      node.thickness = Math.min(12, node.thickness + amount * falloff * 0.18);
      if (amount > 0 && !node.active) {
        node.active = true;
        this.active.push(index);
      }
    }
  }
  prune(x: number, y: number, radius: number, amount: number): void {
    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index];
      if (!node || Math.hypot(node.x - x, node.y - y) > radius)
        continue;
      node.energy = Math.max(0, node.energy - amount);
      if (node.energy < 0.16)
        node.active = false;
    }
    this.active = this.active.filter(index => this.nodes[index]?.active === true);
  }
  pack(time: number, nutrientFlow: number): PackedVascularSegments {
    const count = Math.max(0, this.nodes.length - 1), segments = new Float32Array(count * 4), styles = new Float32Array(count * 2);
    let cursor = 0;
    for (const node of this.nodes) {
      if (node.parent < 0)
        continue;
      const parent = this.nodes[node.parent];
      if (!parent)
        continue;
      segments.set([
        parent.x,
        parent.y,
        node.x,
        node.y
      ], cursor * 4);
      const pulse = 0.72 + 0.28 * Math.sin(time * nutrientFlow * 3 - node.age * 1.7 + cursor * 0.13);
      styles.set([
        Math.max(1, node.thickness * (0.72 + node.energy * 0.25)),
        Math.max(0.12, node.energy * pulse)
      ], cursor * 2);
      cursor++;
    }
    return {
      count: cursor,
      segments,
      styles
    };
  }
  private grow(width: number, height: number, config: VascularTreeConfig): void {
    if (this.active.length === 0)
      return;
    let parentIndex = this.active[Math.floor(this.next() * this.active.length)] ?? 0, best = -Infinity;
    for (let sample = 0; sample < Math.min(10, this.active.length); sample++) {
      const candidateIndex = this.active[Math.floor(this.next() * this.active.length)] ?? parentIndex, candidate = this.nodes[candidateIndex];
      if (!candidate)
        continue;
      const distance = Math.hypot(candidate.x - this.guide.x, candidate.y - this.guide.y) / Math.max(width, height, 1), score = candidate.energy * 1.25 + (1 - distance) * 0.55 + this.next() * 0.28;
      if (score > best) {
        best = score;
        parentIndex = candidateIndex;
      }
    }
    const parent = this.nodes[parentIndex];
    if (!parent)
      return;
    const toward = Math.atan2(this.guide.y - parent.y, this.guide.x - parent.x);
    const up = -Math.PI / 2 + (this.next() - 0.5) * 1.1;
    const angle = toward * 0.62 + up * 0.38 + (this.next() - 0.5) * 0.72;
    const length = 12 + this.next() * 28;
    const x = clamp(parent.x + Math.cos(angle) * length, 6, width - 6);
    const y = clamp(parent.y + Math.sin(angle) * length, 6, height - 6);
    const thickness = Math.max(1.1, parent.thickness * (0.78 + this.next() * 0.14));
    const childEnergy = Math.max(0.12, parent.energy * (0.72 + this.next() * 0.2));
    const child = this.add(x, y, parentIndex, childEnergy, thickness, true);
    parent.energy *= 0.76;
    parent.thickness = Math.max(parent.thickness, thickness + 0.22);
    if (this.next() > 0.38)
      parent.active = false;
    this.active = this.active.filter(index => this.nodes[index]?.active === true);
    if (this.nodes[child]?.active)
      this.active.push(child);
    void config;
  }
  private add(x: number, y: number, parent: number, energy: number, thickness: number, active: boolean): number {
    const index = this.nodes.length;
    this.nodes.push({
      x,
      y,
      parent,
      energy,
      thickness,
      age: 0,
      active
    });
    if (active && parent < 0)
      this.active.push(index);
    return index;
  }
  private next() {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 4294967296;
  }
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function normalizeSeed(seed: number) {
  if (!Number.isSafeInteger(seed))
    throw new Error('Vascular seed must be a safe integer');
  return (seed >>> 0) || 260617;
}
