import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createFluidTankConfig, FLUID_TANK_DEFAULTS, FLUID_TANK_STYLE_MANIFEST, fluidTankDefinition, velocityFromScreenDelta } from '../index.js';
describe('Fluid Tank', () => {
  it('registers inject and stir with the maintained fluid styles', () => {
    const definition = new ExperienceRegistry().register(fluidTankDefinition).get('fluid-tank');
    expect(definition.modes?.map(mode => mode.id)).toEqual([
      'inject',
      'stir'
    ]);
    expect(FLUID_TANK_STYLE_MANIFEST.styles).toHaveLength(12);
    expect(definition.attributions?.[0]?.author).toBe('Pavel Dobryakov');
  });
  it('preserves solver, display, and initialization settings', () => {
    expect(createFluidTankConfig()).toEqual(FLUID_TANK_DEFAULTS);
    expect(createFluidTankConfig({
      renderStyle: 'image',
      initImageUrl: 'https://example.com/image.png'
    }).initImageUrl).toContain('example.com');
  });
  it('validates pressure and initialization bounds', () => {
    expect(() => createFluidTankConfig({
      pressureIterations: 4
    })).toThrow('outside its supported range');
    expect(() => createFluidTankConfig({
      renderStyle: 'smoke'
    })).toThrow('Unknown Fluid Tank');
  });
  it('converts pointer motion into simulation-cell velocity and caps extreme motion', () => {
    expect(velocityFromScreenDelta(20, -10, 400, 200, 200, 100)).toEqual({ dx: 10, dy: -5 });
    const capped = velocityFromScreenDelta(400, 200, 400, 200, 200, 100);
    expect(Math.hypot(capped.dx, capped.dy)).toBeCloseTo(36, 5);
  });
});
