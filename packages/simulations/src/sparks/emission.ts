export type SparksEmissionMode = 'welding' | 'pinwheel' | 'shower';

export interface SparksEmissionCone {
  readonly direction: number;
  readonly spread: number;
}

/**
 * Resolves command-level emission variation. Per-particle GPU randomness fills
 * the cone; these samples keep consecutive high-density bursts from converging
 * on the same repeated silhouette.
 */
export function resolveSparksEmissionCone(
  mode: SparksEmissionMode,
  chaos: number,
  elapsed: number,
  headingSample: number,
  spreadSample: number,
): SparksEmissionCone {
  const amount = clamp01(chaos);
  if (mode === 'shower') {
    return Object.freeze({ direction: Math.PI * 0.5, spread: Math.PI * 0.12 * amount });
  }
  if (mode === 'pinwheel') {
    return Object.freeze({ direction: -Math.PI * 0.5 + elapsed * 4.8, spread: Math.PI * (0.16 + 1.64 * amount) });
  }
  const heading = -Math.PI * 0.5 + (clamp01(headingSample) * 2 - 1) * Math.PI * 0.58 * amount;
  const baseSpread = Math.PI * (0.16 + 1.08 * amount);
  const spreadVariation = 1 + (0.72 + clamp01(spreadSample) * 0.46 - 1) * amount;
  return Object.freeze({ direction: heading, spread: baseSpread * spreadVariation });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
