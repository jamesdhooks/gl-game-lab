import { describe, expect, it, vi } from 'vitest';
import { createSplashMpmConfig, SPLASH_MPM_DEFAULTS, SPLASH_MPM_SETTINGS, splashMpmDefinition, SPLASH_MPM_STYLE_MANIFEST, SplashMpmModel } from '../index.js';
import { resolveSplashSurfaceParameters, selectHeldSplashPointer } from '../splash-mpm/SplashMpmPlugin.js';
import type { SplashMpmTuning } from '../splash-mpm/SplashMpmModel.js';

const BASE_TUNING: SplashMpmTuning = Object.freeze({
  maxParticles: 2048,
  resolution: 64,
  stiffness: 86,
  restDensity: 3.2,
  separation: 0.7,
  viscosity: 0.18,
  flipness: 0.88,
  gravity: 920,
  radius: 4.2,
});

function simulatedHash(overrides: Partial<SplashMpmTuning>): string {
  const tuning = { ...BASE_TUNING, ...overrides };
  const model = new SplashMpmModel();
  model.reset(320, 240, tuning);
  model.seed(320, 240, tuning);
  for (let step = 0; step < 6; step++) model.step(1 / 60, 320, 240, tuning);
  return model.world.stateHash();
}

describe('Splash MPM', () => {
  it('retains modes, styles, and attribution', () => {
    expect(splashMpmDefinition.modes?.map(x => x.id)).toEqual([
      'splash',
      'pour',
      'build'
    ]);
    expect(SPLASH_MPM_STYLE_MANIFEST.styles).toHaveLength(10);
    expect(splashMpmDefinition.attributions?.[0]?.label).toBe('Splash');
  });
  it('runs a particle-grid fluid step', () => {
    const model = new SplashMpmModel(), t = BASE_TUNING;
    model.reset(800, 600, t);
    model.seed(800, 600, t);
    const before = model.count;
    model.pour(400, 80, 12, 20);
    model.splash(400, 300, 80, 17, 200, 0);
    model.step(1 / 60, 800, 600, t);
    expect(model.count).toBeGreaterThanOrEqual(before);
    expect(model.count).toBeLessThanOrEqual(t.maxParticles);
    expect(Number.isFinite(model.world.positions[0])).toBe(true);
  });
  it('does not reconfigure the particle world when capacity and radius are unchanged', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    const configure = vi.spyOn(model.world, 'configure');
    model.configure(BASE_TUNING);
    model.step(1 / 60, 320, 240, BASE_TUNING);
    expect(configure).not.toHaveBeenCalled();
    model.configure({ ...BASE_TUNING, radius: BASE_TUNING.radius + 1 });
    expect(configure).toHaveBeenCalledTimes(1);
  });
  it('validates maintained defaults', () => {
    expect(SPLASH_MPM_SETTINGS.length).toBeGreaterThan(25);
    expect(createSplashMpmConfig()).toEqual(SPLASH_MPM_DEFAULTS);
    expect(() => createSplashMpmConfig({
      resolution: 8
    })).toThrow();
  });
  it('restores legacy initial motion, foam, and segment-based splash input', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    model.seed(320, 240, BASE_TUNING);
    expect(model.world.velocities[0]).toBeGreaterThanOrEqual(28);
    expect(model.world.velocities[0]).toBeLessThanOrEqual(62);
    expect(model.world.velocities[1]).toBe(8);
    expect(model.foam[0]).toBeGreaterThanOrEqual(0.08);
    expect(model.foam[0]).toBeLessThanOrEqual(0.24);

    model.reset(320, 240, BASE_TUNING);
    model.world.addCircle(100, 105, { radius: BASE_TUNING.radius, radiusNoise: 0 });
    model.world.addCircle(220, 180, { radius: BASE_TUNING.radius, radiusNoise: 0 });
    model.splash(120, 100, 30, 17, 40, 0);
    expect(Math.hypot(model.world.velocities[0] ?? 0, model.world.velocities[1] ?? 0)).toBeGreaterThan(0);
    expect(model.foam[0]).toBeGreaterThan(0);
    expect(model.world.velocities[2]).toBe(0);
    expect(model.world.velocities[3]).toBe(0);
  });
  it('uses pointer motion and pour radius when emitting a foamy jet', () => {
    const model = new SplashMpmModel();
    model.reset(320, 240, BASE_TUNING);
    expect(model.pour(120, 40, 24, 34, 8, 4)).toBe(24);
    expect(model.world.velocities[0]).toBeGreaterThan(100);
    expect(model.world.velocities[1]).toBeGreaterThan(40);
    expect(model.foam[0]).toBeGreaterThanOrEqual(0.72);
    const xs = Array.from({ length: model.count }, (_, index) => model.world.positions[index * 2] ?? 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(BASE_TUNING.radius);
  });
  it('makes every particle-grid physics control alter deterministic behavior', () => {
    const variants: readonly [keyof SplashMpmTuning, number, number][] = [
      ['resolution', 32, 256],
      ['stiffness', 18, 180],
      ['restDensity', 1.8, 8],
      ['separation', 0, 10],
      ['viscosity', 0, 0.7],
      ['flipness', 0, 1],
      ['gravity', 80, 1900],
      ['radius', 2, 16],
    ];
    for (const [key, low, high] of variants) {
      expect(simulatedHash({ [key]: low })).not.toBe(simulatedHash({ [key]: high }));
    }
    const capped = new SplashMpmModel();
    capped.reset(320, 240, { ...BASE_TUNING, maxParticles: 512 });
    capped.seed(320, 240, { ...BASE_TUNING, maxParticles: 512 });
    expect(capped.count).toBe(512);
  });
  it('maps every visible surface control to the renderer parameters', () => {
    const baseline = resolveSplashSurfaceParameters(createSplashMpmConfig());
    const variants: Readonly<Record<string, number>> = {
      surfaceSmoothing: 0,
      enhancedQuality: 2,
      enhancedSplatSize: 0.65,
      enhancedDepth: 0,
      enhancedEdge: 0,
      liquidFieldScale: 1,
      liquidSurfaceThreshold: 0.04,
      liquidEdgeTightness: 0.15,
      liquidEdgeSoftness: 0,
      liquidSplatDensity: 0.45,
      liquidParticleRadius: 0.7,
      liquidRefraction: 0,
      liquidGloss: 0,
      liquidFoamStrength: 0,
      liquidBloomStrength: 0,
      liquidHeatShimmer: 0,
      liquidDepthDiffusion: 0,
      opacity: 0.18,
    };
    for (const [key, value] of Object.entries(variants)) {
      expect(resolveSplashSurfaceParameters(createSplashMpmConfig({ [key]: value }))).not.toEqual(baseline);
    }
  });
  it('only treats held pointers as active pour input', () => {
    const hover = { id: 1, buttons: 0 };
    const held = { id: 2, buttons: 1 };
    expect(selectHeldSplashPointer([hover, held])).toBe(held);
    expect(selectHeldSplashPointer([hover])).toBeUndefined();
  });
});
