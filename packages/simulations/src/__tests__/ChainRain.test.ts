import { describe, expect, it } from 'vitest';
import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { ConstrainedCircleParticleWorld2D } from '@hooksjam/gl-game-lab-physics-2d';
import { CHAIN_RAIN_DEFAULTS, CHAIN_RAIN_STYLE_MANIFEST, chainRainDefinition, createChainRainConfig } from '../index.js';
import { ChainSegmentPacker, chainRainAutomatedLength, chainRainAutomatedSpawnClearance, chainRainAutomationPolicy, chainRainFixturesOverlap, chainRainPaletteIndex, chainRainWorldCapacity, createChainRainAutomationFixtures, fitChainWithinHorizontalBounds, hasVisibleDynamicChain, offsetChainAboveViewport } from '../chain-rain/ChainRainPlugin.js';
describe('Chain Rain', () => {
  it('registers the maintained modes and ten styles', () => {
    const definition = new ExperienceRegistry().register(chainRainDefinition).get('chain-rain');
    expect(definition.modes?.map(mode => mode.id)).toEqual([
      'draw',
      'build',
      'interact'
    ]);
    expect(CHAIN_RAIN_STYLE_MANIFEST.styles).toHaveLength(10);
  });
  it('preserves maintained settings and validates values', () => {
    expect(createChainRainConfig()).toEqual(CHAIN_RAIN_DEFAULTS);
    expect(() => createChainRainConfig({
      chainLength: 2
    })).toThrow('outside its supported range');
  });
  it('uses reusable dense constraints for snake links', () => {
    const world = new ConstrainedCircleParticleWorld2D(16, 16, {
      gravity: 0
    });
    world.setBounds(600, 400);
    let previous = -1;
    for (let i = 0; i < 8; i += 1) {
      const node = world.addCircle(100 + i * 10, 50);
      if (previous >= 0)
        world.addDistanceConstraint(previous, node);
      previous = node;
    }
    expect(world.count).toBe(8);
    expect(world.constraintCount).toBe(7);
  });
  it('packs enhanced skins as reusable GPU capsule instances with per-snake palette seeds', () => {
    const world = new ConstrainedCircleParticleWorld2D(8, 8, { gravity: 0 });
    world.setBounds(200, 100);
    const indices = [
      world.addCircle(40, 50, { radius: 5 }),
      world.addCircle(80, 35, { radius: 7 }),
      world.addCircle(120, 50, { radius: 6 })
    ];
    const packer = new ChainSegmentPacker();
    const skin = packer.pack([{ indices, fixture: false, seed: 2 }], world);
    expect(skin.count).toBe(6);
    expect(skin.segments[0]).toBe(40);
    expect(skin.segments[1]).toBe(50);
    expect(skin.segments[22]).toBe(120);
    expect(skin.segments[23]).toBe(50);
    expect(skin.styles[0]).toBeCloseTo(5);
    expect(skin.endRadii[0]).toBeCloseTo(5 + 2 / 3);
    expect(skin.styles[2]).toBeCloseTo(5 + 2 / 3);
    expect(skin.endRadii[1]).toBeCloseTo(5 + 4 / 3);
    expect(skin.styles[4]).toBeCloseTo(5 + 4 / 3);
    expect(skin.endRadii[2]).toBeCloseTo(7);
    expect(skin.styles[6]).toBeCloseTo(7);
    expect(skin.endRadii[5]).toBeCloseTo(6);
    expect([...skin.colorSeeds.slice(0, 6)]).toEqual(new Array(6).fill(2));
    expect(packer.pack([{ indices, fixture: false, seed: 2 }], world).segments).toBe(skin.segments);
    expect(packer.pack([{ indices, fixture: false, seed: 2 }], world).endRadii).toBe(skin.endRadii);
  });
  it('starts preview snakes fully above the viewport', () => {
    const points = offsetChainAboveViewport([
      { x: 50, y: -10 },
      { x: 70, y: 15 },
      { x: 90, y: 42 },
    ], 6, 3);
    expect(Math.max(...points.map(point => point.y))).toBe(-30);
    const clearance = chainRainAutomatedSpawnClearance({
      ...CHAIN_RAIN_DEFAULTS,
      nodeRadius: 10,
      nodeVariance: 1.5,
      renderStyle: 'enhanced',
      skinWidth: 2.4,
      skinHighlightWidth: 1.4,
    });
    expect(clearance).toBe(60);
    const thickPoints = offsetChainAboveViewport([
      { x: 20, y: 80 },
      { x: 40, y: 120 },
    ], clearance);
    expect(Math.max(...thickPoints.map(point => point.y))).toBe(-120);
    const fitted = fitChainWithinHorizontalBounds([
      { x: -240, y: -40 },
      { x: 160, y: -20 },
      { x: 560, y: 0 },
    ], 384, 40);
    expect(Math.min(...fitted.map(point => point.x))).toBeCloseTo(40);
    expect(Math.max(...fitted.map(point => point.x))).toBeCloseTo(344);
    expect(fitted.map(point => point.y)).toEqual([-40, -20, 0]);
  });
  it('reports capture readiness only after a dynamic snake reaches the viewport', () => {
    const world = new ConstrainedCircleParticleWorld2D(8, 8, { gravity: 0 });
    const hidden = world.addCircle(80, -20, { radius: 5 });
    const fixture = world.addCircle(40, 40, { radius: 8, inverseMass: 0 });
    const bodies = [
      { indices: [hidden], fixture: false },
      { indices: [fixture], fixture: true },
    ];
    expect(hasVisibleDynamicChain(bodies, world, 200, 100)).toBe(false);
    world.positions[hidden * 2 + 1] = -4;
    expect(hasVisibleDynamicChain(bodies, world, 200, 100)).toBe(true);
  });
  it('keeps play empty and bounds automated snake counts by profile', () => {
    expect(chainRainAutomationPolicy('play')).toBeUndefined();
    expect(chainRainAutomationPolicy(undefined)).toBeUndefined();
    const preview = chainRainAutomationPolicy('preview');
    const demo = chainRainAutomationPolicy('demo');
    expect(preview).toMatchObject({
      initialSnakeCount: 3,
      maximumSnakeCount: 8,
      firstSpawnDelay: 1.1,
      minimumLengthScale: 0.18,
      maximumLengthScale: 0.38,
    });
    expect(demo).toMatchObject({
      initialSnakeCount: 4,
      maximumSnakeCount: 10,
      firstSpawnDelay: 0.9,
      minimumLengthScale: 0.22,
      maximumLengthScale: 0.46,
    });
    expect(chainRainAutomatedLength({ ...CHAIN_RAIN_DEFAULTS, chainLength: 96 }, preview!, 0)).toBe(17);
    expect(chainRainAutomatedLength({ ...CHAIN_RAIN_DEFAULTS, chainLength: 96 }, preview!, 1)).toBe(36);
    expect(chainRainAutomatedLength({ ...CHAIN_RAIN_DEFAULTS, chainLength: 16 }, demo!, 0.5)).toBe(5);
    expect(Array.from({ length: 8 }, (_, index) => chainRainPaletteIndex(2, index))).toEqual([2, 3, 0, 1, 2, 3, 0, 1]);
    expect(chainRainWorldCapacity(CHAIN_RAIN_DEFAULTS, 'preview')).toBe(2048);
    expect(chainRainWorldCapacity(CHAIN_RAIN_DEFAULTS, 'play')).toBe(CHAIN_RAIN_DEFAULTS.maxNodes);
  });
  it('creates a deterministic scatter of automated preview and demo build circles and pills', () => {
    let state = 0x12345678;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const fixtures = createChainRainAutomationFixtures(384, 384, 5, random);
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
    expect(fixtures.length).toBeLessThanOrEqual(4);
    expect(fixtures.some(fixture => fixture.ax === fixture.bx && fixture.ay === fixture.by)).toBe(true);
    expect(fixtures.some(fixture => fixture.ax !== fixture.bx || fixture.ay !== fixture.by)).toBe(true);
    for (const fixture of fixtures) {
      expect(fixture.radius).toBeCloseTo(5.75);
      expect(Math.min(fixture.ax, fixture.bx)).toBeGreaterThanOrEqual(0);
      expect(Math.max(fixture.ax, fixture.bx)).toBeLessThanOrEqual(384);
      expect(Math.min(fixture.ay, fixture.by)).toBeGreaterThanOrEqual(0);
      expect(Math.max(fixture.ay, fixture.by)).toBeLessThanOrEqual(384);
    }
    for (let left = 0; left < fixtures.length; left += 1) {
      for (let right = left + 1; right < fixtures.length; right += 1) {
        expect(chainRainFixturesOverlap(fixtures[left]!, fixtures[right]!)).toBe(false);
      }
    }
  });
});
