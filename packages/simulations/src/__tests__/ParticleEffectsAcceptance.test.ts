import { describe, expect, it } from 'vitest';
import {
  createFireworksConfig,
  FIREWORKS_DEFAULTS,
  FIREWORKS_PARTICLE_EFFECT,
  FIREWORKS_PARTICLE_SETTING_BINDINGS,
  SPARKS_PARTICLE_EFFECT,
  SPARKS_PARTICLE_SETTING_BINDINGS,
} from '../index.js';
import { FIREWORKS_EVENT_SHADER, FIREWORKS_STEP_SHADER } from '../fireworks/shaders.js';
import { SPARKS_STEP_SHADER } from '../sparks/shaders.js';

describe('shared particle effect acceptance', () => {
  it('keeps Fireworks free of Sparks-only collision modules and bindings', () => {
    expect(SPARKS_PARTICLE_EFFECT.modules.collisions).toBe(true);
    expect(FIREWORKS_PARTICLE_EFFECT.modules.collisions).not.toBe(true);
    const fireworksKeys = new Set(FIREWORKS_PARTICLE_SETTING_BINDINGS.map((binding) => binding.persistedKey));
    expect(fireworksKeys.has('bounceRestitution')).toBe(false);
    expect(fireworksKeys.has('surfaceFriction')).toBe(false);
    expect(SPARKS_PARTICLE_SETTING_BINDINGS.some((binding) => binding.persistedKey === 'bounceRestitution')).toBe(true);
  });

  it('retains every legacy Fireworks persisted value while applying new defaults', () => {
    const legacy = {
      launchPower: 1_200, launchSpread: 0.22, shellFuse: 1.5, gravity: 420, airDrag: 0.5,
      burstParticles: 1_024, burstChaos: 0.65, explosionPower: 480, secondaryChance: 0.7,
      secondaryDepth: 3, secondaryScale: 0.44, crackleIntensity: 1.1, particleSize: 2.2,
      sparkSizeVariability: 0.7, trailFade: 0.97, bloomStrength: 2.4, autoFinaleRate: 4.2,
      rawParticleTextureSize: '512',
    } as const;
    expect(createFireworksConfig(legacy)).toMatchObject(legacy);
    expect(createFireworksConfig(legacy)).toMatchObject({
      burstPattern: FIREWORKS_DEFAULTS.burstPattern,
      renderStyle: FIREWORKS_DEFAULTS.renderStyle,
      terminalSparkleCount: FIREWORKS_DEFAULTS.terminalSparkleCount,
    });
  });

  it('uses one compact direct-command path and one bounded metadata event path', () => {
    expect(SPARKS_STEP_SHADER).toContain('commandIndex<64');
    expect(FIREWORKS_STEP_SHADER).toContain('commandIndex<64');
    expect(FIREWORKS_EVENT_SHADER).toContain('attempt<32');
    expect(FIREWORKS_STEP_SHADER).not.toContain('uSpawnActive');
    expect(FIREWORKS_EVENT_SHADER).not.toContain('readPixels');
    expect(FIREWORKS_STEP_SHADER).not.toContain('readPixels');
  });
});
