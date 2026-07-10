export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function quatIdentity(): Quaternion {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatFromZRotation(radians: number): Quaternion {
  const half = radians * 0.5;
  return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
}
