/** Shared Ball Pit palette-gradient composition for renderer-owned backgrounds. */
export const PALETTE_GRADIENT_BACKDROP_GLSL = `
vec3 paletteGradientBackdrop(
  vec2 uv,
  vec3 base,
  vec3 primary,
  vec3 secondary,
  vec3 accent,
  float tier
) {
  float vertical = smoothstep(0.0, 1.0, uv.y);
  float horizon = exp(-pow((uv.y - 0.44) * 4.3, 2.0));
  float vignette = 1.0 - smoothstep(0.28, 0.9, length((uv - 0.5) * vec2(1.22, 1.0))) * 0.42;
  float shimmer = sin((uv.x * 4.6 + uv.y * 2.1) * 3.14159) * 0.5 + 0.5;
  vec3 field = mix(base * 0.72 + primary * 0.08, base * 0.88 + secondary * 0.09, vertical);
  field += accent * horizon * mix(0.035, 0.1, tier);
  field += primary * shimmer * horizon * mix(0.012, 0.04, tier);
  return field * vignette;
}
`;
