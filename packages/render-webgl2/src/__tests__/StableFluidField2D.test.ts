import { describe, expect, it } from 'vitest';
import { clearFluidPressureField, type FluidSplat2D, type StableFluidStepOptions } from '../StableFluidField2D.js';
import { FLUID_BOUNDARY_SHADER, FLUID_GRADIENT_SUBTRACT_SHADER, FLUID_PRESSURE_SHADER } from '../FluidTankReferenceShaders.js';
import {
  SOURCE_MAPPED_ADVECTION_SHADER,
  SOURCE_MAPPED_FORCE_SHADER,
  SOURCE_MAPPED_PRESSURE_SHADER,
} from '../SourceMappedFluidShaders.js';
describe('StableFluidField2D contracts', () => {
  it('describes a complete dye and velocity splat', () => {
    const splat: FluidSplat2D = {
      x: 0.5,
      y: 0.5,
      radius: 0.05,
      velocityX: 0.2,
      velocityY: -0.1,
      dye: [
        1,
        0,
        0.5
      ],
      amount: 1,
      previousX: 0.42,
      previousY: 0.48,
      taper: 0.6,
      aspectRatio: 16 / 9,
      strength: 1.55,
      velocityMode: 'target'
    };
    expect(splat.dye).toHaveLength(3);
  });
  it('keeps pressure and persistence explicit in step options', () => {
    const options: StableFluidStepOptions = {
      deltaSeconds: 1 / 60,
      viscosity: 0.2,
      curl: 30,
      velocityDissipation: 0.2,
      dyeDissipation: 1,
      pressureIterations: 24,
      velocitySplatsBeforeProjection: true
    };
    expect(options.pressureIterations).toBe(24);
  });
  it('starts each pressure solve from a neutral field', () => {
    let clears = 0;
    clearFluidPressureField({ clear: () => { clears += 1; } });
    expect(clears).toBe(1);
  });
  it('clamps pressure samples and applies a solid velocity boundary', () => {
    expect(FLUID_PRESSURE_SHADER).toContain('texture(uPressure, clamp(uv, vec2(0.0), vec2(1.0)))');
    expect(FLUID_GRADIENT_SUBTRACT_SHADER).toContain('texture(uPressure, clamp(uv, vec2(0.0), vec2(1.0)))');
    expect(FLUID_PRESSURE_SHADER).not.toContain('return 0.0');
    expect(FLUID_GRADIENT_SUBTRACT_SHADER).not.toContain('return 0.0');
    expect(FLUID_BOUNDARY_SHADER).toContain('velocity.x = 0.0');
    expect(FLUID_BOUNDARY_SHADER).toContain('velocity.y = 0.0');
  });
  it('preserves the source-mapped particle-fluid equations', () => {
    expect(SOURCE_MAPPED_ADVECTION_SHADER).toContain('simFromUv(vUv) - uDt * uRdx * texture(uVelocity, vUv).xy');
    expect(SOURCE_MAPPED_FORCE_SHADER).toContain('v += (targetVelocity - v) * influence');
    expect(SOURCE_MAPPED_FORCE_SHADER).toContain('uForceSegments[8]');
    expect(SOURCE_MAPPED_PRESSURE_SHADER).toContain('uAlpha * divergence');
  });
});
