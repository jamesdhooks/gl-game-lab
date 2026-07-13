// Adapted from the original GLGameLab Fluid Tank renderer. See docs/attribution.md.

export const FLUID_INIT_DYE_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 resolution;
uniform float seed;
uniform float cellSize;
uniform int initMode;
uniform bool hasInitImage;
uniform sampler2D uInitImage;
uniform vec3 palette[6];
uniform int paletteCount;
uniform float paletteStrength;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.17, 31.71);
    amplitude *= 0.52;
  }

  return value;
}

vec2 voronoiPoint(vec2 cell) {
  float ox = hash(cell + seed * vec2(1.71, 2.43));
  float oy = hash(cell + seed * vec2(4.31, 0.79) + 12.7);
  return 0.18 + 0.64 * vec2(ox, oy);
}

vec3 voronoiCell(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 100.0;
  float d2 = 100.0;
  vec2 winner = cell;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 feature = neighbor + voronoiPoint(cell + neighbor) - f;
      float d = dot(feature, feature);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        winner = cell + neighbor;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }

  float edgeDistance = sqrt(d2) - sqrt(d1);
  float cellId = hash(winner + seed * vec2(1.71, 2.43));
  float accent = hash(winner + seed * vec2(4.31, 0.79) + 12.7);
  float centerShade = 0.86 + 0.20 * smoothstep(0.0, 0.58, sqrt(d1)) + accent * 0.10;
  return vec3(cellId, edgeDistance, centerShade);
}

vec3 paletteColor(float t) {
  if (paletteCount <= 1) return palette[0];
  float scaled = clamp(t, 0.0, 0.999) * float(paletteCount - 1);
  int index = int(floor(scaled));
  float local = fract(scaled);
  vec3 a = palette[0];
  vec3 b = palette[0];
  for (int i = 0; i < 6; i++) {
    if (i == index) a = palette[i];
    if (i == min(index + 1, paletteCount - 1)) b = palette[i];
  }
  return mix(a, b, smoothstep(0.0, 1.0, local));
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  if (initMode == 4) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  if (initMode == 3 && hasInitImage) {
    vec3 imageColor = texture(uInitImage, vUv).rgb;
    float luma = dot(imageColor, vec3(0.2126, 0.7152, 0.0722));
    outColor = vec4(mix(imageColor, imageColor * (1.0 + luma * 0.6), 0.55), 1.0);
    return;
  }

  float aspect = resolution.x / resolution.y;
  float scale = 1.0 / max(cellSize, 0.35);
  vec2 p = vUv * vec2(aspect, 1.0);
  vec2 s1 = vec2(seed * 1.37, seed * 2.11);
  vec2 s2 = vec2(seed * 3.19, seed * 0.73);

  float large = fbm(p * 2.1 * scale + s1);
  float medium = fbm(p * 5.6 * scale + s2);
  float fine = fbm(p * 12.0 * scale - s1 * 0.42);
  float ribbons = 0.5 + 0.5 * sin((p.x * 1.4 * scale - p.y * 0.8 * scale + large * 2.8 + seed * 0.07) * 6.2831853);

  float paletteT = fract(large * 0.76 + medium * 0.31 + ribbons * 0.22 + seed * 0.113);
  if (initMode == 1) {
    vec3 cell = voronoiCell(p * 8.0 * scale + s1);
    paletteT = cell.x;
    large = cell.x;
    medium = 0.62 + 0.28 * hash(vec2(cell.x, seed));
    fine = clamp(cell.z, 0.42, 1.12);
    // Voronoi is only an initialization style. Avoid explicit cell-edge/border
    // marks here, because crisp borders read as a static overlay after the
    // velocity field starts advecting the dye.
    ribbons = 0.48 + 0.18 * hash(vec2(cell.x, seed + 19.0));
  } else if (initMode == 2) {
    large = hash(floor(vUv * resolution / max(1.0, cellSize * 10.0)) + seed);
    medium = hash(floor(vUv * resolution / max(1.0, cellSize * 4.0)) + seed * 2.0);
    fine = hash(vUv * resolution + seed * 3.0);
    ribbons = step(0.48, hash(floor(vUv * resolution / max(1.0, cellSize * 18.0)) - seed));
    paletteT = large;
  }

  float hue = fract(large * 0.76 + medium * 0.31 + ribbons * 0.22 + seed * 0.113);
  float saturation = 0.72 + 0.26 * medium;
  float value = 0.96 + 0.40 * fine + 0.16 * ribbons;

  vec3 procedural = hsv2rgb(vec3(hue, saturation, value));
  vec3 styled = paletteColor(paletteT) * value;
  vec3 color = mix(procedural, styled, clamp(paletteStrength, 0.0, 1.0));
  color *= 1.04 + 0.20 * ribbons;
  if (initMode == 1) color *= mix(0.82, 1.08, fine);

  outColor = vec4(color, 1.0);
}
      `;

export const FLUID_SPLAT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  float splat = exp(-dot(p, p) / radius);
  vec3 base = texture(uTarget, vUv).rgb;
  outColor = vec4(base + color * splat, 1.0);
}`;
export const FLUID_ADVECTION_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - dt * velocity * texelSize;
  coord = clamp(coord, vec2(0.001), vec2(0.999));
  vec4 result = texture(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  outColor = result / decay;
}`;

export const FLUID_BOUNDARY_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
uniform float wallDamping;
void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  float left = vUv.x;
  float right = 1.0 - vUv.x;
  float bottom = vUv.y;
  float top = 1.0 - vUv.y;
  float edge = min(min(left, right), min(bottom, top));
  float wall = smoothstep(0.0, max(texelSize.x, texelSize.y) * 7.0, edge);
  if (left < texelSize.x || right < texelSize.x) velocity.x = 0.0;
  if (bottom < texelSize.y || top < texelSize.y) velocity.y = 0.0;
  velocity *= mix(wallDamping, 1.0, wall);
  outColor = vec4(velocity, 0.0, 1.0);
}`;

export const FLUID_DIVERGENCE_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  vec2 uvL = vUv - vec2(texelSize.x, 0.0);
  vec2 uvR = vUv + vec2(texelSize.x, 0.0);
  vec2 uvB = vUv - vec2(0.0, texelSize.y);
  vec2 uvT = vUv + vec2(0.0, texelSize.y);
  float L = texture(uVelocity, uvL).x;
  float R = texture(uVelocity, uvR).x;
  float B = texture(uVelocity, uvB).y;
  float T = texture(uVelocity, uvT).y;
  if (uvL.x < 0.0) L = -C.x;
  if (uvR.x > 1.0) R = -C.x;
  if (uvB.y < 0.0) B = -C.y;
  if (uvT.y > 1.0) T = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

export const FLUID_CURL_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

export const FLUID_VORTICITY_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 texelSize;
uniform float curlStrength;
uniform float dt;
void main() {
  float L = texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, texelSize.y)).x;
  float T = texture(uCurl, vUv + vec2(0.0, texelSize.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy + force * dt;
  outColor = vec4(clamp(velocity, vec2(-1000.0), vec2(1000.0)), 0.0, 1.0);
}`;

export const FLUID_PRESSURE_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 texelSize;
float pressureAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uPressure, uv).x;
}
void main() {
  float L = pressureAt(vUv - vec2(texelSize.x, 0.0));
  float R = pressureAt(vUv + vec2(texelSize.x, 0.0));
  float B = pressureAt(vUv - vec2(0.0, texelSize.y));
  float T = pressureAt(vUv + vec2(0.0, texelSize.y));
  float divergence = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

export const FLUID_GRADIENT_SUBTRACT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
float pressureAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uPressure, uv).x;
}
void main() {
  float L = pressureAt(vUv - vec2(texelSize.x, 0.0));
  float R = pressureAt(vUv + vec2(texelSize.x, 0.0));
  float B = pressureAt(vUv - vec2(0.0, texelSize.y));
  float T = pressureAt(vUv + vec2(0.0, texelSize.y));
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= vec2(R - L, T - B);
  outColor = vec4(velocity, 0.0, 1.0);
}`;

export const FLUID_DISPLAY_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTexture;
uniform vec2 texelSize;
uniform vec2 resolution;
uniform float exposure;
uniform float time;
uniform vec3 palette[6];
uniform int paletteCount;
uniform float paletteStrength;
uniform float edgeDarkening;
uniform float shadingStrength;
uniform int visualPipeline;
uniform int initMode;
uniform float seed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 paletteColor(float t) {
  if (paletteCount <= 1) return palette[0];
  float scaled = clamp(t, 0.0, 0.999) * float(paletteCount - 1);
  int index = int(floor(scaled));
  float local = fract(scaled);
  vec3 a = palette[0];
  vec3 b = palette[0];
  for (int i = 0; i < 6; i++) {
    if (i == index) a = palette[i];
    if (i == min(index + 1, paletteCount - 1)) b = palette[i];
  }
  return mix(a, b, smoothstep(0.0, 1.0, local));
}

void main() {
  vec3 c = texture(uTexture, vUv).rgb;

  float sourceEnergy = max(max(c.r, c.g), c.b);
  float blankReveal = initMode == 4 ? smoothstep(0.0015, 0.075, sourceEnergy) : 1.0;
  float dyeMask = initMode == 4 ? blankReveal : smoothstep(0.006, 0.13, sourceEnergy);

  vec3 sampleL = texture(uTexture, vUv - vec2(texelSize.x, 0.0)).rgb;
  vec3 sampleR = texture(uTexture, vUv + vec2(texelSize.x, 0.0)).rgb;
  vec3 sampleB = texture(uTexture, vUv - vec2(0.0, texelSize.y)).rgb;
  vec3 sampleT = texture(uTexture, vUv + vec2(0.0, texelSize.y)).rgb;
  float gradientX = length(sampleR) - length(sampleL);
  float gradientY = length(sampleT) - length(sampleB);
  vec3 normal = normalize(vec3(gradientX * 1.8, gradientY * 1.8, 0.08));
  float diffuse = 0.52 + 0.48 * dot(normal, normalize(vec3(-0.35, -0.52, 0.78)));
  c *= mix(1.0, clamp(diffuse, 0.62, 1.38), clamp(shadingStrength, 0.0, 1.0));

  vec3 glow = vec3(0.0);
  glow += texture(uTexture, vUv + vec2( 2.0,  0.0) * texelSize).rgb;
  glow += texture(uTexture, vUv + vec2(-2.0,  0.0) * texelSize).rgb;
  glow += texture(uTexture, vUv + vec2( 0.0,  2.0) * texelSize).rgb;
  glow += texture(uTexture, vUv + vec2( 0.0, -2.0) * texelSize).rgb;
  glow *= 0.075;

  c += glow * (visualPipeline == 1 ? 0.55 : 0.0);
  c *= 1.0 + dyeMask * 0.22;
  c = 1.0 - exp(-c * exposure * (1.16 + sourceEnergy * 0.22));
  c = pow(max(c, 0.0), vec3(0.82));

  c *= blankReveal;

  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float wallShadow = smoothstep(0.0, 0.035, edge);
  c *= mix(1.0, 0.78 + 0.22 * wallShadow, clamp(edgeDarkening, 0.0, 1.0));

  float vignette = smoothstep(0.92, 0.20, distance(vUv, vec2(0.5)));
  c *= 0.82 + 0.18 * vignette;

  float grain = hash(vUv * resolution + time) - 0.5;
  c += grain * (visualPipeline == 1 ? 0.005 * dyeMask : 0.0);
  if (initMode == 4) {
    c += vec3(0.003);
  }

  outColor = vec4(max(c, 0.0), 1.0);
}
      `;

export const FLUID_BLOOM_PREFILTER_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform vec3 curve;
uniform float threshold;
void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  float brightness = max(max(c.r, c.g), c.b);
  float soft = clamp(brightness - curve.x, 0.0, curve.y);
  soft = curve.z * soft * soft;
  float contribution = max(soft, brightness - threshold) / max(brightness, 0.0001);
  outColor = vec4(c * contribution, 1.0);
}`;

export const FLUID_BLOOM_BLUR_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform vec2 texelSize;
void main() {
  vec3 sum = vec3(0.0);
  sum += texture(uTexture, vUv - vec2(texelSize.x, 0.0)).rgb;
  sum += texture(uTexture, vUv + vec2(texelSize.x, 0.0)).rgb;
  sum += texture(uTexture, vUv - vec2(0.0, texelSize.y)).rgb;
  sum += texture(uTexture, vUv + vec2(0.0, texelSize.y)).rgb;
  outColor = vec4(sum * 0.25, 1.0);
}`;

export const FLUID_BLOOM_FINAL_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform vec2 texelSize;
uniform float intensity;
void main() {
  vec3 sum = vec3(0.0);
  sum += texture(uTexture, vUv - vec2(texelSize.x, 0.0)).rgb;
  sum += texture(uTexture, vUv + vec2(texelSize.x, 0.0)).rgb;
  sum += texture(uTexture, vUv - vec2(0.0, texelSize.y)).rgb;
  sum += texture(uTexture, vUv + vec2(0.0, texelSize.y)).rgb;
  outColor = vec4(sum * 0.25 * intensity, 1.0);
}`;

export const FLUID_BLUR_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform vec2 texelSize;
uniform vec2 direction;
void main() {
  vec2 off = texelSize * direction;
  vec3 c = texture(uTexture, vUv).rgb * 0.2270270270;
  c += texture(uTexture, vUv + off * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTexture, vUv - off * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTexture, vUv + off * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTexture, vUv - off * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(c, 1.0);
}`;

export const FLUID_SUNRAYS_MASK_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
void main() {
  vec4 c = texture(uTexture, vUv);
  float brightness = max(c.r, max(c.g, c.b));
  c.a = 1.0 - min(max(brightness * 20.0, 0.0), 0.8);
  outColor = c;
}`;

export const FLUID_SUNRAYS_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform float weight;
const int ITERATIONS = 16;
void main() {
  float density = 0.3;
  float decay = 0.95;
  float exposure = 0.7;
  vec2 coord = vUv;
  vec2 dir = vUv - vec2(0.5);
  dir *= 1.0 / float(ITERATIONS) * density;
  float illuminationDecay = 1.0;
  float color = texture(uTexture, vUv).a;
  for (int i = 0; i < ITERATIONS; i++) {
    coord -= dir;
    float sampleValue = texture(uTexture, coord).a;
    color += sampleValue * illuminationDecay * weight;
    illuminationDecay *= decay;
  }
  outColor = vec4(color * exposure, 0.0, 0.0, 1.0);
}`;

export const FLUID_COMPOSITE_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uBloom;
uniform sampler2D uSunrays;
uniform float bloomStrength;
uniform float sunraysStrength;
uniform vec2 resolution;
uniform float time;
uniform int visualPipeline;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
void main() {
  vec3 c = texture(uBase, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  float rays = texture(uSunrays, vUv).r;
  float baseEnergy = max(max(c.r, c.g), c.b);
  float intensityMask = smoothstep(0.015, 0.72, baseEnergy);
  float drivenBloom = visualPipeline == 1
    ? bloomStrength * (0.46 + intensityMask * 1.04)
    : bloomStrength;
  if (visualPipeline == 1) {
    c *= rays;
    bloom *= rays;
  }
  c += bloom * drivenBloom;
  if (visualPipeline == 1) {
    c = c / (1.0 + c * 0.16);
    c = pow(max(c, 0.0), vec3(0.96));
    c += (hash(vUv * resolution + time * 19.0) - 0.5) * 0.004 * intensityMask;
  }
  outColor = vec4(max(c, 0.0), 1.0);
}`;

export const FLUID_REFERENCE_DISPLAY_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform sampler2D uSunrays;
uniform vec2 texelSize;
uniform vec2 resolution;
uniform float exposure;
uniform float time;
uniform float shadingStrength;
uniform float sunraysStrength;
uniform float edgeDarkening;
uniform int initMode;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 linearToGamma(vec3 color) {
  color = max(color, vec3(0.0));
  return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0.0));
}

void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  float rays = texture(uSunrays, vUv).r;
  float sourceEnergy = max(c.r, max(c.g, c.b));
  float bloomEnergy = max(bloom.r, max(bloom.g, bloom.b));
  float blankReveal = initMode == 4 ? smoothstep(0.00008, 0.004, max(sourceEnergy, bloomEnergy)) : 1.0;

  vec3 lc = texture(uTexture, vUv - vec2(texelSize.x, 0.0)).rgb;
  vec3 rc = texture(uTexture, vUv + vec2(texelSize.x, 0.0)).rgb;
  vec3 tc = texture(uTexture, vUv + vec2(0.0, texelSize.y)).rgb;
  vec3 bc = texture(uTexture, vUv - vec2(0.0, texelSize.y)).rgb;
  float dx = length(rc) - length(lc);
  float dy = length(tc) - length(bc);
  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
  c *= mix(1.0, diffuse, clamp(shadingStrength, 0.0, 1.0));

  float rayMix = clamp(sunraysStrength, 0.0, 1.0);
  float rayFactor = mix(1.0, rays, rayMix);
  c *= rayFactor;
  bloom *= rayFactor;

  float noise = hash(vUv * resolution + time * 17.0) * 2.0 - 1.0;
  bloom += noise / 255.0 * blankReveal;
  bloom = linearToGamma(bloom);
  c = c * exposure + bloom;
  c *= blankReveal;

  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float wallShadow = smoothstep(0.0, 0.035, edge);
  c *= mix(1.0, 0.82 + 0.18 * wallShadow, clamp(edgeDarkening, 0.0, 1.0));
  if (initMode == 4) {
    c += vec3(0.003);
  }

  float a = max(c.r, max(c.g, c.b));
  outColor = vec4(max(c, 0.0), max(a, 1.0));
}`;
