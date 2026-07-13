import { describe, expect, it } from 'vitest';
import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { normalizePreviewProfiles } from '../previewProfiles.js';

const definition: ExperienceDefinition = {
  id: 'sample', kind: 'simulation', name: 'Sample', short: 'Short', long: 'Long', icon: 'S', tags: [], capabilities: {},
  modes: [{ id: 'draw', label: 'Draw' }],
  settings: [
    { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 10, step: 1, default: 4 },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  ],
  styleManifest: { defaultStyleId: 'blue', renderLayers: [], passes: [], qualities: [], styles: [{ id: 'blue', name: 'Blue', description: 'Blue', palette: [0x0000ff], background: 0, passes: [] }] },
  createPlugins: () => [],
};

describe('normalizePreviewProfiles', () => {
  it('derives an auto profile from experience defaults when no entry exists', () => {
    const profile = normalizePreviewProfiles({}, [definition]).sample;
    expect(profile?.settings).toEqual({ amount: 4, enabled: true });
    expect(profile?.variation.intensity).toBe(0.25);
    expect(profile?.renderPolicy).toBe('auto');
  });

  it('sanitizes persisted settings, locks, policy, and fallback metadata', () => {
    const profile = normalizePreviewProfiles({ previews: { sample: {
      modeId: 'missing', styleId: 'blue', settings: { amount: 99, enabled: false, removed: 4 },
      variation: { intensity: 2, lockedKeys: ['amount', 'removed'], seed: 7 }, renderPolicy: 'static',
      image: { src: 'previews/sample.webp', revision: 'abcdef1234567890', width: 512, height: 512, profileHash: '1234abcd' },
    } } }, [definition]).sample;
    expect(profile?.modeId).toBe('draw');
    expect(profile?.settings).toEqual({ amount: 10, enabled: false });
    expect(profile?.variation).toEqual({ intensity: 1, lockedKeys: ['amount'], seed: 7 });
    expect(profile?.renderPolicy).toBe('static');
    expect(profile?.image?.src).toBe('previews/sample.webp');
  });
});
