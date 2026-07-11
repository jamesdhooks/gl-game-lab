import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createFireworksConfig, FIREWORKS_DEFAULTS, FIREWORKS_STYLE_MANIFEST, fireworksDefinition } from '../index.js';

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
});
