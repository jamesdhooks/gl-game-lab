/** Shared authoring ceiling for scenes rendered by DensityMetaballRenderer. */
export const METABALL_SPLAT_DENSITY_MAX = 8;

/**
 * Converts a scene's authored density control into a multiplier while keeping
 * the scene's established default appearance neutral.
 */
export function relativeMetaballSplatDensity(value: number, authoredDefault: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Metaball splat density must be non-negative and finite');
  if (!Number.isFinite(authoredDefault) || authoredDefault <= 0) throw new Error('Metaball authored density must be positive and finite');
  return value / authoredDefault;
}
