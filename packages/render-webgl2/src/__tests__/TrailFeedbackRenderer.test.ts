import { describe, expect, it } from 'vitest';
import { normalizeTrailFeedbackOptions } from '../TrailFeedbackRenderer.js';

describe('normalizeTrailFeedbackOptions', () => {
  it('provides persistent-trail defaults', () => {
    expect(normalizeTrailFeedbackOptions()).toEqual({ fade: 0.932, bloom: 1.82 });
  });

  it('validates feedback ranges', () => {
    expect(normalizeTrailFeedbackOptions({ fade: 0.98, bloom: 3 })).toEqual({ fade: 0.98, bloom: 3 });
    expect(() => normalizeTrailFeedbackOptions({ fade: 1.1 })).toThrow('Trail fade');
  });
});
