import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateParticleBenchmarkGate, particleBenchmarkBudget } from './particle-benchmark-policy.mjs';

const report = (capacity, tier, fps, gpuP95 = 1) => ({
  configuration: { capacity, tier },
  fps: { average: fps },
  gpuMs: { available: true, p95: gpuP95 },
});

test('uses an explicit one-FPS display-refresh tolerance only for 60 FPS gates', () => {
  assert.deepEqual(particleBenchmarkBudget({ capacity: 65_536, tier: 'ultra' }), {
    fpsTarget: 60,
    minimumAverageFps: 59,
    refreshToleranceFps: 1,
    gpuP95: 8,
  });
  assert.equal(particleBenchmarkBudget({ capacity: 262_144, tier: 'enhanced' }).minimumAverageFps, 55);
  assert.equal(particleBenchmarkBudget({ capacity: 589_824, tier: 'basic' }).minimumAverageFps, 45);
});

test('accepts refresh-limited 59.x scheduling without weakening GPU budgets', () => {
  assert.equal(evaluateParticleBenchmarkGate(report(65_536, 'ultra', 59.1, 7.9)).passed, true);
  assert.equal(evaluateParticleBenchmarkGate(report(65_536, 'ultra', 58.99, 1)).passed, false);
  assert.equal(evaluateParticleBenchmarkGate(report(65_536, 'ultra', 59.9, 8)).passed, false);
});

test('keeps the physical mobile preview gate at 30 FPS', () => {
  const result = evaluateParticleBenchmarkGate(report(65_536, 'enhanced', 30, 20), true);
  assert.equal(result.budget.minimumAverageFps, 30);
  assert.equal(result.passed, true);
});
