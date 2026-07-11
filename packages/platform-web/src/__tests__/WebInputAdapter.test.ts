import { describe, expect, it } from 'vitest';
import { InputState } from '@hooksjam/gl-game-lab-core';
import { WebInputAdapter, normalizePointerCoordinates } from '../index.js';

describe('normalizePointerCoordinates', () => {
  it('maps browser client coordinates into logical game coordinates', () => {
    expect(normalizePointerCoordinates(110, 70, {
      left: 10,
      top: 20,
      width: 200,
      height: 100,
    }, {
      width: 800,
      height: 400,
    })).toEqual({ x: 400, y: 200 });
  });

  it('rejects zero-sized or invalid browser bounds', () => {
    expect(() => normalizePointerCoordinates(0, 0, {
      left: 0,
      top: 0,
      width: 0,
      height: 20,
    }, { width: 20, height: 20 })).toThrow('bounds');
  });

  it('focuses the canvas and cancels captured pointers and keys on focus loss', () => {
    const input = new InputState();
    const document = new FakeDocument();
    const canvas = new FakeCanvas(document);
    const adapter = new WebInputAdapter(canvas as unknown as HTMLCanvasElement, {
      input,
      document: document as unknown as Document,
      keyboardTarget: canvas as unknown as HTMLElement,
      getViewport: () => ({ width: 200, height: 100 }),
    });
    canvas.dispatch('pointerdown', pointerEvent(3));
    canvas.dispatch('keydown', keyboardEvent('KeyA', 'a'));
    canvas.dispatch('blur', {} as Event);

    const frame = input.advanceFrame();
    expect(canvas.focused).toBe(true);
    expect(frame.pointers).toEqual([]);
    expect(frame.isKeyDown('KeyA')).toBe(false);
    expect(frame.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pointer', phase: 'cancel', id: 3 }),
      expect.objectContaining({ kind: 'key', phase: 'up', code: 'KeyA' }),
    ]));
    adapter.destroy();
    expect(canvas.tabIndex).toBe(-1);
  });
});

class FakeTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener || typeof listener !== 'function') return;
    const entries = this.listeners.get(type) ?? new Set<EventListener>();
    entries.add(listener);
    this.listeners.set(type, entries);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (typeof listener === 'function') this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeDocument extends FakeTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

class FakeCanvas extends FakeTarget {
  tabIndex = -1;
  focused = false;
  private readonly captures = new Set<number>();
  constructor(readonly ownerDocument: FakeDocument) { super(); }
  focus(): void { this.focused = true; }
  setPointerCapture(id: number): void { this.captures.add(id); }
  hasPointerCapture(id: number): boolean { return this.captures.has(id); }
  releasePointerCapture(id: number): void { this.captures.delete(id); }
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 200, height: 100 } as DOMRect;
  }
}

function pointerEvent(id: number): PointerEvent {
  return {
    pointerId: id, clientX: 100, clientY: 50, buttons: 1, pressure: 0.5, isPrimary: true,
    preventDefault: () => undefined,
  } as PointerEvent;
}

function keyboardEvent(code: string, key: string): KeyboardEvent {
  return { code, key, repeat: false, preventDefault: () => undefined } as KeyboardEvent;
}
