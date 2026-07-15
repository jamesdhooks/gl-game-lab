import { describe, expect, it } from 'vitest';
import {
  createDefaultPreviewProfile,
  resolvePreviewLaunch,
  sanitizePreviewProfile,
  type ExperienceDefinition,
  type ExperiencePreviewProfile,
} from '../index.js';

const definition: ExperienceDefinition = {
  id: 'preview-test',
  kind: 'simulation',
  name: 'Preview Test',
  short: 'Short',
  long: 'Long',
  icon: 'P',
  tags: [],
  capabilities: {},
  modes: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }],
  settings: [
    { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 1, default: 50 },
    { key: 'capacity', label: 'Capacity', type: 'number', min: 32, max: 1024, step: 1, numericScale: 'powerOfTwo', default: 128 },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    { key: 'shape', label: 'Shape', type: 'select', default: 'circle', options: [{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }] },
    { key: 'label', label: 'Label', type: 'string', default: 'anchor' },
  ],
  styleManifest: {
    defaultStyleId: 'light', renderLayers: [], passes: [], qualities: [],
    styles: [
      { id: 'light', name: 'Light', description: 'Light', palette: [0xffffff], background: 0, passes: [] },
      { id: 'dark', name: 'Dark', description: 'Dark', palette: [0], background: 0, passes: [] },
    ],
  },
  createPlugins: () => [],
};

function profile(overrides: Partial<ExperiencePreviewProfile> = {}): ExperiencePreviewProfile {
  return {
    ...createDefaultPreviewProfile(definition),
    ...overrides,
  };
}

describe('preview profiles', () => {
  it('resolves deterministically for the same seed', () => {
    const value = profile({ variation: { intensity: 1, lockedKeys: [], seed: 7 } });
    expect(resolvePreviewLaunch(definition, value, 42)).toEqual(resolvePreviewLaunch(definition, value, 42));
    expect(resolvePreviewLaunch(definition, value, 42).seed).not.toBe(resolvePreviewLaunch(definition, value, 43).seed);
  });

  it('reproduces the anchor exactly at zero intensity', () => {
    const value = profile({
      modeId: 'two', styleId: 'dark',
      settings: { amount: 87, capacity: 512, enabled: false, shape: 'square', label: 'fixed' },
      variation: { intensity: 0, lockedKeys: [], seed: 9 },
    });
    const resolved = resolvePreviewLaunch(definition, value, 123);
    expect(resolved.modeId).toBe('two');
    expect(resolved.styleId).toBe('dark');
    expect(resolved.settings).toEqual(value.settings);
  });

  it('inherits non-overridden settings and selections from the definition', () => {
    const value = { ...createDefaultPreviewProfile(definition), generationMode: 'exact' as const };
    expect(value.settings).toEqual({});
    const resolved = resolvePreviewLaunch(definition, value, 123);
    expect(resolved.modeId).toBe('one');
    expect(resolved.styleId).toBeDefined();
    expect(resolved.settings.amount).toBe(50);
    expect(resolved.settings.enabled).toBe(true);
  });

  it('tracks later scene-default changes for every non-overridden value', () => {
    const value = profile({
      settings: { amount: 80 },
      generationMode: 'exact',
    });
    const changedDefinition: ExperienceDefinition = {
      ...definition,
      settings: (definition.settings ?? []).map((field) => field.key === 'enabled' && field.type === 'boolean' ? { ...field, default: false } : field),
    };
    const resolved = resolvePreviewLaunch(changedDefinition, value, 123);
    expect(resolved.settings.amount).toBe(80);
    expect(resolved.settings.enabled).toBe(false);
  });

  it('uses exact authored values while still producing a fresh simulation seed', () => {
    const value = profile({
      modeId: 'two', styleId: 'dark', generationMode: 'exact',
      settings: { amount: 87, capacity: 512, enabled: false, shape: 'square', label: 'fixed' },
      variation: { intensity: 1, lockedKeys: [], seed: 9 },
    });
    const first = resolvePreviewLaunch(definition, value, 123);
    const second = resolvePreviewLaunch(definition, value, 456);
    expect(first.settings).toEqual(value.settings);
    expect(second.settings).toEqual(value.settings);
    expect(first.modeId).toBe('two');
    expect(second.styleId).toBe('dark');
    expect(first.seed).not.toBe(second.seed);
  });

  it('randomizes every unlocked preview palette independently of variation intensity', () => {
    const value = profile({
      styleId: 'light',
      variation: { intensity: 0.01, lockedKeys: [], seed: 19 },
    });
    const palettes = new Set(Array.from({ length: 32 }, (_, sessionSeed) => resolvePreviewLaunch(definition, value, sessionSeed).styleId));
    expect(palettes).toEqual(new Set(['light', 'dark']));

    const locked = profile({
      styleId: 'dark',
      variation: { intensity: 1, lockedKeys: ['$style'], seed: 19 },
    });
    for (let sessionSeed = 0; sessionSeed < 16; sessionSeed += 1) {
      expect(resolvePreviewLaunch(definition, locked, sessionSeed).styleId).toBe('dark');
    }
  });

  it('keeps locked and string values while clamping invalid anchors', () => {
    const value = profile({
      settings: { amount: 999, capacity: 500, enabled: true, shape: 'missing', label: 'copy' },
      variation: { intensity: 1, lockedKeys: ['amount', 'capacity', 'label', 'missing'], seed: 11 },
      renderPolicy: 'static',
    });
    const sanitized = sanitizePreviewProfile(definition, value);
    expect(sanitized.settings.amount).toBe(100);
    expect(sanitized.settings.capacity).toBe(512);
    expect(sanitized.settings.shape).toBeUndefined();
    expect(sanitized.settings.enabled).toBeUndefined();
    expect(sanitized.variation.lockedKeys).toEqual(['amount', 'capacity', 'label']);
    const resolved = resolvePreviewLaunch(definition, sanitized, 77);
    expect(resolved.settings.amount).toBe(100);
    expect(resolved.settings.capacity).toBe(512);
    expect(resolved.settings.label).toBe('copy');
  });

  it('keeps all resolved numeric values valid and snapped', () => {
    const value = profile({ variation: { intensity: 1, lockedKeys: [], seed: 100 } });
    for (let seed = 0; seed < 100; seed += 1) {
      const resolved = resolvePreviewLaunch(definition, value, seed);
      const amount = Number(resolved.settings.amount);
      const capacity = Number(resolved.settings.capacity);
      expect(amount).toBeGreaterThanOrEqual(0);
      expect(amount).toBeLessThanOrEqual(100);
      expect(Number.isInteger(amount)).toBe(true);
      expect([32, 64, 128, 256, 512, 1024]).toContain(capacity);
    }
  });
});
