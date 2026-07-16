import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createFireworksConfig, FIREWORKS_DEFAULTS, FIREWORKS_STYLE_MANIFEST, fireworksDefinition } from '../index.js';
import { FIREWORKS_POINT_FRAGMENT_SHADER, FIREWORKS_POINT_VERTEX_SHADER, FIREWORKS_STEP_SHADER } from '../fireworks/shaders.js';

describe('Fireworks', () => {
  it('registers its modes, tutorial, and maintained styles', () => {
    const registry = new ExperienceRegistry().register(fireworksDefinition);
    expect(registry.get('fireworks').modes?.map((mode) => mode.id)).toEqual(['single', 'stream']);
    expect(fireworksDefinition.tutorialPages).toHaveLength(4);
    expect(FIREWORKS_STYLE_MANIFEST.styles).toHaveLength(10);
  });

  it('preserves the GPU simulation defaults and ranges', () => {
    expect(createFireworksConfig()).toEqual(FIREWORKS_DEFAULTS);
    expect(createFireworksConfig({ rawParticleTextureSize: '512', burstParticles: 1024 })).toMatchObject({ rawParticleTextureSize: '512', burstParticles: 1024 });
    expect(() => createFireworksConfig({ shellFuse: 10 })).toThrow('outside its supported range');
  });

  it('characterizes the legacy radial-only burst and static palette renderer', () => {
    expect(FIREWORKS_STEP_SHADER).toContain('float angle = hash(seed) * 6.2831853');
    expect(FIREWORKS_STEP_SHADER).toContain('uSpawnKind > 1.5 ? burst : vec2(0.0)');
    expect(FIREWORKS_POINT_FRAGMENT_SHADER).toContain('vec3 color = uPalette[index]');
    expect(FIREWORKS_POINT_VERTEX_SHADER).not.toContain('uParticleLength');
  });

  it('documents controls that need behavioral migration', () => {
    const settingKeys = new Set((fireworksDefinition.settings ?? []).map((setting) => setting.key));
    expect(settingKeys).toEqual(new Set([
      'launchPower', 'launchSpread', 'shellFuse', 'gravity', 'airDrag',
      'burstParticles', 'burstChaos', 'explosionPower', 'secondaryChance', 'secondaryDepth',
      'secondaryScale', 'crackleIntensity', 'particleSize', 'sparkSizeVariability',
      'trailFade', 'bloomStrength', 'autoFinaleRate', 'rawParticleTextureSize',
    ]));
    expect(FIREWORKS_STEP_SHADER).toContain('uniform float uSpawnPower');
    expect(FIREWORKS_STEP_SHADER).toContain('uSpawnPower * radial * asymmetry');
    expect(FIREWORKS_POINT_FRAGMENT_SHADER).toContain('uniform float uCrackle');
    expect(FIREWORKS_POINT_FRAGMENT_SHADER).toContain('max(0.25, uCrackle)');
  });
});
