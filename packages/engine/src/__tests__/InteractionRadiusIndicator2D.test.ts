import { describe, expect, it } from 'vitest';
import { InteractionRadiusIndicator2D } from '../InteractionRadiusIndicator2D.js';
import type { ParticleBatch2D } from '../Render2D.js';

describe('InteractionRadiusIndicator2D', () => {
  it('submits active pointers as flat translucent discs with the requested radius', () => {
    const batches: ParticleBatch2D[] = [];
    const indicator = new InteractionRadiusIndicator2D('test.interaction-radius');
    indicator.submit({ submitParticles: batch => batches.push(batch) }, [
      { x: 12, y: 24, buttons: 1 },
      { x: 90, y: 80, buttons: 0 },
      { x: 48, y: 60, buttons: 1 },
    ], 56);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      id: 'test.interaction-radius',
      count: 2,
      shading: 'flat',
      blend: 'alpha',
      paletteMode: 'indexed',
    });
    expect(Array.from(batches[0]?.positions.subarray(0, 4) ?? [])).toEqual([12, 24, 48, 60]);
    expect(Array.from(batches[0]?.radii.subarray(0, 2) ?? [])).toEqual([56, 56]);
    expect(batches[0]?.palette[0]?.[3]).toBeLessThan(0.25);
  });

  it('does not submit hover-only pointers and validates the radius', () => {
    const batches: ParticleBatch2D[] = [];
    const indicator = new InteractionRadiusIndicator2D('test.interaction-radius');
    const renderer = { submitParticles: (batch: ParticleBatch2D) => batches.push(batch) };

    indicator.submit(renderer, [{ x: 12, y: 24, buttons: 0 }], 56);
    expect(batches).toHaveLength(0);
    expect(() => indicator.submit(renderer, [{ x: 12, y: 24, buttons: 1 }], 0)).toThrow('radius');
  });
});
