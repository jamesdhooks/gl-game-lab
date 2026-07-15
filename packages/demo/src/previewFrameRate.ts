import { useEffect, useRef, useState } from 'react';

export type PreviewFrameRate = 30 | 45 | 60;
export type PreviewFrameRateMode = 'auto' | PreviewFrameRate;

const SAMPLE_WINDOW_MS = 2_000;
const WARMUP_MS = 2_000;

export class AutoPreviewFrameRateGovernor {
  private poorWindows = 0;
  private healthyWindows = 0;

  constructor(private frameRate: PreviewFrameRate = 60) {}

  get current(): PreviewFrameRate {
    return this.frameRate;
  }

  observe(measuredFps: number): PreviewFrameRate {
    const downThreshold = this.frameRate === 60 ? 50 : this.frameRate === 45 ? 37 : 0;
    const upThreshold = this.frameRate === 30 ? 42 : this.frameRate === 45 ? 54 : Number.POSITIVE_INFINITY;

    if (this.frameRate > 30 && measuredFps < downThreshold) {
      this.poorWindows += 1;
      this.healthyWindows = 0;
      if (this.poorWindows >= 2) {
        this.frameRate = this.frameRate === 60 ? 45 : 30;
        this.poorWindows = 0;
      }
      return this.frameRate;
    }

    if (this.frameRate < 60 && measuredFps > upThreshold) {
      this.healthyWindows += 1;
      this.poorWindows = 0;
      if (this.healthyWindows >= 3) {
        this.frameRate = this.frameRate === 30 ? 45 : 60;
        this.healthyWindows = 0;
      }
      return this.frameRate;
    }

    this.poorWindows = 0;
    this.healthyWindows = 0;
    return this.frameRate;
  }
}

export function useAutoPreviewFrameRate(enabled: boolean): PreviewFrameRate {
  const [frameRate, setFrameRate] = useState<PreviewFrameRate>(60);
  const governorRef = useRef(new AutoPreviewFrameRateGovernor());

  useEffect(() => {
    if (!enabled) {
      governorRef.current = new AutoPreviewFrameRateGovernor();
      setFrameRate(60);
      return;
    }

    let frameHandle = 0;
    let frames = 0;
    let windowStartedAt = performance.now() + WARMUP_MS;
    const sample = (timestamp: number): void => {
      if (document.visibilityState !== 'visible') {
        frames = 0;
        windowStartedAt = timestamp + WARMUP_MS;
        frameHandle = window.requestAnimationFrame(sample);
        return;
      }
      if (timestamp < windowStartedAt) {
        frameHandle = window.requestAnimationFrame(sample);
        return;
      }
      frames += 1;
      const elapsed = timestamp - windowStartedAt;
      if (elapsed >= SAMPLE_WINDOW_MS) {
        const measuredFps = frames / (elapsed / 1_000);
        setFrameRate(governorRef.current.observe(measuredFps));
        frames = 0;
        windowStartedAt = timestamp;
      }
      frameHandle = window.requestAnimationFrame(sample);
    };
    frameHandle = window.requestAnimationFrame(sample);
    return () => { window.cancelAnimationFrame(frameHandle); };
  }, [enabled]);

  return frameRate;
}

export function readPreviewFrameRateMode(value: string | null): PreviewFrameRateMode {
  if (value === '30') return 30;
  if (value === '45') return 45;
  if (value === '60') return 60;
  return 'auto';
}
