const MAX_FORCE_SEGMENTS = 8;

const SOURCE_FIELD_COMMON = `
precision highp float;
precision highp sampler2D;
uniform vec2 uInvResolution;
uniform float uAspectRatio;
uniform float uSimulationScale;
in vec2 vUv;
out vec4 outColor;

vec2 simFromUv(vec2 uv) {
  return vec2((uv.x * 2.0 - 1.0) * uAspectRatio * uSimulationScale, (uv.y * 2.0 - 1.0) * uSimulationScale);
}

vec2 uvFromSim(vec2 sim) {
  return vec2(sim.x / max(0.0001, uAspectRatio * uSimulationScale) + 1.0, sim.y / max(0.0001, uSimulationScale) + 1.0) * 0.5;
}

float samplePressure(sampler2D pressure, vec2 coord) {
  vec2 cellOffset = vec2(0.0);
  if (coord.x < 0.0) cellOffset.x = 1.0;
  else if (coord.x > 1.0) cellOffset.x = -1.0;
  if (coord.y < 0.0) cellOffset.y = 1.0;
  else if (coord.y > 1.0) cellOffset.y = -1.0;
  return texture(pressure, coord + cellOffset * uInvResolution).x;
}

vec2 sampleVelocity(sampler2D velocity, vec2 coord) {
  vec2 cellOffset = vec2(0.0);
  vec2 multiplier = vec2(1.0);
  if (coord.x < 0.0) { cellOffset.x = 1.0; multiplier.x = -1.0; }
  else if (coord.x > 1.0) { cellOffset.x = -1.0; multiplier.x = -1.0; }
  if (coord.y < 0.0) { cellOffset.y = 1.0; multiplier.y = -1.0; }
  else if (coord.y > 1.0) { cellOffset.y = -1.0; multiplier.y = -1.0; }
  return multiplier * texture(velocity, coord + cellOffset * uInvResolution).xy;
}
`;

export const SOURCE_MAPPED_ADVECTION_SHADER = `#version 300 es
${SOURCE_FIELD_COMMON}
uniform sampler2D uVelocity;
uniform sampler2D uTarget;
uniform float uDt;
uniform float uRdx;
void main() {
  vec2 tracedPos = simFromUv(vUv) - uDt * uRdx * texture(uVelocity, vUv).xy;
  vec2 tracedTexel = uvFromSim(tracedPos) / uInvResolution;
  vec4 st;
  st.xy = floor(tracedTexel - 0.5) + 0.5;
  st.zw = st.xy + 1.0;
  vec2 t = tracedTexel - st.xy;
  st *= uInvResolution.xyxy;
  vec4 tex11 = texture(uTarget, st.xy);
  vec4 tex21 = texture(uTarget, st.zy);
  vec4 tex12 = texture(uTarget, st.xw);
  vec4 tex22 = texture(uTarget, st.zw);
  outColor = mix(mix(tex11, tex21, t.x), mix(tex12, tex22, t.x), t.y);
}`;

export const SOURCE_MAPPED_FORCE_SHADER = `#version 300 es
${SOURCE_FIELD_COMMON}
uniform sampler2D uVelocity;
uniform vec4 uForceSegments[${MAX_FORCE_SEGMENTS}];
uniform vec4 uForceParams[${MAX_FORCE_SEGMENTS}];
uniform int uForceCount;
uniform float uDt;
uniform float uCellSize;
uniform float uVelocityDecay;
uniform float uForceRadius;
uniform float uForceTaper;
uniform float uForceStrength;
uniform float uForceVelocityScale;

vec2 distanceToSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float len = length(ab);
  if (len <= 0.0001) return vec2(length(p - a), 0.0);
  float projection = dot(p - a, ab) / len;
  float fraction = projection / len;
  if (projection < 0.0) return vec2(length(p - a), fraction);
  if (projection > len) return vec2(length(p - b), fraction);
  return vec2(sqrt(max(0.0, dot(p - a, p - a) - projection * projection)), fraction);
}

void main() {
  vec2 v = texture(uVelocity, vUv).xy * uVelocityDecay;
  vec2 p = simFromUv(vUv);
  for (int i = 0; i < ${MAX_FORCE_SEGMENTS}; i += 1) {
    if (i >= uForceCount) break;
    vec4 segment = uForceSegments[i];
    vec2 mouseVelocity = (segment.xy - segment.zw) / max(0.0001, uDt);
    vec2 distanceAndFraction = distanceToSegment(p, segment.xy, segment.zw);
    float projected = 1.0 - clamp(distanceAndFraction.y, 0.0, 1.0) * uForceTaper;
    float influence = exp(-distanceAndFraction.x / uForceRadius) * projected * projected * uForceParams[i].x;
    vec2 targetVelocity = mouseVelocity * uForceVelocityScale * uCellSize * uForceStrength;
    v += (targetVelocity - v) * influence;
  }
  outColor = vec4(v, 0.0, 1.0);
}`;

export const SOURCE_MAPPED_DIVERGENCE_SHADER = `#version 300 es
${SOURCE_FIELD_COMMON}
uniform sampler2D uVelocity;
uniform float uHalfRdx;
void main() {
  vec2 left = sampleVelocity(uVelocity, vUv - vec2(uInvResolution.x, 0.0));
  vec2 right = sampleVelocity(uVelocity, vUv + vec2(uInvResolution.x, 0.0));
  vec2 bottom = sampleVelocity(uVelocity, vUv - vec2(0.0, uInvResolution.y));
  vec2 top = sampleVelocity(uVelocity, vUv + vec2(0.0, uInvResolution.y));
  outColor = vec4(uHalfRdx * ((right.x - left.x) + (top.y - bottom.y)), 0.0, 0.0, 1.0);
}`;

export const SOURCE_MAPPED_PRESSURE_SHADER = `#version 300 es
${SOURCE_FIELD_COMMON}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform float uAlpha;
void main() {
  float left = samplePressure(uPressure, vUv - vec2(uInvResolution.x, 0.0));
  float right = samplePressure(uPressure, vUv + vec2(uInvResolution.x, 0.0));
  float bottom = samplePressure(uPressure, vUv - vec2(0.0, uInvResolution.y));
  float top = samplePressure(uPressure, vUv + vec2(0.0, uInvResolution.y));
  float divergence = texture(uDivergence, vUv).x;
  outColor = vec4((left + right + bottom + top + uAlpha * divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

export const SOURCE_MAPPED_GRADIENT_SHADER = `#version 300 es
${SOURCE_FIELD_COMMON}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform float uHalfRdx;
void main() {
  float left = samplePressure(uPressure, vUv - vec2(uInvResolution.x, 0.0));
  float right = samplePressure(uPressure, vUv + vec2(uInvResolution.x, 0.0));
  float bottom = samplePressure(uPressure, vUv - vec2(0.0, uInvResolution.y));
  float top = samplePressure(uPressure, vUv + vec2(0.0, uInvResolution.y));
  vec2 velocity = texture(uVelocity, vUv).xy;
  outColor = vec4(velocity - uHalfRdx * vec2(right - left, top - bottom), 0.0, 1.0);
}`;
