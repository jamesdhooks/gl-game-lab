import type { GamepadSnapshot, InputState } from '@hooksjam/gl-game-lab-core';
import type { InputSource } from '@hooksjam/gl-game-lab-engine';

export interface GamepadProvider {
  getGamepads(): ArrayLike<Gamepad | null>;
}

export class WebGamepadInputSource implements InputSource {
  readonly id = 'gl-game-lab.platform-web.gamepads';

  constructor(private readonly provider: GamepadProvider = requireNavigator()) {}

  poll(input: InputState): void {
    const snapshots: GamepadSnapshot[] = [];
    const gamepads = this.provider.getGamepads();
    for (let index = 0; index < gamepads.length; index += 1) {
      const gamepad = gamepads[index];
      if (!gamepad?.connected) continue;
      snapshots.push(Object.freeze({
        index: gamepad.index,
        id: gamepad.id || `Gamepad ${gamepad.index}`,
        mapping: gamepad.mapping,
        timestamp: Math.max(0, gamepad.timestamp),
        axes: Object.freeze([...gamepad.axes].map((axis) => Math.max(-1, Math.min(1, axis)))),
        buttons: Object.freeze([...gamepad.buttons].map((button) => Object.freeze({
          pressed: button.pressed,
          touched: button.touched,
          value: Math.max(0, Math.min(1, button.value)),
        }))),
      }));
    }
    input.setGamepads(snapshots);
  }

  reset(input: InputState): void {
    input.setGamepads([]);
  }
}

function requireNavigator(): Navigator {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    throw new Error('Gamepad API is unavailable');
  }
  return navigator;
}
