import { describe, expect, it } from 'vitest';
import { ENGINE_TIME_SCALE_SETTING, ExperienceRegistry, withEngineTimeScaleSetting, type ExperienceDefinition, type ExperienceLaunchOptions } from '../index.js';

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
  attributions: [{ label: 'Example', href: 'https://example.com', license: 'MIT' }],
  createPlugins: () => [],
};

describe('ExperienceRegistry', () => {
  it('composes one engine-owned time scale setting into every experience', () => {
    const composed = withEngineTimeScaleSetting(example);
    expect(composed.settings?.[0]).toBe(ENGINE_TIME_SCALE_SETTING);
    expect(composed.settings?.filter((setting) => setting.key === 'timeScale')).toHaveLength(1);
    expect(composed.settings?.find((setting) => setting.key === 'timeScale')).toMatchObject({
      type: 'number', min: 0, max: 2, step: 0.05, default: 1,
    });

    const legacy = withEngineTimeScaleSetting({
      ...example,
      settings: [{ type: 'number', key: 'timeScale', label: 'Timescale', default: 0.5, min: 0, max: 1, step: 0.1 }],
    });
    expect(legacy.settings).toEqual([ENGINE_TIME_SCALE_SETTING]);
  });

  it('keeps engine-owned settings out of experience plugin configuration', () => {
    let received: ExperienceLaunchOptions | undefined;
    const composed = withEngineTimeScaleSetting({
      ...example,
      createPlugins: (options) => {
        received = options;
        return [];
      },
    });

    composed.createPlugins({ settings: { timeScale: 0.5, radius: 24 } });

    expect(received?.settings).toEqual({ radius: 24 });
  });

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
    expect(() => new ExperienceRegistry().register({
      ...example,
      id: 'invalid-attribution',
      attributions: [{ label: 'Broken', href: 'not a url' }],
    })).toThrow('attribution link');
  });
});
