export const HARMONIC_SAND_FRAGMENT_SHADER = `#version 300 es
precision highp float;
#define MAX_EMITTERS 16
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uFieldResolution;
uniform float uTime;
uniform float uBaseFrequency;
uniform float uParticleDensity;
uniform float uParticleCount;
uniform float uLineSharpness;
uniform float uGlow;
uniform int uRenderMode;
uniform int uEmitterCount;
uniform int uShowEmitterMarkers;
uniform vec4 uEmitters[MAX_EMITTERS];
uniform float uEmitterAmplitudes[MAX_EMITTERS];
uniform vec3 uPaletteA;
uniform vec3 uPaletteB;
uniform vec3 uPaletteC;
uniform vec3 uPaletteD;
uniform vec3 uBackground;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float waveField(vec2 p) {
  if (uEmitterCount == 0) {
    float radius = max(1.0, length(p) * uFieldResolution * 0.5);
    return sin(radius * 0.035 * uBaseFrequency - uTime * uBaseFrequency);
  }
  float field = 0.0;
  for (int i = 0; i < MAX_EMITTERS; i++) {
    if (i >= uEmitterCount) break;
    vec4 emitter = uEmitters[i];
    float radius = max(1.0, length(p - emitter.xy) * uFieldResolution * 0.5);
    float frequency = emitter.z * max(0.05, uBaseFrequency / 2.4);
    field += sin(radius * 0.035 * frequency - uTime * frequency + emitter.w) * uEmitterAmplitudes[i];
  }
  return field / max(1.0, float(uEmitterCount));
}

vec3 palette(float value) {
  vec3 low = mix(uPaletteA, uPaletteB, smoothstep(0.0, 0.34, value));
  vec3 high = mix(uPaletteC, uPaletteD, smoothstep(0.66, 1.0, value));
  return mix(low, high, smoothstep(0.28, 0.78, value));
}

vec3 bandedPalette(float value) {
  if (value < 0.25) return uPaletteA;
  if (value < 0.50) return uPaletteB;
  if (value < 0.75) return uPaletteC;
  return uPaletteD;
}

vec2 fieldGridSize() {
  float columns = max(1.0, uFieldResolution);
  float rows = max(1.0, columns * uResolution.y / max(1.0, uResolution.x));
  return vec2(columns, rows);
}

vec4 fieldPixel(vec2 sampleUv, vec2 aspect, bool smoothPalette, float gamma, float maxAlpha) {
  vec2 point = vec2((sampleUv.x - 0.5) * 2.0 * aspect.x, (0.5 - sampleUv.y) * 2.0);
  float value = pow(clamp(abs(waveField(point)), 0.0, 1.0), gamma);
  return vec4(smoothPalette ? palette(value) : bandedPalette(value), value * maxAlpha);
}

vec4 nearestField(vec2 uv, vec2 aspect, float gamma, float maxAlpha) {
  vec2 gridSize = fieldGridSize();
  vec2 cell = floor(clamp(uv, vec2(0.0), vec2(0.999999)) * gridSize);
  return fieldPixel((cell + 0.5) / gridSize, aspect, false, gamma, maxAlpha);
}

vec4 linearField(vec2 uv, vec2 aspect, float gamma, float maxAlpha) {
  vec2 gridSize = fieldGridSize();
  vec2 texel = clamp(uv, vec2(0.0), vec2(0.999999)) * gridSize - 0.5;
  vec2 base = floor(texel);
  vec2 blend = smoothstep(vec2(0.0), vec2(1.0), fract(texel));
  vec2 uv00 = (clamp(base, vec2(0.0), gridSize - 1.0) + 0.5) / gridSize;
  vec2 uv10 = (clamp(base + vec2(1.0, 0.0), vec2(0.0), gridSize - 1.0) + 0.5) / gridSize;
  vec2 uv01 = (clamp(base + vec2(0.0, 1.0), vec2(0.0), gridSize - 1.0) + 0.5) / gridSize;
  vec2 uv11 = (clamp(base + vec2(1.0), vec2(0.0), gridSize - 1.0) + 0.5) / gridSize;
  vec4 c00 = fieldPixel(uv00, aspect, true, gamma, maxAlpha);
  vec4 c10 = fieldPixel(uv10, aspect, true, gamma, maxAlpha);
  vec4 c01 = fieldPixel(uv01, aspect, true, gamma, maxAlpha);
  vec4 c11 = fieldPixel(uv11, aspect, true, gamma, maxAlpha);
  return mix(mix(c00, c10, blend.x), mix(c01, c11, blend.x), blend.y);
}

float sourceMarker(vec2 p) {
  if (uShowEmitterMarkers == 0) return 0.0;
  float marker = 0.0;
  for (int i = 0; i < MAX_EMITTERS; i++) {
    if (i >= uEmitterCount) break;
    vec4 emitter = uEmitters[i];
    float frequency = emitter.z * max(0.05, uBaseFrequency / 2.4);
    float pulse = sin(uTime * frequency + emitter.w);
    float radius = 0.024 * (1.0 + pulse * 0.08);
    float disc = 1.0 - smoothstep(radius - 0.003, radius + 0.003, length(p - emitter.xy));
    marker = max(marker, disc * (0.92 + pulse * 0.08));
  }
  return clamp(marker, 0.0, 1.0);
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 p = vec2((vUv.x - 0.5) * 2.0 * aspect.x, (0.5 - vUv.y) * 2.0);
  float field = waveField(p);
  float harmonic = pow(clamp(0.5 + 0.5 * field, 0.0, 1.0), 0.82);
  vec3 sand = palette(harmonic);

  if (uRenderMode < 2) {
    bool enhanced = uRenderMode == 1;
    vec4 sampled = enhanced
      ? linearField(vUv, aspect, 0.45, 224.0 / 255.0)
      : nearestField(vUv, aspect, 0.65, 200.0 / 255.0);
    vec3 color = mix(uBackground, sampled.rgb, sampled.a);
    color = mix(color, uPaletteD, sourceMarker(p) * 0.8);
    fragColor = vec4(color, 1.0);
    return;
  }

  float nodal = exp(-abs(field) * mix(10.0, 58.0, clamp(uLineSharpness / 3.5, 0.0, 1.0)));
  float budget = clamp((uParticleCount - 25000.0) / 1975000.0, 0.0, 1.0);
  float density = clamp(uParticleDensity, 0.05, 8.0);
  float grainScale = mix(130.0, 2300.0, budget) * mix(0.55, 2.25, density / 8.0) * sqrt(clamp(uFieldResolution / 128.0, 0.25, 8.0));
  float grain = hash(floor(vUv * grainScale));
  float sparkle = smoothstep(mix(0.985, 0.72, clamp(density / 3.0, 0.0, 1.0)), 1.0, grain) * nodal;
  float vignette = smoothstep(1.24, 0.18, length((vUv - 0.5) * vec2(aspect.x, 1.0)));
  vec3 color = sand * (0.62 + 0.34 * nodal + 0.07 * sparkle);
  color *= 1.0 + nodal * uGlow * mix(0.14, 0.34, budget);
  color = mix(color, uPaletteD, sparkle * mix(0.04, 0.12, budget));
  color = mix(color, uPaletteD, sourceMarker(p) * (0.62 + 0.28 * nodal));
  color *= 0.72 + 0.38 * vignette;
  fragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(0.88)), 1.0);
}`;
