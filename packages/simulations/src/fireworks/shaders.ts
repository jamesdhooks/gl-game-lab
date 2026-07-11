export const FIREWORKS_STEP_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform ivec2 uStateSize;
uniform int uCapacity;
uniform float uDt;
uniform float uGravity;
uniform float uDamping;
uniform float uSpawnActive;
uniform int uSpawnStart;
uniform int uSpawnCount;
uniform vec2 uSpawnPosition;
uniform vec2 uSpawnVelocity;
uniform float uSpawnKind;
uniform float uSpawnSeed;
uniform float uSpawnPaletteSeed;
uniform float uSpawnPower;
uniform float uSpawnLife;
uniform float uBurstChaos;

float hash(float value) { return fract(sin(value * 91.3458 + 17.123) * 47453.5453); }

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  int id = cell.y * uStateSize.x + cell.x;
  vec4 position = texelFetch(uPositionState, cell, 0);
  vec4 velocity = texelFetch(uVelocityState, cell, 0);
  if (id >= uCapacity) { outPosition = position; outVelocity = velocity; return; }
  int relative = (id - uSpawnStart + uCapacity) % uCapacity;
  if (uSpawnActive > 0.5 && relative < uSpawnCount) {
    float seed = uSpawnSeed + float(relative) * 1.6180339;
    float angle = hash(seed) * 6.2831853;
    float radial = mix(0.52, 1.25, hash(seed + 4.7));
    float asymmetry = mix(1.0 - uBurstChaos * 0.32, 1.0 + uBurstChaos * 0.38, hash(seed + 9.1));
    vec2 burst = vec2(cos(angle), sin(angle)) * uSpawnPower * radial * asymmetry;
    position = vec4(uSpawnPosition, uSpawnLife * mix(0.72, 1.2, hash(seed + 2.2)), seed);
    velocity = vec4(uSpawnVelocity + (uSpawnKind > 1.5 ? burst : vec2(0.0)), uSpawnKind, uSpawnPaletteSeed + hash(seed + 7.0) * 31.0);
  } else if (position.z > 0.0) {
    velocity.y += uGravity * uDt;
    float drag = exp(-max(0.0, uDamping) * uDt);
    velocity.xy *= drag;
    position.xy += velocity.xy * uDt;
    position.z -= uDt;
  }
  outPosition = position;
  outVelocity = velocity;
}`;

export const FIREWORKS_POINT_VERTEX_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform ivec2 uStateSize;
uniform int uParticleCapacity;
uniform vec2 uCanvasSize;
uniform float uParticleSize;
uniform float uSizeVariability;
out float vLife;
flat out float vSeed;
flat out float vKind;
void main() {
  int id = gl_VertexID;
  ivec2 cell = ivec2(id % uStateSize.x, id / uStateSize.x);
  vec4 position = texelFetch(uPositionState, cell, 0);
  vec4 velocity = texelFetch(uVelocityState, cell, 0);
  if (id >= uParticleCapacity || position.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; vLife = 0.0; vSeed = 0.0; vKind = 0.0; return;
  }
  vec2 clip = vec2(position.x / uCanvasSize.x * 2.0 - 1.0, 1.0 - position.y / uCanvasSize.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  float variance = 1.0 + (fract(sin(position.w * 71.7) * 43758.5) * 2.0 - 1.0) * uSizeVariability;
  gl_PointSize = max(1.0, uParticleSize * variance * (velocity.z < 1.5 ? 2.4 : 1.0));
  vLife = position.z; vSeed = velocity.w; vKind = velocity.z;
}`;

export const FIREWORKS_POINT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vLife;
flat in float vSeed;
flat in float vKind;
out vec4 outColor;
uniform vec3 uPalette[8];
uniform int uPaletteCount;
uniform float uCrackle;
float hash(float v) { return fract(sin(v * 31.17) * 43758.5453); }
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  int index = int(floor(hash(vSeed) * float(max(1, uPaletteCount)))) % max(1, uPaletteCount);
  vec3 color = uPalette[index];
  float core = exp(-d * (vKind < 1.5 ? 2.0 : 4.5));
  float flicker = mix(0.72, 1.3, hash(vSeed + floor(vLife * 24.0))) * max(0.25, uCrackle);
  float alpha = smoothstep(1.0, 0.1, d) * min(1.0, vLife * 2.0);
  outColor = vec4(color * core * flicker, alpha);
}`;
