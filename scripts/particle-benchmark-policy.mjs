export const PARTICLE_REFRESH_TOLERANCE_FPS = 1;

export function particleBenchmarkBudget(configuration, mobileMode = false) {
  const { capacity, tier } = configuration;
  const target = mobileMode ? { fps: 30, gpuP95: 33.34 }
    : capacity === 65_536 && tier === 'ultra' ? { fps: 60, gpuP95: 8 }
      : capacity === 147_456 && tier === 'ultra' ? { fps: 60, gpuP95: 12 }
        : capacity === 262_144 && tier === 'enhanced' ? { fps: 55, gpuP95: 15 }
          : capacity === 589_824 && tier === 'basic' ? { fps: 45, gpuP95: 20 }
            : { fps: 0, gpuP95: Number.POSITIVE_INFINITY };
  const refreshTolerance = target.fps === 60 ? PARTICLE_REFRESH_TOLERANCE_FPS : 0;
  return Object.freeze({
    fpsTarget: target.fps,
    minimumAverageFps: Math.max(0, target.fps - refreshTolerance),
    refreshToleranceFps: refreshTolerance,
    gpuP95: target.gpuP95,
  });
}

export function evaluateParticleBenchmarkGate(report, mobileMode = false) {
  const budget = particleBenchmarkBudget(report.configuration, mobileMode);
  const fpsPass = report.fps.average >= budget.minimumAverageFps;
  const gpuPass = !report.gpuMs.available || report.gpuMs.p95 < budget.gpuP95;
  return Object.freeze({ budget, fpsPass, gpuPass, passed: fpsPass && gpuPass });
}
