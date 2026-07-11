import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import { CHAIN_RAIN_DEFAULTS, CHAIN_RAIN_STYLE_MANIFEST, chainRainDefinition, createChainRainConfig } from '../index.js';
describe('Chain Rain', () => {
  it('registers the maintained modes and ten styles', () => {
    const definition = new ExperienceRegistry().register(chainRainDefinition).get('chain-rain');
    expect(definition.modes?.map(mode => mode.id)).toEqual([
      'draw',
      'build',
      'interact'
    ]);
    expect(CHAIN_RAIN_STYLE_MANIFEST.styles).toHaveLength(10);
  });
  it('preserves maintained settings and validates values', () => {
    expect(createChainRainConfig()).toEqual(CHAIN_RAIN_DEFAULTS);
    expect(() => createChainRainConfig({
      chainLength: 2
    })).toThrow('outside its supported range');
  });
  it('uses reusable dense constraints for snake links', () => {
    const world = new ConstrainedCircleParticleWorld2D(16, 16, {
      gravity: 0
    });
    world.setBounds(600, 400);
    let previous = -1;
    for (let i = 0; i < 8; i += 1) {
      const node = world.addCircle(100 + i * 10, 50);
      if (previous >= 0)
        world.addDistanceConstraint(previous, node);
      previous = node;
    }
    expect(world.count).toBe(8);
    expect(world.constraintCount).toBe(7);
  });
});
