import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createMyceliumConfig, MYCELIUM_DEFAULTS, MYCELIUM_SETTINGS, MYCELIUM_STYLE_MANIFEST, myceliumDefinition } from '../index.js';
import { myceliumUsesTriangleMesh } from '../mycelium/MyceliumPlugin.js';
import { MYCELIUM_DISPLAY_SHADER } from '../mycelium/shaders.js';
describe('Mycelium', () => {
  it('registers its cellular field contract', () => {
    const registry = new ExperienceRegistry().register(myceliumDefinition);
    expect(registry.get('mycelium').modes?.map(mode => mode.id)).toEqual([
      'paint'
    ]);
    expect(MYCELIUM_STYLE_MANIFEST.styles).toHaveLength(11);
    expect(MYCELIUM_SETTINGS).toHaveLength(22);
  });
  it('preserves growth defaults and topology controls', () => {
    expect(createMyceliumConfig()).toEqual(MYCELIUM_DEFAULTS);
    expect(createMyceliumConfig({
      topology: 'square',
      renderStyle: 'bloom',
      resolution: 512
    })).toMatchObject({
      topology: 'square',
      renderStyle: 'bloom',
      resolution: 512
    });
    expect(() => createMyceliumConfig({
      growthRate: 25
    })).toThrow('outside its supported range');
  });
  it('uses the original full-screen organic field for Ultra', () => {
    expect(myceliumUsesTriangleMesh('triangle', 'basic')).toBe(true);
    expect(myceliumUsesTriangleMesh('triangle', 'enhanced')).toBe(true);
    expect(myceliumUsesTriangleMesh('triangle', 'bloom')).toBe(false);
    expect(myceliumUsesTriangleMesh('square', 'bloom')).toBe(false);
    expect(MYCELIUM_DISPLAY_SHADER).toContain('organicBloomField');
    expect(MYCELIUM_DISPLAY_SHADER).toContain('for(int y=-3;y<=3;y++)');
    expect(MYCELIUM_DISPLAY_SHADER).toContain('float fiberNoise=');
    expect(MYCELIUM_DISPLAY_SHADER).toContain('float rim=');
  });
  it('exposes fine-grained controls only for the Ultra renderer', () => {
    const ultraFields = MYCELIUM_SETTINGS.filter(setting => setting.visibleRenderStyles?.includes('bloom'));
    expect(ultraFields.map(setting => setting.key)).toEqual([
      'fieldSpread',
      'ultraSurfaceThreshold',
      'ultraEdgeSoftness',
      'ultraHaloStrength',
      'ultraFiberStrength',
      'ultraCoreBrightness',
      'ultraRimStrength',
    ]);
    expect(createMyceliumConfig()).toMatchObject({
      fieldSpread: 2.4,
      ultraSurfaceThreshold: 0.72,
      ultraEdgeSoftness: 0.2,
      ultraHaloStrength: 1,
      ultraFiberStrength: 0.16,
      ultraCoreBrightness: 1,
      ultraRimStrength: 0.22,
    });
    expect(MYCELIUM_DISPLAY_SHADER).toContain('uniform float uUltraSurfaceThreshold;');
    expect(MYCELIUM_DISPLAY_SHADER).toContain('uniform float uUltraEdgeSoftness;');
    expect(MYCELIUM_DISPLAY_SHADER).toContain('uniform float uUltraHaloStrength;');
  });
});
