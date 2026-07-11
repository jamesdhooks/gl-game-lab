import type { PerformanceTier } from './Diagnostics.js';

export interface QualitySnapshot {
  readonly tier: PerformanceTier;
  readonly targetFps: 30 | 60;
  readonly particleScale: number;
  readonly pixelScale: number;
}

/** Host-controlled recommended quality; explicit stress settings remain content-owned. */
export class AdaptiveQualityService {
  private current: QualitySnapshot = qualityForTier('desktop');

  get snapshot(): QualitySnapshot { return this.current; }
  get tier(): PerformanceTier { return this.current.tier; }

  configureViewport(width: number, height: number, pixelRatio = 1): QualitySnapshot {
    if (![width, height, pixelRatio].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Quality viewport values must be positive');
    const tier: PerformanceTier = Math.min(width, height) <= 640 ? 'mobile' : 'desktop';
    this.current = qualityForTier(tier);
    return this.current;
  }

  setTier(tier: PerformanceTier): QualitySnapshot {
    this.current = qualityForTier(tier);
    return this.current;
  }
}

function qualityForTier(tier: PerformanceTier): QualitySnapshot {
  return tier === 'mobile'
    ? Object.freeze({ tier, targetFps: 30, particleScale: 0.4, pixelScale: 0.75 })
    : Object.freeze({ tier, targetFps: 60, particleScale: 1, pixelScale: 1 });
}
