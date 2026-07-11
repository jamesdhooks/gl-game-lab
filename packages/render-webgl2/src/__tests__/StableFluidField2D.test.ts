import { describe, expect, it } from 'vitest';
import type { FluidSplat2D, StableFluidStepOptions } from '../StableFluidField2D.js';
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
      amount: 1
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
      pressureIterations: 24
    };
    expect(options.pressureIterations).toBe(24);
  });
});
