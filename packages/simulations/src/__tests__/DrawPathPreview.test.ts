import { describe, expect, it } from 'vitest';
import { packDrawPathPreview } from '../DrawPathPreview.js';

const path = [
  { x: 10, y: 20 },
  { x: 30, y: 40 },
  { x: 50, y: 60 }
];

describe('draw path preview', () => {
  it('packs an open snake stroke', () => {
    const preview = packDrawPathPreview([path], 'open');
    expect(preview.count).toBe(2);
    expect([...preview.segments]).toEqual([10, 20, 30, 40, 30, 40, 50, 60]);
    expect([...preview.styles]).toEqual([0.75, 1, 0.75, 1]);
  });

  it('closes a soft-body stroke', () => {
    const preview = packDrawPathPreview([path], 'closed');
    expect(preview.count).toBe(3);
    expect([...preview.segments.slice(8)]).toEqual([50, 60, 10, 20]);
  });

  it('reduces a build gesture to its endpoints', () => {
    const preview = packDrawPathPreview([path], 'endpoints');
    expect(preview.count).toBe(1);
    expect([...preview.segments]).toEqual([10, 20, 50, 60]);
  });
});
