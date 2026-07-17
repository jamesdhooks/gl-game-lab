import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { COMPILED_SPARKS_PLUGIN_ID, createSparksConfig, createSparksDefaultRails, createSparksPreviewRails, resolveSparksBounceEventParameters, resolveSparksBuildRadius, resolveSparksEmissionCone, SPARKS_DEFAULTS, SPARKS_PARTICLE_EFFECT, SPARKS_PARTICLE_GRAPH, SPARKS_PARTICLE_PROGRAM, SPARKS_PARTICLE_SETTING_BINDINGS, SPARKS_SETTINGS, SPARKS_STYLE_MANIFEST, sparksDefinition } from '../index.js';
import { SPARKS_POINT_FRAGMENT_SHADER, SPARKS_POINT_VERTEX_SHADER, SPARKS_RAIL_SHADER, SPARKS_STEP_SHADER, SPARKS_TRAIL_VERTEX_SHADER } from '../sparks/shaders.js';
import { sparksBloomIntensity } from '../sparks/config.js';
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
      rawParticleTextureSize: '512',
      particleFidelity: 0.75,
      trailFidelity: 0.8,
      bloomFidelity: 0.625,
      bloomSamples: 6,
      lightingFidelity: 0.7,
    })).toMatchObject({
      renderStyle: 'ultra',
      rawParticleTextureSize: 512,
      particleFidelity: 0.75,
      trailFidelity: 0.8,
      bloomFidelity: 0.625,
      bloomSamples: 6,
      lightingFidelity: 0.7,
    });
    expect(() => createSparksConfig({
      gravity: 20
    })).toThrow('outside its supported range');
    expect(createSparksConfig({ rawParticleTextureSize: '768' })).toMatchObject({ rawParticleTextureSize: 1024 });
    expect(SPARKS_SETTINGS.find((setting) => setting.key === 'rawParticleTextureSize')).toMatchObject({
      type: 'number', section: 'Simulation', min: 128, max: 2048, numericScale: 'powerOfTwo', advanced: true,
    });
    expect(createSparksConfig({ rawParticleTextureSize: 2048 })).toMatchObject({ rawParticleTextureSize: 2048 });
    expect(SPARKS_PARTICLE_EFFECT.capacity.max).toBe(2048 * 2048);
    expect(SPARKS_SETTINGS.find((setting) => setting.key === 'emissionRate')).toMatchObject({ min: 0, max: 10_000 });
    expect(SPARKS_SETTINGS.find((setting) => setting.key === 'contactHeat')).toMatchObject({ min: 0, max: 25 });
    expect(createSparksConfig({ emissionRate: 24_975, contactHeat: 100 })).toMatchObject({ emissionRate: 10_000, contactHeat: 25 });
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

  it('keeps authored build thickness in play while scaling it for a preview tile', () => {
    expect(resolveSparksBuildRadius(18, false, 384, 384)).toBe(18);
    expect(resolveSparksBuildRadius(18, true, 384, 384)).toBeCloseTo(6.75);
    expect(resolveSparksBuildRadius(18, true, 1600, 900)).toBeCloseTo(15.8203125);
    expect(SPARKS_RAIL_SHADER).toContain('uniform vec3 uBodyColor');
    expect(SPARKS_RAIL_SHADER).toContain('uniform vec3 uEdgeColor');
    expect(SPARKS_RAIL_SHADER).not.toContain('vec3(.12,.18,.24)');
  });

  it('varies welding burst headings and widths without changing zero-chaos output', () => {
    const stableA = resolveSparksEmissionCone('welding', 0, 0, 0.1, 0.2);
    const stableB = resolveSparksEmissionCone('welding', 0, 0, 0.9, 0.8);
    const variedA = resolveSparksEmissionCone('welding', 1, 0, 0.1, 0.2);
    const variedB = resolveSparksEmissionCone('welding', 1, 0, 0.9, 0.8);
    expect(stableA).toEqual(stableB);
    expect(variedA.direction).not.toBe(variedB.direction);
    expect(variedA.spread).not.toBe(variedB.spread);
    expect(SPARKS_PARTICLE_PROGRAM.effect.source.emitters.find((emitter) => emitter.id === 'welding')?.initialization?.powerVariability).toBeGreaterThan(0.5);
  });

  it('keeps contextual settings scoped to the relevant input and render modes', () => {
    const byKey = new Map(SPARKS_SETTINGS.map((setting) => [setting.key, setting]));
    expect(byKey.get('buildRadius')?.visibleModes).toEqual(['build']);
    expect(byKey.get('coreSparkTorchPositionVariability')?.visibleModes).toEqual(['welding']);
    expect(byKey.get('trailFade')?.visibleRenderStyles).toEqual(['enhanced', 'ultra']);
    expect(byKey.get('trailContinuity')?.visibleRenderStyles).toEqual(['enhanced', 'ultra']);
    expect(byKey.get('heatRadius')?.visibleRenderStyles).toEqual(['enhanced', 'ultra']);
    expect(byKey.get('primarySparkLength')).toMatchObject({ min: 0, max: 4 });
    expect(byKey.get('bounceSparkLength')).toMatchObject({ min: 0, max: 4 });
    expect(byKey.get('trailContinuity')).toMatchObject({ min: 0, max: 4 });
    for (const key of ['coreSparkOpacity', 'primarySparkOpacity', 'bounceSparkOpacity']) {
      expect(byKey.get(key)).toMatchObject({ label: 'Opacity', min: 0, max: 1 });
    }
    for (const key of ['particleFidelity', 'trailFidelity', 'bloomThreshold', 'bloomRadius', 'bloomFidelity', 'bloomSamples', 'environmentLight', 'lightShafts', 'shaftLength', 'heatDistortion', 'lightingFidelity']) {
      expect(byKey.get(key)?.visibleRenderStyles).toEqual(['ultra']);
    }
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
    for (const [parameterId, key, archetype] of [
      ['core-opacity', 'coreSparkOpacity', 'core'],
      ['primary-opacity', 'primarySparkOpacity', 'primary'],
      ['bounce-opacity', 'bounceSparkOpacity', 'bounce'],
    ] as const) {
      expect(SPARKS_PARTICLE_GRAPH.parameters.some((parameter) => parameter.id === parameterId)).toBe(true);
      expect(SPARKS_PARTICLE_GRAPH.persistedBindings.some((binding) => binding.parameterId === parameterId && binding.key === key)).toBe(true);
      expect(SPARKS_PARTICLE_GRAPH.moduleBindings.some((binding) => binding.parameterId === parameterId && binding.target === `archetype.${archetype}.appearance.alpha.start`)).toBe(true);
    }
    expect(SPARKS_PARTICLE_PROGRAM.renderPasses.basic.filter((pass) => pass.layerKind).map((pass) => pass.layerKind)).toEqual(['streak', 'point']);
    expect(SPARKS_PARTICLE_PROGRAM.renderPasses.enhanced.filter((pass) => pass.layerKind).map((pass) => pass.layerKind)).toEqual(['halo', 'streak', 'core']);
    expect(SPARKS_PARTICLE_PROGRAM.renderPasses.enhanced.some((pass) => pass.kind === 'trails')).toBe(true);
    expect(SPARKS_PARTICLE_PROGRAM.renderPasses.ultra.filter((pass) => pass.layerKind).map((pass) => pass.layerKind)).toEqual(['halo', 'streak', 'core']);
    expect(SPARKS_PARTICLE_PROGRAM.webgl2.streakVertex.source).toContain('continuityWeight=smoothstep(0.0,0.18,continuity)');
    expect(SPARKS_PARTICLE_PROGRAM.webgl2.fragment.source).toContain('streakJoin=0.18*smoothstep(0.0,0.3,uStreakScale)');
    expect(SPARKS_PARTICLE_PROGRAM.webgl2.fragment.source).toContain('streakTail=mix(streakJoin,1.0,pow(max(0.0,1.0-vStreakUv.x),1.35))');
    expect(SPARKS_PARTICLE_GRAPH.moduleBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'archetype.primary.appearance.length.end', parameterId: 'primary-length-end' }),
      expect.objectContaining({ target: 'archetype.bounce.appearance.length.end', parameterId: 'bounce-length-end' }),
    ]));
    expect(SPARKS_PARTICLE_SETTING_BINDINGS.map((binding) => binding.persistedKey)).toContain('primarySparkLength');
    expect(SPARKS_STEP_SHADER).toContain('uParticleCommandData');
    expect(SPARKS_STEP_SHADER).toContain('layout(location=2) out vec4 outMetadata');
    expect(SPARKS_STEP_SHADER).toContain('uMetadataState');
    expect(SPARKS_STEP_SHADER).toContain('commandIndex<64');
    expect(SPARKS_STEP_SHADER).not.toContain('uSpawnActive');
    expect(SPARKS_STEP_SHADER).not.toContain('fract(pv.z)');
  });

  it('launches through the compiled graph while retaining the legacy rollback plugin', () => {
    expect(sparksDefinition.createPlugins?.()[0]?.id).toBe(COMPILED_SPARKS_PLUGIN_ID);
    expect(SPARKS_PARTICLE_PROGRAM.webgl2.eventClaimVertex?.source).toContain('uParticleEventC[1]');
    expect(SPARKS_PARTICLE_PROGRAM.webgl2.eventClaimVertex?.source).toContain('uVelocityState');
    expect(SPARKS_PARTICLE_PROGRAM.webgl2.vertex.source).toContain('sizeCurve.w');
  });

  it('maps Ultra bloom strength directly to additive post-process exposure', () => {
    expect(sparksBloomIntensity(createSparksConfig({ bloomStrength: 0 }))).toBe(0);
    expect(sparksBloomIntensity(createSparksConfig({ bloomStrength: 7.2 }))).toBe(7.2);
  });

  it('routes every visible Bounce physics setting to a live compiled parameter', () => {
    const config = createSparksConfig({
      bounceRestitution: 1.35,
      bounceLifeDecay: 0.61,
      bounceBurstChance: 0.73,
      bounceBurstMinSpeed: 420,
      bounceBurstCount: 31,
      bounceBurstCountSpeedScale: 1.6,
      bounceBurstImpactSpeedScale: 2.4,
      bounceBurstSpread: 2.25,
      bounceSparkSpeedScale: 0,
      bounceSparkSpeedVariability: 0.5,
    });
    expect(resolveSparksBounceEventParameters(config)).toMatchObject({
      probability: 0.73,
      count: 31,
      minimumSpeed: 420,
      countSpeedScale: 1.6,
      impactPowerScale: 2.4,
      spread: 2.25 * Math.PI / 3,
      velocityInheritance: 0,
      powerScale: 0,
      powerScaleVariability: 0.5,
      powerVariability: 0,
    });
    expect(SPARKS_PARTICLE_GRAPH.parameters.find(({ id }) => id === 'restitution')?.max).toBe(1.35);
    expect(SPARKS_PARTICLE_GRAPH.persistedBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ parameterId: 'restitution', key: 'bounceRestitution' }),
      expect.objectContaining({ parameterId: 'collision-life-loss', key: 'bounceLifeDecay' }),
    ]));
    expect(SPARKS_PARTICLE_GRAPH.moduleBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'archetype.primary.collision.restitution', parameterId: 'restitution' }),
      expect.objectContaining({ target: 'archetype.primary.collision.lifetimeLoss', parameterId: 'collision-life-loss' }),
    ]));
  });

  it('does not inject removed bounce aliases into modern configs', () => {
    expect(SPARKS_DEFAULTS).not.toHaveProperty('bounceBurstSpeedScale');
    expect(SPARKS_DEFAULTS).not.toHaveProperty('bounceBurstLifeScale');
  });
});
