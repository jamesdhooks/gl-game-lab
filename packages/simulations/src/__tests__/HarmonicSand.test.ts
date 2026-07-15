import { describe, expect, it } from 'vitest';
import { createDefaultPreviewProfile, ExperienceRegistry, resolvePreviewLaunch } from '@hooksjam/gl-game-lab-engine';
import {
  HARMONIC_SAND_DEFAULTS,
  HARMONIC_SAND_STYLE_MANIFEST,
  createHarmonicSandEmitterLayout,
  createHarmonicSandConfig,
  harmonicSandEmitterMarkersVisible,
  harmonicSandDefinition,
} from '../index.js';
import { HARMONIC_SAND_FRAGMENT_SHADER } from '../harmonic-sand/shader.js';

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

  it('renders emitters as simple frequency-driven circular markers', () => {
    expect(HARMONIC_SAND_FRAGMENT_SHADER).toContain('if (uShowEmitterMarkers == 0) return 0.0;');
    expect(HARMONIC_SAND_FRAGMENT_SHADER).toContain('float pulse = sin(uTime * frequency + emitter.w)');
    expect(HARMONIC_SAND_FRAGMENT_SHADER).toContain('marker = max(marker, disc');
    expect(HARMONIC_SAND_FRAGMENT_SHADER).not.toContain('abs(d - 0.046)');
  });

  it('hides source markers in preview and demo without removing the emitters', () => {
    expect(harmonicSandEmitterMarkersVisible('preview')).toBe(false);
    expect(harmonicSandEmitterMarkersVisible('demo')).toBe(false);
    expect(harmonicSandEmitterMarkersVisible('play')).toBe(true);
    expect(harmonicSandEmitterMarkersVisible(undefined)).toBe(true);
  });

  it('randomly selects every renderer tier for varied previews', () => {
    const profile = createDefaultPreviewProfile(harmonicSandDefinition);
    const renderStyles = new Set(Array.from(
      { length: 64 },
      (_, seed) => resolvePreviewLaunch(harmonicSandDefinition, profile, seed).settings.renderStyle,
    ));

    expect(renderStyles).toEqual(new Set(['basic', 'enhanced', 'ultra']));
  });

  it('uses the launch seed to vary preview emitters while preserving the play layout', () => {
    const config = createHarmonicSandConfig({ baseFrequency: 4.2, rawEmitterLimit: 5 });
    const first = createHarmonicSandEmitterLayout(config, 'preview', 101);
    const repeated = createHarmonicSandEmitterLayout(config, 'preview', 101);
    const second = createHarmonicSandEmitterLayout(config, 'preview', 202);

    expect(repeated).toEqual(first);
    expect(second).not.toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(5);
    expect(first.every((emitter) => Math.abs(emitter.x) < 0.8 && Math.abs(emitter.y) < 0.8)).toBe(true);
    expect(first.every((emitter) => emitter.frequency >= 4.2 * 0.68 && emitter.frequency <= 4.2 * 1.44)).toBe(true);
    expect(createHarmonicSandEmitterLayout(config, 'play', 101)).toEqual(createHarmonicSandEmitterLayout(config, 'play', 202));
  });
});
