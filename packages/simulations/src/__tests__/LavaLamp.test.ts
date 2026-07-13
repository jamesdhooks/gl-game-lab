import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { createLavaLampConfig, LAVA_LAMP_DEFAULTS, LAVA_LAMP_STYLE_MANIFEST, LavaLampModel, lavaLampDefinition, type LavaLampTuning } from '../index.js';
describe('Lava Lamp', () => {
  it('registers add/remove, Ultra, ten styles, and attribution', () => {
    const definition = new ExperienceRegistry().register(lavaLampDefinition).get('lava-lamp');
    expect(definition.modes?.map(mode => mode.id)).toEqual([
      'add',
      'remove'
    ]);
    expect(LAVA_LAMP_STYLE_MANIFEST.styles).toHaveLength(10);
    expect(definition.attributions?.[0]?.author).toBe('Matt Bryant');
  });
  it('simulates a bounded thermal wax population', () => {
    const model = new LavaLampModel(), config = createLavaLampConfig();
    model.reset(800, 600, 24, tuningFrom(config), 42);
    expect(model.count).toBe(24);
    expect(model.temperatures.slice(0, 24).some(value => value > 0.5)).toBe(true);
  });
  it('adds one pinned particle that grows until release', () => {
    const model = new LavaLampModel(), config = createLavaLampConfig(), tuning = tuningFrom(config);
    model.reset(800, 600, 0, tuning, 42);
    const index = model.beginHeld(320, 480, tuning);
    const initialRadius = model.world.radii[index] ?? 0;
    expect(index).toBe(0);
    expect(model.count).toBe(1);
    expect(model.world.inverseMasses[index]).toBe(0);
    expect(model.updateHeld(index, 360, 430, 1, Number(config.inputThermalRate), tuning, Number(config.inputRadius))).toBe(true);
    expect(model.world.radii[index]).toBeGreaterThan(initialRadius);
    expect(Array.from(model.world.positions.slice(0, 2))).toEqual([360, 430]);
    expect(model.releaseHeld(index, 42, -96)).toBe(true);
    expect(model.world.inverseMasses[index]).toBe(1);
    expect(Array.from(model.world.velocities.slice(0, 2))).toEqual([42, -96]);
  });
  it('preserves maintained settings and coherent turbulence bounds', () => {
    expect(createLavaLampConfig()).toEqual(LAVA_LAMP_DEFAULTS);
    expect(() => createLavaLampConfig({
      turbulence: 5
    })).toThrow('outside its supported range');
  });
});
function tuningFrom(config: ReturnType<typeof createLavaLampConfig>): LavaLampTuning {
  return {
    gravity: Number(config.gravity),
    buoyancy: Number(config.buoyancy),
    thermalDrive: Number(config.thermalDrive),
    heatRegion: Number(config.heatRegion),
    coolRegion: Number(config.coolRegion),
    heatRate: Number(config.heatRate),
    coolRate: Number(config.coolRate),
    heatTransfer: Number(config.heatTransfer),
    turbulence: Number(config.turbulence),
    verticalTurbulence: Number(config.verticalTurbulence),
    waxViscosity: Number(config.waxViscosity),
    surfaceTension: Number(config.surfaceTension),
    clumping: Number(config.clumping),
    substeps: Number(config.substeps),
    maxParticles: Number(config.maxParticles),
    blobRadius: Number(config.blobRadius)
  };
}
