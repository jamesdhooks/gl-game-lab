import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import {
  HARMONIC_SAND_DEFAULTS,
  HARMONIC_SAND_STYLE_MANIFEST,
  createHarmonicSandConfig,
  harmonicSandDefinition,
} from '../index.js';

describe('Harmonic Sand', () => {
  it('registers the maintained experience contract', () => {
    const registry = new ExperienceRegistry().register(harmonicSandDefinition);
    expect(registry.get('harmonic-sand').name).toBe('Haromonics');
    expect(harmonicSandDefinition.tutorialPages).toHaveLength(3);
    expect(HARMONIC_SAND_STYLE_MANIFEST.styles).toHaveLength(11);
  });

  it('preserves the maintained GPU field defaults', () => {
    expect(createHarmonicSandConfig()).toEqual(HARMONIC_SAND_DEFAULTS);
    expect(createHarmonicSandConfig({ resolution: 512, renderStyle: 'enhanced' })).toMatchObject({ resolution: 512, renderStyle: 'enhanced' });
    expect(() => createHarmonicSandConfig({ rawEmitterLimit: 20 })).toThrow('outside its supported range');
  });
});
