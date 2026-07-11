import type { InputSnapshot } from './InputState.js';

export type ActionBinding =
  | { readonly kind: 'key'; readonly code: string }
  | { readonly kind: 'gamepad-button'; readonly button: number; readonly gamepad?: number }
  | { readonly kind: 'gamepad-axis'; readonly axis: number; readonly direction: -1 | 1; readonly threshold?: number; readonly gamepad?: number };

export interface ActionDefinition {
  readonly id: string;
  readonly bindings: readonly ActionBinding[];
}

export interface ActionState {
  readonly value: number;
  readonly down: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
}

export type ActionSnapshot = Readonly<Record<string, ActionState>>;

export class ActionMap {
  private readonly definitions: readonly ActionDefinition[];
  private readonly previous = new Map<string, boolean>();

  constructor(definitions: readonly ActionDefinition[]) {
    const ids = new Set<string>();
    this.definitions = Object.freeze(definitions.map((definition) => {
      const id = definition.id.trim();
      if (id.length === 0) throw new Error('Action id cannot be empty');
      if (ids.has(id)) throw new Error(`Duplicate action id: ${id}`);
      if (definition.bindings.length === 0) throw new Error(`Action must have at least one binding: ${id}`);
      ids.add(id);
      return Object.freeze({ id, bindings: Object.freeze([...definition.bindings]) });
    }));
  }

  update(input: InputSnapshot): ActionSnapshot {
    const snapshot: Record<string, ActionState> = {};
    for (const definition of this.definitions) {
      let value = 0;
      for (const binding of definition.bindings) value = Math.max(value, bindingValue(binding, input));
      const down = value > 0;
      const wasDown = this.previous.get(definition.id) ?? false;
      snapshot[definition.id] = Object.freeze({ value, down, pressed: down && !wasDown, released: !down && wasDown });
      this.previous.set(definition.id, down);
    }
    return Object.freeze(snapshot);
  }

  reset(): void {
    this.previous.clear();
  }
}

function bindingValue(binding: ActionBinding, input: InputSnapshot): number {
  if (binding.kind === 'key') return input.isKeyDown(binding.code) ? 1 : 0;
  const gamepads = binding.gamepad === undefined
    ? input.gamepads
    : input.gamepads.filter((gamepad) => gamepad.index === binding.gamepad);
  if (binding.kind === 'gamepad-button') {
    requireIndex(binding.button, 'Gamepad button');
    return gamepads.reduce((value, gamepad) => Math.max(value, gamepad.buttons[binding.button]?.value ?? 0), 0);
  }
  requireIndex(binding.axis, 'Gamepad axis');
  const threshold = binding.threshold ?? 0.2;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold >= 1) throw new Error('Gamepad axis threshold must be between zero and one');
  return gamepads.reduce((value, gamepad) => {
    const directed = (gamepad.axes[binding.axis] ?? 0) * binding.direction;
    const normalized = directed <= threshold ? 0 : Math.min(1, (directed - threshold) / (1 - threshold));
    return Math.max(value, normalized);
  }, 0);
}

function requireIndex(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} index must be non-negative`);
}
