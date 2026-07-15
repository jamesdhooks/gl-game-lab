import { describe, expect, it } from 'vitest';
import { MYCELIUM_SETTINGS } from './config.js';
import { MYCELIUM_DISPLAY_SHADER, MYCELIUM_TRIANGLE_FRAGMENT_SHADER } from './shaders.js';
import { MYCELIUM_STYLE_MANIFEST } from './styles.js';

describe('Mycelium authoring controls', () => {
  it('allows high-speed growth up to 24', () => {
    const growthRate = MYCELIUM_SETTINGS.find((setting) => setting.key === 'growthRate');
    expect(growthRate?.type).toBe('number');
    expect(growthRate?.type === 'number' ? growthRate.max : undefined).toBe(24);
  });

  it('exposes the seeded procedural Random palette in both render paths', () => {
    expect(MYCELIUM_STYLE_MANIFEST.styles.some((style) => style.id === 'random' && style.name === 'Random')).toBe(true);
    for (const shader of [MYCELIUM_DISPLAY_SHADER, MYCELIUM_TRIANGLE_FRAGMENT_SHADER]) {
      expect(shader).toContain('uniform int uProceduralPalette');
      expect(shader).toContain('uniform float uPaletteSeed');
      expect(shader).toContain('vec3 myceliumColor(float position)');
      expect(shader).toContain('vec3 colony=myceliumColor(state.g)');
    }
  });
});
