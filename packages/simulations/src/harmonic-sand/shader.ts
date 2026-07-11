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

float sourceMarker(vec2 p) {
  float marker = 0.0;
  for (int i = 0; i < MAX_EMITTERS; i++) {
    if (i >= uEmitterCount) break;
    float d = length(p - uEmitters[i].xy);
    marker += smoothstep(0.034, 0.009, d) + 0.35 * smoothstep(0.055, 0.038, abs(d - 0.046));
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
    float value = pow(clamp(abs(field), 0.0, 1.0), uRenderMode == 0 ? 0.65 : 0.45);
    float alpha = value * (uRenderMode == 0 ? 0.78 : 0.88);
    vec3 color = mix(uBackground, sand, alpha);
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
