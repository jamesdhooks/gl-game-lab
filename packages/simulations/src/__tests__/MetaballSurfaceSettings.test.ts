import { describe, expect, it } from 'vitest';
import { CHAIN_RAIN_SETTINGS } from '../chain-rain/config.js';
import { LAVA_LAMP_SETTINGS } from '../lava-lamp/config.js';
import { METABALL_SPLAT_DENSITY_MAX, relativeMetaballSplatDensity } from '../MetaballSurfaceSettings.js';
import { SOFT_BODY_BLOB_SETTINGS } from '../soft-body-blob/config.js';
import { SPLASH_MPM_SETTINGS } from '../splash-mpm/config.js';
import { WATER_TANK_SETTINGS } from '../water-tank/config.js';

describe('shared density metaball surface settings', () => {
  it('gives every density-metaball scene the same expanded splat-density ceiling', () => {
    for (const settings of [
      WATER_TANK_SETTINGS,
      SPLASH_MPM_SETTINGS,
      LAVA_LAMP_SETTINGS,
      CHAIN_RAIN_SETTINGS,
      SOFT_BODY_BLOB_SETTINGS,
    ]) {
      const setting = settings.find(candidate => candidate.key === 'liquidSplatDensity');
      expect(setting?.type).toBe('number');
      if (setting?.type === 'number') expect(setting.max).toBe(METABALL_SPLAT_DENSITY_MAX);
    }
  });

  it('keeps an authored default neutral while allowing substantially denser splats', () => {
    expect(relativeMetaballSplatDensity(2.1, 2.1)).toBe(1);
    expect(relativeMetaballSplatDensity(METABALL_SPLAT_DENSITY_MAX, 2.1)).toBeCloseTo(3.81, 2);
  });
});
