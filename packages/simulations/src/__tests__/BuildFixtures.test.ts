import { describe, expect, it } from 'vitest';
import { createBuildFixture, packBuildFixtures, sampleBuildFixture } from '../BuildFixtures.js';

describe('Build fixtures', () => {
  it('creates circles for taps and capsules for drags', () => {
    expect(createBuildFixture([{ x: 4, y: 7 }], 6)).toMatchObject({ ax: 4, ay: 7, bx: 4, by: 7, radius: 6 });
    expect(createBuildFixture([{ x: 4, y: 7 }, { x: 80, y: 30 }], 6)).toMatchObject({ ax: 4, ay: 7, bx: 80, by: 30, radius: 6 });
  });

  it('packs circles as degenerate capsule segments', () => {
    const fixture = createBuildFixture([{ x: 12, y: 18 }], 9);
    expect(fixture).toBeDefined();
    const packed = packBuildFixtures(fixture ? [fixture] : []);
    expect([...packed.segments]).toEqual([12, 18, 12, 18]);
    expect(packed.styles[0]).toBe(9);
    expect(packed.styles[1]).toBeCloseTo(0.8);
  });

  it('samples only hidden collision circles along a straight capsule axis', () => {
    const fixture = createBuildFixture([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10);
    const samples = fixture ? sampleBuildFixture(fixture) : [];
    expect(samples.length).toBeGreaterThan(2);
    expect(samples.every(point => point.y === 0)).toBe(true);
    expect(samples.at(-1)).toEqual({ x: 100, y: 0 });
  });
});
