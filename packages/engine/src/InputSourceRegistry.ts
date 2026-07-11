import type { InputState } from '@hooksjam/gl-game-lab-core';

export interface InputSource {
  readonly id: string;
  poll(input: InputState): void;
  reset?(input: InputState): void;
}

export class InputSourceRegistry {
  private readonly sources = new Map<string, InputSource>();
  private polling = false;

  add(source: InputSource): () => void {
    const id = source.id.trim();
    if (id.length === 0) throw new Error('Input source id cannot be empty');
    if (this.sources.has(id)) throw new Error(`Input source is already registered: ${id}`);
    if (this.polling) throw new Error('Input sources cannot be added while polling');
    this.sources.set(id, source);
    return () => {
      if (this.polling) throw new Error('Input sources cannot be removed while polling');
      this.sources.delete(id);
    };
  }

  poll(input: InputState): void {
    if (this.polling) throw new Error('Input source polling is not reentrant');
    this.polling = true;
    try {
      for (const source of this.sources.values()) source.poll(input);
    } finally {
      this.polling = false;
    }
  }

  reset(input: InputState): void {
    const failures: unknown[] = [];
    for (const source of [...this.sources.values()].reverse()) {
      try { source.reset?.(input); } catch (error) { failures.push(error); }
    }
    this.sources.clear();
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Input source reset failed');
  }

  get size(): number { return this.sources.size; }
}
