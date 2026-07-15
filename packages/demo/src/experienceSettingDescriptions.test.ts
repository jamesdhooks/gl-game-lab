import { describe, expect, it } from 'vitest';
import { GAME_REGISTRY } from '@hooksjam/gl-game-lab-games';
import { SIMULATION_REGISTRY } from '@hooksjam/gl-game-lab-simulations';

describe('experience setting documentation', () => {
  it('provides a useful tooltip description for every registered setting', () => {
    const undocumented: string[] = [];
    const definitions = [...GAME_REGISTRY.values(), ...SIMULATION_REGISTRY.values()];
    for (const definition of definitions) {
      for (const setting of definition.settings ?? []) {
        const description = setting.description?.trim() ?? '';
        if (description.length < 20) undocumented.push(`${definition.id}.${setting.key}`);
      }
    }

    expect(undocumented).toEqual([]);
    expect(definitions.reduce((count, definition) => count + (definition.settings?.length ?? 0), 0)).toBeGreaterThan(350);
  });
});
