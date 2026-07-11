import { describe, expect, it } from 'vitest';
import { parseDemoCaptureOptions } from './captureOptions.js';

describe('parseDemoCaptureOptions', () => {
  it('creates a reproducible default capture request', () => {
    expect(parseDemoCaptureOptions('?capture=1')).toEqual({
      enabled: true,
      frameNumber: 120,
      fixedDeltaSeconds: 1 / 60,
      profile: 'demo',
      seed: 0x51f15e,
      modeId: undefined,
      styleId: undefined,
      scenarioId: undefined,
    });
  });

  it('accepts an explicit capture identity', () => {
    expect(parseDemoCaptureOptions('?capture=1&frame=360&delta=0.008333333333333333&profile=preview&seed=7&mode=stream&style=neon&scenario=stream')).toMatchObject({
      enabled: true,
      frameNumber: 360,
      fixedDeltaSeconds: 1 / 120,
      profile: 'preview',
      seed: 7,
      modeId: 'stream',
      styleId: 'neon',
      scenarioId: 'stream',
    });
  });

  it('rejects ambiguous or unsafe values', () => {
    expect(() => parseDemoCaptureOptions('?capture=1&frame=-1')).toThrow('Capture frame');
    expect(() => parseDemoCaptureOptions('?capture=1&style=../neon')).toThrow('Invalid capture identifier');
  });
});
