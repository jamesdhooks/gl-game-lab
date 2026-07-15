import { describe, expect, it } from 'vitest';
import { isSettingOverride } from '../ui/SettingsDrawer.js';

describe('isSettingOverride', () => {
  it('distinguishes preview values from their scene baseline', () => {
    expect(isSettingOverride(8, 8)).toBe(false);
    expect(isSettingOverride('enhanced', 'enhanced')).toBe(false);
    expect(isSettingOverride(false, false)).toBe(false);
    expect(isSettingOverride(9, 8)).toBe(true);
    expect(isSettingOverride('ultra', 'enhanced')).toBe(true);
    expect(isSettingOverride(true, false)).toBe(true);
  });

  it('uses exact value equality for unsaved-setting comparisons', () => {
    expect(isSettingOverride(0.5, 0.5)).toBe(false);
    expect(isSettingOverride(0.51, 0.5)).toBe(true);
    expect(isSettingOverride('warm', 'cool')).toBe(true);
  });
});
