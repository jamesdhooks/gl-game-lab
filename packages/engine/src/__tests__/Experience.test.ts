import { describe, expect, it } from 'vitest';
import { ExperienceRegistry, type ExperienceDefinition } from '../index.js';

const example: ExperienceDefinition = {
  id: 'ball-pit',
  kind: 'simulation',
  name: 'Ball Pit',
  short: 'Bouncy balls.',
  long: 'Fill the screen with bouncy balls and stir them around.',
  icon: '●',
  tags: ['physics'],
  capabilities: { interactive: true, reset: true },
  modes: [{ id: 'single', label: 'Single' }],
  settings: [{ type: 'number', key: 'radius', label: 'Radius', default: 12, min: 2, max: 64, step: 0.5 }],
  styleManifest: {
    defaultStyleId: 'rainbow',
    renderLayers: ['primitive'],
    passes: ['primitive'],
    qualities: ['raw'],
    styles: [{
      id: 'rainbow',
      name: 'Rainbow',
      description: 'Bright colors.',
      palette: [0xff0000, 0x00ff00],
      background: 0x000000,
      passes: ['primitive'],
    }],
  },
  tutorialPages: [{ icon: '●', title: 'Tap', body: 'Tap to add a ball.' }],
  createPlugins: () => [],
};

describe('ExperienceRegistry', () => {
  it('registers definitions and performs normalized lookups', () => {
    const registry = new ExperienceRegistry().register(example);
    expect(registry.get(' BALL-PIT ')).toBe(example);
    expect(registry.values()).toEqual([example]);
  });

  it('rejects duplicate ids and malformed settings', () => {
    const registry = new ExperienceRegistry().register(example);
    expect(() => registry.register(example)).toThrow('already registered');
    expect(() => new ExperienceRegistry().register({
      ...example,
      id: 'invalid',
      settings: [{ type: 'number', key: 'radius', label: 'Radius', default: 100, min: 2, max: 64, step: 1 }],
    })).toThrow('invalid bounds');
  });

  it('validates reusable presentation contracts', () => {
    expect(() => new ExperienceRegistry().register({
      ...example,
      id: 'invalid-style',
      styleManifest: { ...example.styleManifest!, defaultStyleId: 'missing' },
    })).toThrow('default style');
    expect(() => new ExperienceRegistry().register({
      ...example,
      id: 'invalid-tutorial',
      tutorialPages: [{ icon: '', title: 'Tap', body: 'Tap to add a ball.' }],
    })).toThrow('tutorial pages');
  });
});
