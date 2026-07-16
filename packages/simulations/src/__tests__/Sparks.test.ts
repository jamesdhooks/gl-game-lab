import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createSparksConfig, createSparksDefaultRails, createSparksPreviewRails, SPARKS_DEFAULTS, SPARKS_SETTINGS, SPARKS_STYLE_MANIFEST, sparksDefinition } from '../index.js';
import { SPARKS_POINT_FRAGMENT_SHADER, SPARKS_POINT_VERTEX_SHADER, SPARKS_STEP_SHADER, SPARKS_TRAIL_VERTEX_SHADER } from '../sparks/shaders.js';
describe('Sparks', () => {
  it('registers four interaction modes and six styles', () => {
    const registry = new ExperienceRegistry().register(sparksDefinition);
    expect(registry.get('sparks').modes?.map(mode => mode.id)).toEqual([
      'welding',
      'pinwheel',
      'shower',
      'build'
    ]);
    expect(SPARKS_STYLE_MANIFEST.styles).toHaveLength(6);
    expect(sparksDefinition.tutorialPages).toHaveLength(5);
  });
  it('preserves its maintained controls and defaults', () => {
    expect(createSparksConfig()).toEqual(SPARKS_DEFAULTS);
    expect(SPARKS_SETTINGS.length).toBeGreaterThan(40);
    expect(createSparksConfig({
      renderStyle: 'ultra',
      rawParticleTextureSize: '512'
    })).toMatchObject({
      renderStyle: 'ultra',
      rawParticleTextureSize: '512'
    });
    expect(() => createSparksConfig({
      gravity: 20
    })).toThrow('outside its supported range');
  });
  it('keeps the legacy profile controls in the GPU render equations', () => {
    expect(SPARKS_POINT_VERTEX_SHADER).toContain('uPrimarySize * uPrimarySizeScale');
    expect(SPARKS_POINT_VERTEX_SHADER).toContain('mix(10.0, 30.0, sparkBurstSeed)');
    expect(SPARKS_POINT_VERTEX_SHADER).toContain('pointScale * generationSize * speedStretch');
    expect(SPARKS_POINT_VERTEX_SHADER).toContain('vLengthT = lengthT');
    expect(SPARKS_POINT_FRAGMENT_SHADER).toContain('float halfLength = mix(0.28, 1.0, lengthT)');
    expect(SPARKS_STEP_SHADER).toContain('life=mix(.72,1.36');
    expect(SPARKS_POINT_VERTEX_SHADER).toContain('mix(9.0, 30.0, coreBurstSeed)');
    expect(SPARKS_TRAIL_VERTEX_SHADER).toContain('uTrailContinuity');
    expect(SPARKS_TRAIL_VERTEX_SHADER).toContain('profileLength * sparkSizeVariation');
  });
  it('creates default build surfaces for sparks to collide with', () => {
    const rails = createSparksDefaultRails(800, 600);
    expect(rails.length).toBeGreaterThanOrEqual(4);
    expect(rails.some(rail => rail.x1 === rail.x2 && rail.y1 === rail.y2)).toBe(true);
    expect(rails.some(rail => Math.hypot(rail.x2 - rail.x1, rail.y2 - rail.y1) > 400)).toBe(true);
  });
  it('creates deterministic preview rails with pegs and sloped surfaces', () => {
    const first = createSparksPreviewRails(384, 384, 123);
    const second = createSparksPreviewRails(384, 384, 123);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(first.some(rail => rail.x1 === rail.x2 && rail.y1 === rail.y2)).toBe(true);
    expect(first.some(rail => Math.abs(rail.y2 - rail.y1) > 8 && Math.hypot(rail.x2 - rail.x1, rail.y2 - rail.y1) > 80)).toBe(true);
  });
});
