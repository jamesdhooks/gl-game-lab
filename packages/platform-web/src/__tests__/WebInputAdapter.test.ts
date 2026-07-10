import { describe, expect, it } from 'vitest';
import { normalizePointerCoordinates } from '../index.js';

describe('normalizePointerCoordinates', () => {
  it('maps browser client coordinates into logical game coordinates', () => {
    expect(normalizePointerCoordinates(110, 70, {
      left: 10,
      top: 20,
      width: 200,
      height: 100,
    }, {
      width: 800,
      height: 400,
    })).toEqual({ x: 400, y: 200 });
  });

  it('rejects zero-sized or invalid browser bounds', () => {
    expect(() => normalizePointerCoordinates(0, 0, {
      left: 0,
      top: 0,
      width: 0,
      height: 20,
    }, { width: 20, height: 20 })).toThrow('bounds');
  });
});
