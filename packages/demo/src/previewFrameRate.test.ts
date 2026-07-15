import { describe, expect, it } from 'vitest';
import { AutoPreviewFrameRateGovernor, readPreviewFrameRateMode } from './previewFrameRate.js';

describe('AutoPreviewFrameRateGovernor', () => {
  it('reduces the shared rate after sustained aggregate slowdown', () => {
    const governor = new AutoPreviewFrameRateGovernor();
    expect(governor.observe(44)).toBe(60);
    expect(governor.observe(44)).toBe(45);
    expect(governor.observe(31)).toBe(45);
    expect(governor.observe(31)).toBe(30);
  });

  it('raises the shared rate only after sustained recovery', () => {
    const governor = new AutoPreviewFrameRateGovernor(30);
    expect(governor.observe(58)).toBe(30);
    expect(governor.observe(58)).toBe(30);
    expect(governor.observe(58)).toBe(45);
    expect(governor.observe(58)).toBe(45);
    expect(governor.observe(58)).toBe(45);
    expect(governor.observe(58)).toBe(60);
  });
});

describe('readPreviewFrameRateMode', () => {
  it('sanitizes persisted frame-rate modes', () => {
    expect(readPreviewFrameRateMode('30')).toBe(30);
    expect(readPreviewFrameRateMode('45')).toBe(45);
    expect(readPreviewFrameRateMode('60')).toBe(60);
    expect(readPreviewFrameRateMode('invalid')).toBe('auto');
  });
});
