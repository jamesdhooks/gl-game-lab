import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { applyPaletteGradientBackdrop2D, EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuRenderTarget2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createBuildFixture, packBuildPreview } from '../BuildFixtures.js';
import { createSplashMpmConfig, SPLASH_MPM_DEFAULTS, splashNumber, splashString, type SplashMpmConfig } from './config.js';
import { resolveSplashPicFlipBackend, SplashPicFlipGpuRuntime, type SplashPicFlipBackendDecision, type SplashPicFlipBackendKind, type SplashPicFlipGpuRenderPath } from './SplashPicFlipBackend.js';
import { validateSplashPicFlipGpuParity } from './SplashPicFlipGpuParity.js';
import { SPLASH_PIC_FLIP_CAPACITY, SplashPicFlipModel, type SplashMpmTuning } from './SplashMpmModel.js';
import { splashPointScale, splashRgb, splashRgba, SPLASH_MPM_STYLE_MANIFEST } from './styles.js';
import { waterTankObstacleLayoutSeed } from '../water-tank/WaterTankModel.js';
export type SplashMpmMode = 'pour' | 'splash' | 'build';
export interface SplashMpmController extends ExperienceRuntimeController {
  readonly mode: SplashMpmMode;
  readonly particleCount: number;
  readonly obstacleCount: number;
  readonly activeSolverBackend: SplashPicFlipBackendKind;
  readonly gpuParityValidated: boolean;
  readonly solverBackend: SplashPicFlipBackendDecision;
}
export const SplashMpmControllerService = createExtensionToken<SplashMpmController>('gl-game-lab.simulations.splash-mpm.controller');
export const SPLASH_MPM_PLUGIN_ID = 'gl-game-lab.simulations.splash-mpm';
const SPLASH_MPM_LAYOUT_SEED = 5398371;
export function resolveSplashSurfaceParameters(config: SplashMpmConfig, worldWidth = 1280) {
  const renderStyle = splashString(config, 'renderStyle');
  const smoothing = splashNumber(config, 'surfaceSmoothing');
  const ultra = renderStyle === 'ultra';
  const particleRadius = splashNumber(config, 'particleRadius');
  const resolution = splashNumber(config, 'resolution');
  const resolutionScale = Math.max(0.25, Math.min(1.35, 128 / Math.max(32, resolution)));
  const authoredOverlap = Math.max(0.96, Math.min(1.32, 1.34 - particleRadius * 0.004));
  const spacing = Math.max(Math.max(1.4, particleRadius * 0.72), Math.min(particleRadius * 1.52, particleRadius * authoredOverlap * resolutionScale));
  const spacingOverlap = Math.max(1.05, Math.min(2.35, spacing / Math.max(0.75, particleRadius)));
  const cellSize = Math.max(2, worldWidth / Math.max(24, Math.floor(resolution)));
  const gridOverlap = Math.max(1.05, Math.min(2.1, Math.pow(cellSize / Math.max(0.75, particleRadius), 0.42)));
  const surfaceOverlap = Math.max(spacingOverlap, gridOverlap);
  const surfaceRadius = splashNumber(config, 'liquidParticleRadius');
  const basePointScale = (ultra ? 2.58 + 0.76 * 0.68 : 2.35 + 0.76 * 0.48) * surfaceRadius;
  const surfaceBoost = ultra ? 1.18 : 1.08;
  const densityScale = splashNumber(config, 'liquidSplatDensity') * surfaceBoost * Math.sqrt(surfaceOverlap);
  return Object.freeze({
    fieldScale: Math.max(0.2, Math.min(1, splashNumber(config, 'enhancedQuality') * splashNumber(config, 'liquidFieldScale') * 0.62)),
    // DensityMetaballRenderer specifies a diameter multiplier while the legacy
    // renderer authored a point-size multiplier, hence the exact 0.5 conversion.
    particleRadiusScale: basePointScale * splashNumber(config, 'enhancedSplatSize') * surfaceOverlap * surfaceBoost * 0.5,
    // The unified splat shader has the legacy kernel baked in but no separate
    // density uniform. Moving density into the iso-threshold preserves its effect.
    threshold: splashNumber(config, 'liquidSurfaceThreshold') * (ultra ? 1.34 : 1.42) / Math.max(0.001, densityScale),
    edgeSoftness: splashNumber(config, 'liquidEdgeSoftness') * (2 - splashNumber(config, 'liquidEdgeTightness')) * (0.55 + smoothing * 0.9),
    edgeTightness: splashNumber(config, 'liquidEdgeTightness'),
    thermalContrast: ultra
      ? (1 + splashNumber(config, 'liquidFoamStrength') * 0.3) * (0.65 + splashNumber(config, 'enhancedDepth') * 0.55)
      : splashNumber(config, 'enhancedDepth'),
    refraction: splashNumber(config, 'liquidRefraction'),
    gloss: splashNumber(config, 'liquidGloss'),
    rimLighting: splashNumber(config, 'enhancedEdge'),
    foamStrength: ultra ? splashNumber(config, 'liquidFoamStrength') : 0,
    thermalStrength: ultra ? 1 : 0.42,
    bloomStrength: ultra ? splashNumber(config, 'liquidBloomStrength') : 0,
    heatShimmer: ultra ? splashNumber(config, 'liquidHeatShimmer') : 0,
    depthDiffusion: ultra
      ? Math.min(1, splashNumber(config, 'liquidDepthDiffusion') + smoothing * 0.15)
      : smoothing * 0.18,
    renderStyle: ultra ? 'ultra' as const : 'enhanced' as const,
    opacity: splashNumber(config, 'opacity'),
  });
}
type Point = {
  readonly x: number;
  readonly y: number;
};
export function createSplashMpmPlugin(initial: SplashMpmConfig = SPLASH_MPM_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: SplashMpmMode = launch.modeId === 'splash' || launch.modeId === 'build' ? launch.modeId : 'pour', styleId = validStyle(launch.styleId) ?? SPLASH_MPM_STYLE_MANIFEST.defaultStyleId, width = 1, height = 1, pendingReset = true, pendingLayoutRegeneration = true, time = 0, accumulator = 0, layoutGeneration = 0, layoutSeed = waterTankObstacleLayoutSeed(launch.seed ?? SPLASH_MPM_LAYOUT_SEED, 0), cleanup = (): void => undefined;
  let activeBackend: SplashPicFlipBackendKind = 'cpu', obstacleRevision = 0;
  const model = new SplashPicFlipModel(), paths = new Map<number, Point[]>(), previous = new Map<number, Point>(), pointerDelta = new Map<number, Point>();
  const renderedRadii = new Float32Array(SPLASH_PIC_FLIP_CAPACITY);
  const renderedColorSeeds = new Float32Array(SPLASH_PIC_FLIP_CAPACITY);
  return {
    id: SPLASH_MPM_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      const gpuRuntime = new SplashPicFlipGpuRuntime(gpu, `${SPLASH_MPM_PLUGIN_ID}.pic-flip`);
      const parity = validateSplashPicFlipGpuParity(gpu);
      const gpuParityValidated = parity.supported && parity.seedRoundTrip && parity.instancedParticleToGrid
        && parity.gridUpdate && parity.particleUpdate && parity.sceneTrajectory;
      cleanup = () => { gpuRuntime.dispose(); };
      applyStyle();
      const controller: SplashMpmController = {
        get mode() {
          return mode;
        },
        get modeId() {
          return mode;
        },
        get styleId() {
          return styleId;
        },
        get settings() {
          return Object.freeze({
            ...config
          });
        },
        get entityCount() {
          return particleCount();
        },
        get particleCount() {
          return particleCount();
        },
        get obstacleCount() {
          return model.obstacles.length;
        },
        get activeSolverBackend() {
          return activeBackend;
        },
        get gpuParityValidated() {
          return gpuParityValidated;
        },
        get solverBackend() {
          return backendDecision();
        },
        get runtimeDiagnostics() {
          const decision = backendDecision();
          return Object.freeze({
            'splash.activeBackend': activeBackend,
            'splash.selectedBackend': decision.backend,
            'splash.gpuEligible': decision.gpuEligible,
            'splash.gpuParityValidated': gpuParityValidated,
            'splash.paritySeed': parity.seedRoundTrip,
            'splash.parityP2G': parity.particleToGrid,
            'splash.parityInstancedP2G': parity.instancedParticleToGrid,
            'splash.parityGrid': parity.gridUpdate,
            'splash.parityParticle': parity.particleUpdate,
            'splash.parityScene': parity.sceneTrajectory,
            'splash.parityMaxInstancedP2G': parity.maxInstancedParticleToGridError ?? 'n/a',
            'splash.parityMaxGrid': parity.maxGridUpdateError ?? 'n/a',
            'splash.parityMaxParticle': parity.maxParticleUpdateError ?? 'n/a',
            'splash.parityMaxPosition': parity.maxParticlePositionError ?? 'n/a',
            'splash.parityMaxVelocity': parity.maxParticleVelocityError ?? 'n/a',
            'splash.parityMaxFoam': parity.maxParticleFoamError ?? 'n/a',
            'splash.parityMaxAffine': parity.maxParticleAffineError ?? 'n/a',
            'splash.paritySceneCenter': parity.sceneCenterDistance ?? 'n/a',
            'splash.paritySceneMomentum': parity.sceneMomentumRelativeError ?? 'n/a',
            'splash.paritySceneEnergy': parity.sceneKineticEnergyRelativeError ?? 'n/a',
            'splash.paritySceneFoam': parity.sceneFoamCoverageError ?? 'n/a',
            'splash.reasonCount': decision.reasons.length,
            'splash.reasons': [...decision.reasons, ...parity.reasons].join('; ') || 'none',
          });
        },
        setMode: v => {
          if (v !== 'splash' && v !== 'pour' && v !== 'build')
            throw new Error(`Unknown Splash MPM mode: ${v}`);
          mode = v;
          paths.clear();
          previous.clear();
          pointerDelta.clear();
        },
        setStyle: v => {
          const next = validStyle(v);
          if (!next)
            throw new Error(`Unknown Splash MPM style: ${v}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const layout = key === 'obstacleRamps' || key === 'obstaclePegs' || key === 'buildRadius';
          config = createSplashMpmConfig({
            ...record(),
            [key]: value
          });
          if (layout) {
            pendingReset = true;
            pendingLayoutRegeneration = true;
          } else if (key === 'resolution' || key === 'maxParticles' || key === 'particleRadius')
            pendingReset = true;
          applyStyle();
        },
        reset: () => {
          pendingReset = true;
          pendingLayoutRegeneration = true;
        }
      };
      registerSimulationRuntime(context, SplashMpmControllerService, controller, () => cleanup());
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.splash-mpm.update',
        stage: 'update',
        run: ({ time: clock }) => {
          const w = Math.max(1, renderer.viewport.width), h = Math.max(1, renderer.viewport.height), dt = Math.min(1 / 30, clock.deltaSeconds);
          time += dt;
          if (pendingReset || w !== width || h !== height) {
            const regenerateLayout = pendingLayoutRegeneration;
            width = w;
            height = h;
            reset(regenerateLayout);
            pendingReset = false;
            pendingLayoutRegeneration = false;
          }
          migrateBackendIfNeeded();
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer') {
              const p = {
                x: event.x,
                y: event.y
              }, last = previous.get(event.id) ?? p, dx = p.x - last.x, dy = p.y - last.y;
              if (event.phase === 'down') {
                previous.set(event.id, p);
                pointerDelta.set(event.id, { x: 0, y: 0 });
                if (mode === 'build')
                  paths.set(event.id, [
                    p
                  ]);
                else if (mode === 'pour')
                  pour(p.x, p.y, Math.min(48, Math.max(8, Math.floor(splashNumber(config, 'emitRate') / 80))), splashNumber(config, 'pourRadius'));
              }
              else if (event.phase === 'move') {
                previous.set(event.id, p);
                pointerDelta.set(event.id, { x: dx, y: dy });
                if (mode === 'build') {
                  const path = paths.get(event.id);
                  if (path && distance(path[path.length - 1] ?? p, p) > 5)
                    path.push(p);
                }
                else if (mode === 'splash')
                  splash(p.x, p.y, splashNumber(config, 'inputRadius'), splashNumber(config, 'inputForce'), dx, dy);
              }
              else {
                if (mode === 'build') {
                  const path = paths.get(event.id);
                  if (path) {
                    path.push(p);
                    commit(path);
                    paths.delete(event.id);
                  }
                }
                previous.delete(event.id);
                pointerDelta.delete(event.id);
              }
            }
          const pointer = selectHeldSplashPointer(input.snapshot.pointers);
          if (mode === 'pour' && pointer) {
            accumulator += splashNumber(config, 'emitRate') * dt;
            const count = Math.min(80, Math.floor(accumulator));
            accumulator -= count;
            const delta = pointerDelta.get(pointer.id) ?? { x: 0, y: 0 };
            pour(pointer.x, pointer.y, count, splashNumber(config, 'pourRadius'), delta.x, delta.y);
            pointerDelta.set(pointer.id, { x: delta.x * 0.72, y: delta.y * 0.72 });
          }
          else
            accumulator = 0;
          if ((launch.profile === 'demo' || launch.profile === 'preview') && input.snapshot.pointers.length === 0) {
            const x = width * (0.52 + Math.sin(time * 0.9) * 0.25);
            accumulator += splashNumber(config, 'emitRate') * dt * (launch.profile === 'preview' ? 0.08 : 0.22);
            const count = Math.min(45, Math.floor(accumulator));
            accumulator -= count;
            if (count)
              pour(x, height * 0.14, count, splashNumber(config, 'pourRadius') * 0.7, Math.cos(time) * 1.8, 8.5);
          }
          if (activeBackend === 'gpu') {
            try {
              gpuRuntime.step(dt, tuning(), width, height);
            } catch {
              activeBackend = 'cpu';
              restoreCpuFromGpuOrReset();
              model.step(dt, width, height, tuning());
            }
          } else {
            model.step(dt, width, height, tuning());
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.splash-mpm.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), renderStyle = splashString(config, 'renderStyle');
          if (activeBackend === 'gpu') {
            gpu.submit('splash-mpm.gpu-pic-flip', target => {
              renderGpuFluid(target, style, renderStyle);
            });
          }
          else if (renderStyle !== 'basic') {
            const palette = style.palette.slice(0, 4).map(splashRgb);
            renderer.submitMetaballs({
              id: 'splash-mpm.surface', count: model.count, positions: model.world.positions,
              radii: model.world.radii, temperatures: model.foam, worldWidth: width, worldHeight: height,
              palette, background: splashRgb(style.background),
              ...resolveSplashSurfaceParameters(config, width),
              time, backgroundDepth: 0
            });
          }
          renderer.submitSegments({
            id: 'splash-mpm.obstacles', ...model.packSegments(), worldWidth: width, worldHeight: height,
            palette: [[0.35, 0.4, 0.46], [0.78, 0.82, 0.86]], radiusScale: 1, opacity: 0.92, blend: 'alpha'
          });
          if (activeBackend === 'cpu' && (renderStyle === 'basic' || renderStyle === 'ultra')) {
            if (renderStyle === 'ultra') updateUltraParticleRenderData(styleId);
            const ultraPalette = style.palette.slice(1, 4).map((color, index) => {
              const rgb = splashRgb(color);
              return [rgb[0], rgb[1], rgb[2], 0.1 + index * 0.16] as const;
            });
            renderer.submitParticles({
              id: 'splash-mpm-particles',
              count: model.count,
              positions: model.world.positions,
              radii: renderStyle === 'ultra' ? renderedRadii : model.world.radii,
              colorSeeds: renderStyle === 'ultra' ? renderedColorSeeds : model.world.colorSeeds,
              palette: renderStyle === 'basic' ? style.palette.slice(0, 4).map(splashRgba) : ultraPalette,
              paletteMode: renderStyle === 'ultra' ? 'indexed' : 'hashed',
              shading: 'flat',
              blend: renderStyle === 'ultra' ? 'additive' : 'alpha',
              opacity: renderStyle === 'basic' ? splashNumber(config, 'opacity') : 1
            });
          }
          const pegs = model.packPegs();
          renderer.submitParticles({
            id: 'splash-mpm-pegs',
            count: pegs.count,
            positions: pegs.positions,
            radii: pegs.radii,
            colorSeeds: pegs.seeds,
            palette: [
              [
                0.5,
                0.54,
                0.6,
                1
              ]
            ],
            blend: 'alpha',
            opacity: 0.95
          });
          const preview = packBuildPreview(paths.values(), splashNumber(config, 'buildRadius'));
          if (mode === 'build' && preview.count > 0) renderer.submitSegments({
            id: 'splash-mpm.build-preview', ...preview, worldWidth: width, worldHeight: height,
            palette: [[0.78, 0.82, 0.86]], opacity: 0.82, blend: 'alpha'
          });
        }
      });
      function reset(regenerateLayout: boolean) {
        const authored = tuning();
        const t = launch.profile === 'preview' ? { ...authored, maxParticles: Math.min(8192, authored.maxParticles) } : authored;
        if (regenerateLayout) layoutSeed = waterTankObstacleLayoutSeed(launch.seed ?? SPLASH_MPM_LAYOUT_SEED, layoutGeneration++);
        model.reset(width, height, t);
        model.seed(width, height, t);
        model.seedObstacles(
          width,
          height,
          Math.floor(splashNumber(config, 'obstacleRamps')),
          Math.floor(splashNumber(config, 'obstaclePegs')),
          splashNumber(config, 'buildRadius'),
          layoutSeed,
        );
        obstacleRevision += 1;
        if (activeBackend === 'gpu') {
          model.prepareSnapshotGrid(width, height, t);
          gpuRuntime.resetFromSnapshot(model.snapshot(), t);
        }
        accumulator = 0;
        time = 0;
        paths.clear();
        previous.clear();
        pointerDelta.clear();
      }
      function commit(path: readonly Point[]) {
        const fixture = createBuildFixture(path, splashNumber(config, 'buildRadius'));
        if (!fixture) return;
        if (fixture.ax === fixture.bx && fixture.ay === fixture.by) model.addCircle(fixture.ax, fixture.ay, fixture.radius);
        else model.addSegment(fixture.ax, fixture.ay, fixture.bx, fixture.by, fixture.radius);
        obstacleRevision += 1;
        if (activeBackend === 'gpu') gpuRuntime.setObstacles(model.obstacles, obstacleRevision);
      }
      function pour(x: number, y: number, count: number, radius: number, dx = 0, dy = 0): number {
        if (activeBackend === 'gpu') return gpuRuntime.pour(x, y, count, radius, splashNumber(config, 'particleRadius'), dx, dy);
        return model.pour(x, y, count, radius, dx, dy);
      }
      function splash(x: number, y: number, radius: number, force: number, dx: number, dy: number): void {
        if (activeBackend === 'gpu') gpuRuntime.splash(x, y, radius, force, dx, dy);
        else model.splash(x, y, radius, force, dx, dy);
      }
      function tuning(): SplashMpmTuning {
        return {
          maxParticles: splashNumber(config, 'maxParticles'),
          resolution: splashNumber(config, 'resolution'),
          stiffness: splashNumber(config, 'stiffness'),
          restDensity: splashNumber(config, 'restDensity'),
          separation: splashNumber(config, 'particleSeparation'),
          viscosity: splashNumber(config, 'viscosity'),
          flipness: splashNumber(config, 'flipness'),
          gravity: splashNumber(config, 'gravity'),
          radius: splashNumber(config, 'particleRadius')
        };
      }
      function updateUltraParticleRenderData(currentStyleId: string): void {
        const pointScale = splashPointScale(currentStyleId);
        for (let index = 0; index < model.count; index++) {
          const offset = index * 2;
          const speed = Math.hypot(model.world.velocities[offset] ?? 0, model.world.velocities[offset + 1] ?? 0);
          const foam = model.foam[index] ?? 0;
          const motionScale = 0.64 + smoothstep(120, 1280, speed) * 0.48 + Math.max(0, Math.min(1, foam)) * 0.18;
          const radius = Math.max(0.7, Math.min(2.2, Math.sqrt(Math.max(0, model.world.radii[index] ?? 0)) * 0.82));
          renderedRadii[index] = radius * 1.35 * pointScale * Math.max(0.62, Math.min(1.3, motionScale));
          renderedColorSeeds[index] = Math.min(2, Math.floor(Math.max(0, Math.min(0.999, Math.max(speed / 1200, foam))) * 3));
        }
      }
      function backendDecision(): SplashPicFlipBackendDecision {
        const renderPath = gpuRenderPathForStyle(splashString(config, 'renderStyle'));
        return resolveSplashPicFlipBackend(gpu.capabilities, {
          gpuImplemented: true,
          parityValidated: gpuParityValidated,
          renderPath,
          gpuParticleRenderImplemented: renderPath === 'particles' || renderPath === 'surface-with-particles',
        });
      }
      function migrateBackendIfNeeded(): void {
        const next = backendDecision().backend;
        if (next === activeBackend) return;
        if (next === 'gpu') {
          const currentTuning = tuning();
          model.prepareSnapshotGrid(width, height, currentTuning);
          gpuRuntime.resetFromSnapshot(model.snapshot(), currentTuning);
          activeBackend = 'gpu';
          return;
        }
        activeBackend = 'cpu';
        restoreCpuFromGpuOrReset();
      }
      function restoreCpuFromGpuOrReset(): void {
        if (!gpuRuntime.available) return;
        try {
          model.restore(gpuRuntime.snapshot(model.obstacles), width, height, tuning());
        } catch {
          reset(false);
        }
      }
      function particleCount(): number {
        return activeBackend === 'gpu' ? gpuRuntime.count : model.count;
      }
      function renderGpuFluid(target: GpuRenderTarget2D, style: typeof SPLASH_MPM_STYLE_MANIFEST.styles[number], renderStyle: string): void {
        if (renderStyle !== 'basic') {
          const surface = resolveSplashSurfaceParameters(config, width);
          gpuRuntime.renderMetaballs(target, {
            worldWidth: width,
            worldHeight: height,
            palette: style.palette.slice(0, 4).map(splashRgb),
            background: splashRgb(style.background),
            ...surface,
            ...(renderStyle === 'ultra' ? {
              thermalContrast: surface.thermalContrast * 0.24,
              thermalStrength: surface.thermalStrength * 0.34,
            } : {}),
            time,
            backgroundDepth: 0,
          });
        }
        if (renderStyle === 'basic') {
          gpuRuntime.renderParticles(target, {
            worldWidth: width,
            worldHeight: height,
            radiusScale: 1,
            palette: style.palette.slice(0, 4).map(splashRgba),
            paletteMode: 'hashed',
            blend: 'alpha',
            opacity: splashNumber(config, 'opacity'),
          });
        }
      }
      function applyStyle() {
        const style = requireStyle(), ultra = splashString(config, 'renderStyle') === 'ultra';
        applyPaletteGradientBackdrop2D(renderer, style);
        renderer.setBloom({
          enabled: ultra,
          intensity: ultra ? splashNumber(config, 'liquidBloomStrength') : 0,
          threshold: 0.48,
          radius: 3.5,
          iterations: 2,
          resolutionScale: 0.5
        });
      }
      function requireStyle() {
        const style = SPLASH_MPM_STYLE_MANIFEST.styles.find(x => x.id === styleId);
        if (!style)
          throw new Error(`Unknown Splash MPM style: ${styleId}`);
        return style;
      }
      function record(): Readonly<Record<string, ExperienceSettingValue>> {
        return Object.freeze({
          ...config
        });
      }
    }
  };
}
function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validStyle(v: string | undefined) {
  return v && SPLASH_MPM_STYLE_MANIFEST.styles.some(x => x.id === v) ? v : undefined;
}
function gpuRenderPathForStyle(renderStyle: string): SplashPicFlipGpuRenderPath {
  if (renderStyle === 'basic') return 'particles';
  return 'surface';
}
export function selectHeldSplashPointer<T extends { readonly buttons: number }>(pointers: readonly T[]): T | undefined {
  return pointers.find(pointer => pointer.buttons !== 0);
}
function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
