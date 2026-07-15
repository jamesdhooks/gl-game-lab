export function particleFluidSeedPosition(index: number, capacity: number): readonly [number, number] {
  const grid = Math.ceil(Math.sqrt(capacity));
  const column = index % grid;
  const row = Math.floor(index / grid);
  return [((column + 0.5) / grid) * 2 - 1, ((row + 0.5) / grid) * 2 - 1];
}

export function particleFluidFlowScale(cellSize: number, aspect: number, simulationScale: number): readonly [number, number] {
  const safeCellSize = Math.max(1, cellSize);
  const safeAspect = Math.max(0.0001, aspect);
  const safeScale = Math.max(0.25, simulationScale);
  return [1 / (safeCellSize * safeAspect * safeScale), 1 / (safeCellSize * safeScale)];
}

export function particleFluidUvToSimulation(
  x: number,
  y: number,
  aspect: number,
  simulationScale: number,
): readonly [number, number] {
  return [(x * 2 - 1) * aspect * simulationScale, (y * 2 - 1) * simulationScale];
}

export function particleFluidFieldSize(
  viewportWidth: number,
  viewportHeight: number,
  fieldCellSize: number,
  preview: boolean,
): readonly [number, number] {
  const cell = Math.max(1, fieldCellSize);
  const width = Math.max(8, Math.round(viewportWidth / cell));
  const height = Math.max(8, Math.round(viewportHeight / cell));
  if (!preview) return [width, height];
  const scale = Math.min(1, 128 / Math.max(width, height));
  return [Math.max(8, Math.round(width * scale)), Math.max(8, Math.round(height * scale))];
}
