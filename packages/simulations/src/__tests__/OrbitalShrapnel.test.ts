import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createOrbitalShrapnelConfig, ORBITAL_SHRAPNEL_DEFAULTS, ORBITAL_SHRAPNEL_STYLE_MANIFEST, orbitalShrapnelDefinition } from '../index.js';
import { asteroidLaunchVelocity, debrisSpawnCount, orbitalGravityWorld, stableOrbitalVelocity } from '../orbital-shrapnel/orbitalMotion.js';
import { ORBITAL_STEP_SHADER } from '../orbital-shrapnel/shaders.js';
describe('Space Debris', () => {
  it('registers all orbital tools and maintained styles', () => {
    const registry = new ExperienceRegistry().register(orbitalShrapnelDefinition);
    expect(registry.get('orbital-shrapnel').modes?.map(mode => mode.id)).toEqual([
      'add',
      'interact',
      'well',
      'asteroid'
    ]);
    expect(ORBITAL_SHRAPNEL_STYLE_MANIFEST.styles).toHaveLength(10);
    expect(orbitalShrapnelDefinition.tutorialPages).toHaveLength(5);
  });
  it('preserves orbital defaults and bounds', () => {
    expect(createOrbitalShrapnelConfig()).toEqual(ORBITAL_SHRAPNEL_DEFAULTS);
    expect(createOrbitalShrapnelConfig({
      rawParticleTextureSize: 512,
      secondaryBodyCount: 5
    })).toMatchObject({
      rawParticleTextureSize: 512,
      secondaryBodyCount: 5
    });
    expect(createOrbitalShrapnelConfig({ rawParticleTextureSize: '768' })).toMatchObject({ rawParticleTextureSize: 1024 });
    expect(orbitalShrapnelDefinition.settings?.find(setting => setting.key === 'rawParticleTextureSize')).toMatchObject({
      type: 'number',
      min: 64,
      max: 2048,
      numericScale: 'powerOfTwo'
    });
    expect(createOrbitalShrapnelConfig({ gravity: 0 })).toMatchObject({ gravity: 0 });
    expect(createOrbitalShrapnelConfig({ debrisSize: 5 })).toMatchObject({ debrisSize: 5 });
    expect(() => createOrbitalShrapnelConfig({ debrisSize: 5.05 })).toThrow('outside its supported range');
    expect(() => createOrbitalShrapnelConfig({
      gravity: -50
    })).toThrow('outside its supported range');
  });
  it('seeds aspect-correct circular orbital velocity', () => {
    const aspect = 16 / 9;
    const gravity = orbitalGravityWorld(1850);
    const orbit = stableOrbitalVelocity(0.6 * aspect, 0, aspect, gravity);
    expect(orbit.vx).toBeCloseTo(0, 8);
    expect(orbit.vy).toBeCloseTo(orbit.speed, 8);
    expect(orbit.speed).toBeCloseTo(Math.sqrt((gravity / (0.6 * 0.6 + 0.075)) * 0.6), 8);

    const diagonal = stableOrbitalVelocity(0.4 * aspect, 0.4, aspect, gravity);
    const radialDot = (0.4 / Math.hypot(0.4, 0.4)) * (diagonal.vx / aspect)
      + (0.4 / Math.hypot(0.4, 0.4)) * diagonal.vy;
    expect(radialDot).toBeCloseTo(0, 8);
  });
  it('scales asteroid launches from the local orbital speed', () => {
    const gravity = orbitalGravityWorld(1850);
    const short = asteroidLaunchVelocity(0.7, 0, 0.1, 0, gravity, 0.14, 2.3);
    const long = asteroidLaunchVelocity(0.7, 0, 0.5, 0, gravity, 0.14, 2.3);
    expect(long.vx).toBeGreaterThan(short.vx);
    expect(short.vy).toBe(0);
    expect(Math.hypot(long.vx, long.vy)).toBeLessThanOrEqual(2.3 * 0.96);
  });
  it('deactivates debris that crosses the aspect-correct planet boundary', () => {
    expect(ORBITAL_STEP_SHADER).toContain('float nextR=diskLength(position.xy)');
    expect(ORBITAL_STEP_SHADER).toContain('if(nextR<uPlanetRadius)');
    expect(ORBITAL_STEP_SHADER).toContain('velocity.z=0.0;');
    expect(ORBITAL_STEP_SHADER).not.toContain('reflect(');
    expect(ORBITAL_STEP_SHADER).not.toContain('uPlanetBounce');
  });
  it('scales each add deposit against the actual particle capacity', () => {
    expect(debrisSpawnCount(65_536, 0.005)).toBe(328);
    expect(debrisSpawnCount(65_536, 0.035)).toBe(2_294);
    expect(debrisSpawnCount(65_536, 0.12)).toBe(7_864);
    expect(debrisSpawnCount(16_384, 2)).toBe(16_384);
  });
});
