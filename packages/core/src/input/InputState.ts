export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface PointerInputEvent {
  readonly kind: 'pointer';
  readonly phase: PointerPhase;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
  readonly pressure?: number;
  readonly primary?: boolean;
}

export interface KeyInputEvent {
  readonly kind: 'key';
  readonly phase: 'down' | 'up';
  readonly code: string;
  readonly key: string;
  readonly repeat?: boolean;
}

export interface WheelInputEvent {
  readonly kind: 'wheel';
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ?: number;
}

export type InputEvent = PointerInputEvent | KeyInputEvent | WheelInputEvent;

export interface PointerSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
  readonly pressure: number;
  readonly primary: boolean;
}

export interface InputSnapshot {
  readonly events: readonly InputEvent[];
  readonly pointers: readonly PointerSnapshot[];
  readonly keysDown: readonly string[];
  readonly keysPressed: readonly string[];
  readonly keysReleased: readonly string[];
  readonly wheelDeltaX: number;
  readonly wheelDeltaY: number;
  readonly wheelDeltaZ: number;
  isKeyDown(code: string): boolean;
  isKeyPressed(code: string): boolean;
  isKeyReleased(code: string): boolean;
}

export class InputState {
  private readonly pointers = new Map<number, PointerSnapshot>();
  private readonly keysDown = new Set<string>();
  private readonly pendingEvents: InputEvent[] = [];
  private readonly pendingPressed = new Set<string>();
  private readonly pendingReleased = new Set<string>();
  private wheelDeltaX = 0;
  private wheelDeltaY = 0;
  private wheelDeltaZ = 0;
  private currentSnapshot: InputSnapshot = createSnapshot([], [], [], [], [], 0, 0, 0);

  get snapshot(): InputSnapshot {
    return this.currentSnapshot;
  }

  ingest(event: InputEvent): void {
    validateEvent(event);
    if (event.kind === 'pointer') {
      if (event.phase === 'up' || event.phase === 'cancel') {
        this.pointers.delete(event.id);
      } else {
        this.pointers.set(event.id, Object.freeze({
          id: event.id,
          x: event.x,
          y: event.y,
          buttons: event.buttons,
          pressure: event.pressure ?? 0,
          primary: event.primary ?? false,
        }));
      }
    } else if (event.kind === 'key') {
      if (event.phase === 'down') {
        if (!this.keysDown.has(event.code) && event.repeat !== true) this.pendingPressed.add(event.code);
        this.keysDown.add(event.code);
      } else {
        if (this.keysDown.delete(event.code)) this.pendingReleased.add(event.code);
      }
    } else {
      this.wheelDeltaX += event.deltaX;
      this.wheelDeltaY += event.deltaY;
      this.wheelDeltaZ += event.deltaZ ?? 0;
    }
    this.pendingEvents.push(Object.freeze({ ...event }));
  }

  advanceFrame(): InputSnapshot {
    this.currentSnapshot = createSnapshot(
      this.pendingEvents,
      [...this.pointers.values()],
      [...this.keysDown],
      [...this.pendingPressed],
      [...this.pendingReleased],
      this.wheelDeltaX,
      this.wheelDeltaY,
      this.wheelDeltaZ,
    );
    this.pendingEvents.length = 0;
    this.pendingPressed.clear();
    this.pendingReleased.clear();
    this.wheelDeltaX = 0;
    this.wheelDeltaY = 0;
    this.wheelDeltaZ = 0;
    return this.currentSnapshot;
  }

  reset(): void {
    this.pointers.clear();
    this.keysDown.clear();
    this.pendingEvents.length = 0;
    this.pendingPressed.clear();
    this.pendingReleased.clear();
    this.wheelDeltaX = 0;
    this.wheelDeltaY = 0;
    this.wheelDeltaZ = 0;
    this.currentSnapshot = createSnapshot([], [], [], [], [], 0, 0, 0);
  }
}

function createSnapshot(
  events: readonly InputEvent[],
  pointers: readonly PointerSnapshot[],
  keysDown: readonly string[],
  keysPressed: readonly string[],
  keysReleased: readonly string[],
  wheelDeltaX: number,
  wheelDeltaY: number,
  wheelDeltaZ: number,
): InputSnapshot {
  const down = new Set(keysDown);
  const pressed = new Set(keysPressed);
  const released = new Set(keysReleased);
  return Object.freeze({
    events: Object.freeze([...events]),
    pointers: Object.freeze([...pointers]),
    keysDown: Object.freeze([...down].sort()),
    keysPressed: Object.freeze([...pressed].sort()),
    keysReleased: Object.freeze([...released].sort()),
    wheelDeltaX,
    wheelDeltaY,
    wheelDeltaZ,
    isKeyDown: (code: string) => down.has(code),
    isKeyPressed: (code: string) => pressed.has(code),
    isKeyReleased: (code: string) => released.has(code),
  });
}

function validateEvent(event: InputEvent): void {
  if (event.kind === 'pointer') {
    if (!Number.isSafeInteger(event.id)) throw new Error('Pointer id must be a safe integer');
    for (const value of [event.x, event.y, event.buttons, event.pressure ?? 0]) {
      if (!Number.isFinite(value)) throw new Error('Pointer event values must be finite');
    }
  } else if (event.kind === 'key') {
    if (event.code.trim().length === 0) throw new Error('Key event code cannot be empty');
  } else {
    for (const value of [event.deltaX, event.deltaY, event.deltaZ ?? 0]) {
      if (!Number.isFinite(value)) throw new Error('Wheel event values must be finite');
    }
  }
}
