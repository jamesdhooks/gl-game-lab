export interface DrawPathPoint {
  readonly x: number;
  readonly y: number;
}

export type DrawPathPreviewShape = 'open' | 'closed' | 'endpoints';

export interface PackedDrawPathPreview {
  readonly count: number;
  readonly segments: Float32Array;
  readonly styles: Float32Array;
}

export function packDrawPathPreview(
  paths: Iterable<readonly DrawPathPoint[]>,
  shape: DrawPathPreviewShape,
  halfWidth = 0.75
): PackedDrawPathPreview {
  const drawable = [...paths].filter(path => path.length > 1);
  const count = drawable.reduce((total, path) => {
    if (shape === 'endpoints') return total + 1;
    return total + path.length - 1 + (shape === 'closed' && path.length > 2 ? 1 : 0);
  }, 0);
  const segments = new Float32Array(count * 4), styles = new Float32Array(count * 2);
  let cursor = 0;
  const emit = (start: DrawPathPoint, end: DrawPathPoint) => {
    const geometry = cursor * 4, style = cursor * 2;
    segments[geometry] = start.x;
    segments[geometry + 1] = start.y;
    segments[geometry + 2] = end.x;
    segments[geometry + 3] = end.y;
    styles[style] = halfWidth;
    styles[style + 1] = 1;
    cursor += 1;
  };
  for (const path of drawable) {
    if (shape === 'endpoints') {
      emit(path[0] as DrawPathPoint, path[path.length - 1] as DrawPathPoint);
      continue;
    }
    for (let index = 1; index < path.length; index += 1)
      emit(path[index - 1] as DrawPathPoint, path[index] as DrawPathPoint);
    if (shape === 'closed' && path.length > 2)
      emit(path[path.length - 1] as DrawPathPoint, path[0] as DrawPathPoint);
  }
  return { count: cursor, segments, styles };
}
