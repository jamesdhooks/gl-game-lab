import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createFireworksConfig, FIREWORKS_DEFAULTS, FIREWORKS_PARTICLE_EFFECT, FIREWORKS_PARTICLE_SETTING_BINDINGS, FIREWORKS_STYLE_MANIFEST, fireworksDefinition, fireworksPatternCode, resolveFireworkLaunchVelocity } from '../index.js';
import { FIREWORKS_EVENT_SHADER, FIREWORKS_POINT_FRAGMENT_SHADER, FIREWORKS_POINT_VERTEX_SHADER, FIREWORKS_STEP_SHADER, FIREWORKS_STREAK_VERTEX_SHADER } from '../fireworks/shaders.js';

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

  it('implements batched patterns, metadata events, and color-over-life rendering', () => {
    expect(FIREWORKS_STEP_SHADER).toContain('uParticleCommandData');
    expect(FIREWORKS_STEP_SHADER).toContain('burstVelocity');
    expect(FIREWORKS_STEP_SHADER).toContain('layout(location=2) out vec4 outMetadata');
    expect(FIREWORKS_EVENT_SHADER).toContain('uSecondaryCount');
    expect(FIREWORKS_EVENT_SHADER).toContain('uSparkleCount');
    expect(FIREWORKS_POINT_FRAGMENT_SHADER).toContain('uPaletteTransition');
    expect(FIREWORKS_POINT_VERTEX_SHADER).toContain('uMetadataState');
    expect(FIREWORKS_STREAK_VERTEX_SHADER).toContain('uParticleLength');
  });

  it('exposes contextual primary, secondary, sparkle, color, and render controls', () => {
    const settingKeys = new Set((fireworksDefinition.settings ?? []).map((setting) => setting.key));
    for (const key of [
      'launchPower', 'launchSpread', 'shellFuse', 'gravity', 'airDrag',
      'burstParticles', 'burstChaos', 'explosionPower', 'secondaryChance', 'secondaryDepth',
      'secondaryScale', 'crackleIntensity', 'particleSize', 'sparkSizeVariability',
      'trailFade', 'bloomStrength', 'autoFinaleRate', 'rawParticleTextureSize',
    ]) expect(settingKeys.has(key)).toBe(true);
    for (const key of [
      'burstPattern', 'patternVariation', 'secondaryCount', 'secondaryDelay', 'secondaryInheritance',
      'secondarySpread', 'secondaryPowerScale', 'terminalSparkleProbability', 'terminalSparkleCount',
      'terminalSparklePower', 'terminalSparkleLifetime', 'terminalSparkleSize', 'particleLength',
      'paletteTransition', 'colorMode', 'renderStyle',
    ]) expect(settingKeys.has(key)).toBe(true);
    expect(FIREWORKS_POINT_FRAGMENT_SHADER).toContain('uniform float uCrackle');
  });

  it('defines four shared archetypes and all eight deterministic burst pattern codes', () => {
    expect(FIREWORKS_PARTICLE_EFFECT.archetypes.map((archetype) => archetype.id)).toEqual(['shell', 'primary', 'secondary', 'sparkle']);
    expect(FIREWORKS_PARTICLE_EFFECT.modules.events).toBe(true);
    expect(FIREWORKS_PARTICLE_EFFECT.renderRecipes.recipes.map((recipe) => recipe.tier)).toEqual(['basic', 'enhanced', 'ultra']);
    expect(FIREWORKS_PARTICLE_SETTING_BINDINGS.map((binding) => binding.persistedKey)).toContain('launchPower');
    expect(['peony', 'ring', 'chrysanthemum', 'willow', 'palm', 'spiral', 'crossette', 'comet'].map(fireworksPatternCode)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('makes launch power measurably scale the solved shell velocity', () => {
    const low = resolveFireworkLaunchVelocity(100, 700, 300, 200, 1.25, 360, 470);
    const baseline = resolveFireworkLaunchVelocity(100, 700, 300, 200, 1.25, 360, 940);
    const high = resolveFireworkLaunchVelocity(100, 700, 300, 200, 1.25, 360, 1_410);
    expect(Math.hypot(...baseline)).toBeCloseTo(Math.hypot(...low) * 2);
    expect(Math.hypot(...high)).toBeCloseTo(Math.hypot(...low) * 3);
  });
});
