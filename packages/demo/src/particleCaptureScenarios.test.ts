import { describe, expect, it } from 'vitest';
import { particleCaptureInputEvents } from './particleCaptureScenarios.js';

describe('particleCaptureInputEvents', () => {
  it('launches deterministic fireworks and drives a Sparks welding path', () => {
    expect(particleCaptureInputEvents('fireworks', 'launch')).toHaveLength(6);
    expect(particleCaptureInputEvents('sparks', 'weld')).toHaveLength(5);
    expect(particleCaptureInputEvents('orbital-shrapnel', undefined)).toEqual([]);
    expect(() => particleCaptureInputEvents('fireworks', 'missing')).toThrow('Unknown particle capture scenario');
  });
});
