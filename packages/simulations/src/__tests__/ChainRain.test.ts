import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import { CHAIN_RAIN_DEFAULTS, CHAIN_RAIN_STYLE_MANIFEST, chainRainDefinition, createChainRainConfig } from '../index.js';
import { packChainSkin } from '../chain-rain/ChainRainPlugin.js';
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
  it('packs the enhanced renderer as a smooth capped skin with source palette indexing', () => {
    const world = new ConstrainedCircleParticleWorld2D(8, 8, { gravity: 0 });
    world.setBounds(200, 100);
    const indices = [
      world.addCircle(40, 50, { radius: 5 }),
      world.addCircle(80, 35, { radius: 7 }),
      world.addCircle(120, 50, { radius: 6 })
    ];
    const skin = packChainSkin([{ indices, fixture: false, seed: 1 }], world, 1.08);
    expect(skin.vertexCount).toBe(180);
    expect(skin.positions).toHaveLength(360);
    expect([...skin.colorSeeds]).toEqual(new Array(180).fill(0));
    expect(Math.max(...skin.positions.filter((_, index) => index % 2 === 1))).toBeGreaterThan(56);
  });
});
