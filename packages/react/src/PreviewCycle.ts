import { useEffect, useRef, useState } from 'react';
import {
  resolvePreviewLaunch,
  type ExperienceDefinition,
  type ExperiencePreviewCycleRequest,
  type ExperiencePreviewProfile,
  type ResolvedPreviewLaunch,
} from '@hooksjam/gl-game-lab-engine';

export const PREVIEW_CYCLE_MIN_MS = 9_000;
export const PREVIEW_CYCLE_VARIABILITY_MS = 2_000;

// Backwards-compatible names for consumers that treated every cycle as a remount.
export const PREVIEW_RESTART_BASE_MS = PREVIEW_CYCLE_MIN_MS;
export const PREVIEW_RESTART_JITTER_MS = PREVIEW_CYCLE_VARIABILITY_MS;

export interface PreviewCycleOptions {
  readonly enabled: boolean;
  readonly experienceId: string;
  readonly seed: number;
  readonly revision: string;
  readonly onCycle: (request: ExperiencePreviewCycleRequest) => void;
}

export function usePreviewCycle({ enabled, experienceId, seed, revision, onCycle }: PreviewCycleOptions): void {
  const [generation, setGeneration] = useState(0);
  const onCycleRef = useRef(onCycle);
  onCycleRef.current = onCycle;

  useEffect(() => {
    setGeneration(0);
  }, [experienceId, revision, seed]);

  useEffect(() => {
    if (!enabled) return;
    const timeout = window.setTimeout(() => {
      const nextGeneration = generation + 1;
      onCycleRef.current({
        generation: nextGeneration,
        seed: previewCycleSeed(seed, nextGeneration),
      });
      setGeneration(nextGeneration);
    }, previewCycleDelay(experienceId, seed, generation));
    return () => window.clearTimeout(timeout);
  }, [enabled, experienceId, generation, revision, seed]);
}

export function previewCycleDelay(experienceId: string, seed: number, generation = 0): number {
  let hash = (seed ^ Math.imul(generation + 1, 0x9e3779b1)) >>> 0;
  for (let index = 0; index < experienceId.length; index += 1) {
    hash = Math.imul(hash ^ experienceId.charCodeAt(index), 16777619) >>> 0;
  }
  return PREVIEW_CYCLE_MIN_MS + hash % (PREVIEW_CYCLE_VARIABILITY_MS + 1);
}

export function previewRestartDelay(experienceId: string, seed: number): number {
  return previewCycleDelay(experienceId, seed);
}

export function previewCycleSeed(seed: number, generation: number): number {
  if (generation <= 0) return seed >>> 0;
  let value = (seed ^ Math.imul(generation, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

export function resolvePreviewCycleLaunch(
  definition: ExperienceDefinition,
  profile: ExperiencePreviewProfile | undefined,
  sessionSeed: number,
  generation: number,
): ResolvedPreviewLaunch {
  const anchor = resolvePreviewLaunch(definition, profile, sessionSeed);
  if (generation <= 0) return anchor;
  return resolvePreviewLaunch(definition, profile, previewCycleSeed(anchor.seed, generation));
}
