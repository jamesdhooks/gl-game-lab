import { describe, expect, it } from 'vitest';
import { InputState } from '../index.js';

describe('InputState', () => {
  it('creates immutable frame snapshots from pointer, keyboard, and wheel input', () => {
    const input = new InputState();
    input.ingest({ kind: 'pointer', phase: 'down', id: 4, x: 12, y: 24, buttons: 1, pressure: 0.5, primary: true });
    input.ingest({ kind: 'key', phase: 'down', code: 'KeyW', key: 'w' });
    input.ingest({ kind: 'wheel', deltaX: 1, deltaY: -2 });

    const frame = input.advanceFrame();

    expect(frame.pointers).toEqual([{ id: 4, x: 12, y: 24, buttons: 1, pressure: 0.5, primary: true }]);
    expect(frame.isKeyDown('KeyW')).toBe(true);
    expect(frame.isKeyPressed('KeyW')).toBe(true);
    expect(frame.wheelDeltaY).toBe(-2);
    expect(frame.events).toHaveLength(3);
    expect(input.advanceFrame().isKeyPressed('KeyW')).toBe(false);
    expect(input.snapshot.isKeyDown('KeyW')).toBe(true);
  });

  it('updates persistent state while reporting releases and pointer cancellation', () => {
    const input = new InputState();
    input.ingest({ kind: 'pointer', phase: 'down', id: 1, x: 0, y: 0, buttons: 1 });
    input.ingest({ kind: 'key', phase: 'down', code: 'Space', key: ' ' });
    input.advanceFrame();
    input.ingest({ kind: 'pointer', phase: 'cancel', id: 1, x: 2, y: 3, buttons: 0 });
    input.ingest({ kind: 'key', phase: 'up', code: 'Space', key: ' ' });

    const frame = input.advanceFrame();

    expect(frame.pointers).toEqual([]);
    expect(frame.isKeyDown('Space')).toBe(false);
    expect(frame.isKeyReleased('Space')).toBe(true);
  });

  it('rejects invalid native event data before it reaches systems', () => {
    const input = new InputState();
    expect(() => input.ingest({ kind: 'pointer', phase: 'move', id: 1, x: Number.NaN, y: 0, buttons: 0 })).toThrow('finite');
    expect(() => input.ingest({ kind: 'key', phase: 'down', code: '', key: '' })).toThrow('cannot be empty');
  });
});
