import type { Quaternion } from './Quaternion.js';
import type { Vec3 } from './Vec3.js';

export type Mat4 = Float32Array;

export function mat4Identity(output: Mat4 = new Float32Array(16)): Mat4 {
  output.fill(0);
  output[0] = 1;
  output[5] = 1;
  output[10] = 1;
  output[15] = 1;
  return output;
}

export function mat4FromTransform(
  translation: Vec3,
  rotation: Quaternion,
  scale: Vec3,
  output: Mat4 = new Float32Array(16),
): Mat4 {
  const x2 = rotation.x + rotation.x;
  const y2 = rotation.y + rotation.y;
  const z2 = rotation.z + rotation.z;
  const xx = rotation.x * x2;
  const xy = rotation.x * y2;
  const xz = rotation.x * z2;
  const yy = rotation.y * y2;
  const yz = rotation.y * z2;
  const zz = rotation.z * z2;
  const wx = rotation.w * x2;
  const wy = rotation.w * y2;
  const wz = rotation.w * z2;

  output[0] = (1 - (yy + zz)) * scale.x;
  output[1] = (xy + wz) * scale.x;
  output[2] = (xz - wy) * scale.x;
  output[3] = 0;
  output[4] = (xy - wz) * scale.y;
  output[5] = (1 - (xx + zz)) * scale.y;
  output[6] = (yz + wx) * scale.y;
  output[7] = 0;
  output[8] = (xz + wy) * scale.z;
  output[9] = (yz - wx) * scale.z;
  output[10] = (1 - (xx + yy)) * scale.z;
  output[11] = 0;
  output[12] = translation.x;
  output[13] = translation.y;
  output[14] = translation.z;
  output[15] = 1;
  return output;
}

export function mat4Multiply(left: Mat4, right: Mat4, output: Mat4 = new Float32Array(16)): Mat4 {
  const values = output === left || output === right ? new Float32Array(16) : output;
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += left[index * 4 + row]! * right[column * 4 + index]!;
      }
      values[column * 4 + row] = value;
    }
  }
  if (values !== output) output.set(values);
  return output;
}
