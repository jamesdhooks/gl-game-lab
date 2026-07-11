import { describe, expect, it } from 'vitest';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';

describe('Ball Pit capture scenarios', () => {
  it('provides ordered deterministic events for every interaction mode', () => {
    expect(ballPitCaptureInputEvents('single').map(({ frameNumber }) => frameNumber)).toEqual([0, 1]);
    expect(ballPitCaptureInputEvents('stream').map(({ frameNumber }) => frameNumber)).toEqual([0, 60]);
    expect(ballPitCaptureInputEvents('interact').map(({ frameNumber }) => frameNumber)).toEqual([60, 70, 80, 90]);
    expect(ballPitCaptureInputEvents('explosion').map(({ frameNumber }) => frameNumber)).toEqual([60, 61]);
    expect(ballPitCaptureInputEvents(undefined)).toEqual([]);
    expect(() => ballPitCaptureInputEvents('missing')).toThrow('Unknown Ball Pit capture scenario');
  });
});
