export interface Entity {
  readonly index: number;
  readonly generation: number;
}

export function entityEquals(left: Entity, right: Entity): boolean {
  return left.index === right.index && left.generation === right.generation;
}

export function assertEntityShape(entity: Entity): void {
  if (!Number.isSafeInteger(entity.index) || entity.index < 0) {
    throw new Error(`Invalid entity index: ${entity.index}`);
  }
  if (!Number.isSafeInteger(entity.generation) || entity.generation < 0) {
    throw new Error(`Invalid entity generation: ${entity.generation}`);
  }
}
