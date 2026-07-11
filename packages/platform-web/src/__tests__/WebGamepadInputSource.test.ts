import { describe, expect, it } from 'vitest';
import { InputState } from '@hooksjam/gl-game-lab-core';
import { WebGamepadInputSource } from '../index.js';

describe('WebGamepadInputSource', () => {
  it('polls connected pads and normalizes browser values', () => {
    const input = new InputState();
    const source = new WebGamepadInputSource({
      getGamepads: () => [null, {
        connected: true, index: 1, id: 'Pad', mapping: 'standard', timestamp: 12,
        axes: [1.5, -0.25],
        buttons: [{ pressed: true, touched: true, value: 1.2 }],
      } as unknown as Gamepad],
    });

    source.poll(input);
    expect(input.advanceFrame().gamepads).toEqual([{
      index: 1, id: 'Pad', mapping: 'standard', timestamp: 12,
      axes: [1, -0.25], buttons: [{ pressed: true, touched: true, value: 1 }],
    }]);
    source.reset(input);
    expect(input.advanceFrame().gamepads).toEqual([]);
  });
});
