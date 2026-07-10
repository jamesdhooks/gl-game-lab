export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function vec3Zero(): Vec3 {
  return vec3(0, 0, 0);
}

export function vec3One(): Vec3 {
  return vec3(1, 1, 1);
}
