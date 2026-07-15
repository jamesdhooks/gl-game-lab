import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createParticleFluidConfig, PARTICLE_FLUID_DEFAULTS, PARTICLE_FLUID_STYLE_MANIFEST, particleFluidDefinition } from '../index.js';
import { PARTICLE_FLUID_FRAGMENT_SHADER, PARTICLE_FLUID_STEP_SHADER, PARTICLE_FLUID_VERTEX_SHADER } from '../particle-fluid/shaders.js';
import { particleFluidFieldSize, particleFluidFlowScale, particleFluidSeedPosition, particleFluidUvToSimulation } from '../particle-fluid/motion.js';
describe('Particle Fluid', () => {
  it('registers ten materially distinct styles and attribution', () => {
    const definition = new ExperienceRegistry().register(particleFluidDefinition).get('particle-fluid');
    expect(PARTICLE_FLUID_STYLE_MANIFEST.styles).toHaveLength(10);
    expect(new Set(PARTICLE_FLUID_STYLE_MANIFEST.styles.map(style => style.background)).size).toBeGreaterThan(7);
    expect(definition.attributions?.[0]?.author).toBe('Haxiomic');
  });
  it('preserves GPU particle and flow settings', () => {
    expect(createParticleFluidConfig()).toEqual(PARTICLE_FLUID_DEFAULTS);
    expect(createParticleFluidConfig({
      maxParticles: 4194304
    }).maxParticles).toBe(4194304);
  });
  it('validates containment solver settings', () => {
    expect(() => createParticleFluidConfig({
      forceRadius: 0.5
    })).toThrow('outside its supported range');
    expect(() => createParticleFluidConfig({
      renderStyle: 'ultra'
    })).toThrow('Unknown Particle Fluid');
  });
  it('keeps the source speed gradient and persistent segment pulse in the GPU shader', () => {
    expect(PARTICLE_FLUID_VERTEX_SHADER).toContain('distanceToSegment');
    expect(PARTICLE_FLUID_VERTEX_SHADER).toContain('uPulseSegment');
    expect(PARTICLE_FLUID_VERTEX_SHADER).toContain('mix(uSlowColor,uFastColor,x)');
    expect(PARTICLE_FLUID_FRAGMENT_SHADER).not.toContain('gl_PointCoord');
  });
  it('uses the legacy clip-space particle state and source-space velocity mapping', () => {
    expect(particleFluidSeedPosition(0, 4)).toEqual([-0.5, -0.5]);
    expect(particleFluidSeedPosition(3, 4)).toEqual([0.5, 0.5]);
    expect(particleFluidFlowScale(32, 2, 1)).toEqual([1 / 64, 1 / 32]);
    expect(particleFluidUvToSimulation(1, 0, 2, 1)).toEqual([2, -1]);
    expect(PARTICLE_FLUID_STEP_SHADER).toContain('(p.xy+1.)*.5');
    expect(PARTICLE_FLUID_STEP_SHADER).toContain('*uFlowScale');
    expect(PARTICLE_FLUID_VERTEX_SHADER).toContain('vec2 clip=p.xy');
  });
  it('derives field dimensions from both viewport axes without a full-scene resolution ceiling', () => {
    expect(particleFluidFieldSize(1920, 1080, 4, false)).toEqual([480, 270]);
    expect(particleFluidFieldSize(384, 384, 4, true)).toEqual([96, 96]);
    expect(particleFluidFieldSize(2048, 1024, 1, true)).toEqual([128, 64]);
  });
});
