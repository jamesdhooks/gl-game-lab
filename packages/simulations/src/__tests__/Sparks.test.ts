import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createSparksConfig, createSparksDefaultRails, createSparksPreviewRails, SPARKS_DEFAULTS, SPARKS_PARTICLE_EFFECT, SPARKS_PARTICLE_SETTING_BINDINGS, SPARKS_SETTINGS, SPARKS_STYLE_MANIFEST, sparksDefinition } from '../index.js';
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

  it('keeps contextual settings scoped to the relevant input and render modes', () => {
    const byKey = new Map(SPARKS_SETTINGS.map((setting) => [setting.key, setting]));
    expect(byKey.get('buildRadius')?.visibleModes).toEqual(['build']);
    expect(byKey.get('coreSparkTorchPositionVariability')?.visibleModes).toEqual(['welding']);
    expect(byKey.get('trailFade')?.visibleRenderStyles).toEqual(['ultra']);
    expect(byKey.get('trailContinuity')?.visibleRenderStyles).toEqual(['enhanced', 'ultra']);
    expect(byKey.get('heatRadius')?.visibleRenderStyles).toEqual(['enhanced', 'ultra']);
  });

  it('keeps collision, turbulence, and bounce sub-emission in the GPU step contract', () => {
    expect(SPARKS_STEP_SHADER).toContain('uBuildSurfaces[13]');
    expect(SPARKS_STEP_SHADER).toContain('reflectWithFriction');
    expect(SPARKS_STEP_SHADER).toContain('turbulenceField');
    expect(SPARKS_STEP_SHADER).toContain('uBounceBurstChance');
    expect(SPARKS_STEP_SHADER).toContain('uBounceBurstCount');
    expect(SPARKS_STEP_SHADER).toContain('parentGeneration>=1.0&&parentGeneration<1.5');
  });

  it('uses the shared batched particle-effect contract without discarding saved keys', () => {
    expect(SPARKS_PARTICLE_EFFECT.archetypes.map((archetype) => archetype.id)).toEqual(['core', 'primary', 'bounce']);
    expect(SPARKS_PARTICLE_EFFECT.capacity.commandCapacity).toBe(64);
    expect(SPARKS_PARTICLE_EFFECT.renderRecipes.recipes.map((recipe) => recipe.tier)).toEqual(['basic', 'enhanced', 'ultra']);
    expect(SPARKS_PARTICLE_SETTING_BINDINGS.map((binding) => binding.persistedKey)).toContain('primarySparkLength');
    expect(SPARKS_STEP_SHADER).toContain('uParticleCommandData');
    expect(SPARKS_STEP_SHADER).toContain('layout(location=2) out vec4 outMetadata');
    expect(SPARKS_STEP_SHADER).toContain('uMetadataState');
    expect(SPARKS_STEP_SHADER).toContain('commandIndex<64');
    expect(SPARKS_STEP_SHADER).not.toContain('uSpawnActive');
    expect(SPARKS_STEP_SHADER).not.toContain('fract(pv.z)');
  });
});
