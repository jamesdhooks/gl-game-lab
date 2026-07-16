import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { applyPaletteGradientBackdrop2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createBuildFixture, packBuildPreview } from '../BuildFixtures.js';
import { createWaterTankConfig, WATER_TANK_DEFAULTS, waterNumber, waterString, type WaterTankConfig } from './config.js';
import { WaterTankModel, waterTankObstacleLayoutSeed, type WaterTankTuning } from './WaterTankModel.js';
import { waterColor3, waterColor4, WATER_TANK_STYLE_MANIFEST } from './styles.js';
export type WaterTankMode = 'pour' | 'splash' | 'build';
export interface WaterTankController extends ExperienceRuntimeController {
  readonly mode: WaterTankMode;
  readonly waterCount: number;
  readonly obstacleCount: number;
}
export const WaterTankControllerService = createExtensionToken<WaterTankController>('gl-game-lab.simulations.water-tank.controller');
export const WATER_TANK_PLUGIN_ID = 'gl-game-lab.simulations.water-tank';
type Point = {
  readonly x: number;
  readonly y: number;
};
export function createWaterTankPlugin(initial: WaterTankConfig = WATER_TANK_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: WaterTankMode = launch.modeId === 'splash' || launch.modeId === 'build' ? launch.modeId : 'pour', styleId = validStyle(launch.styleId) ?? WATER_TANK_STYLE_MANIFEST.defaultStyleId, width = 1, height = 1, pendingReset = true, pendingLayoutRegeneration = true, elapsed = 0, spawnAccumulator = 0, layoutGeneration = 0, layoutSeed = waterTankObstacleLayoutSeed(launch.seed ?? 8027693, 0), cleanup = (): void => undefined;
  const model = new WaterTankModel(), paths = new Map<number, Point[]>(), previous = new Map<number, Point>(), pointerVelocity = new Map<number, Point>();
  return {
    id: WATER_TANK_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      cleanup = () => undefined;
      applyStyle();
      const controller: WaterTankController = {
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
          return model.count;
        },
        get waterCount() {
          return model.count;
        },
        get obstacleCount() {
          return model.obstacles.length;
        },
        setMode: value => {
          if (value !== 'pour' && value !== 'splash' && value !== 'build')
            throw new Error(`Unknown Water Tank mode: ${value}`);
          mode = value;
          paths.clear();
          previous.clear();
          pointerVelocity.clear();
          spawnAccumulator = 0;
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Water Tank style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const layout = key === 'obstacleRamps' || key === 'obstaclePegs' || key === 'buildRadius';
          config = createWaterTankConfig({
            ...record(),
            [key]: value
          });
          model.configure(tuning());
          if (layout) {
            pendingReset = true;
            pendingLayoutRegeneration = true;
          }
          applyStyle();
        },
        reset: () => {
          pendingReset = true;
          pendingLayoutRegeneration = true;
        }
      };
      registerSimulationRuntime(context, WaterTankControllerService, controller, () => cleanup());
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.water-tank.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.viewport.width), nextHeight = Math.max(1, renderer.viewport.height), dt = Math.min(1 / 30, time.deltaSeconds);
          elapsed += dt;
          if (pendingReset || nextWidth !== width || nextHeight !== height) {
            const regenerateLayout = pendingLayoutRegeneration;
            width = nextWidth;
            height = nextHeight;
            reset(regenerateLayout);
            pendingReset = false;
            pendingLayoutRegeneration = false;
          }
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer') {
              const point = {
                x: event.x,
                y: event.y
              }, prior = previous.get(event.id) ?? point, vx = (point.x - prior.x) / Math.max(0.001, dt), vy = (point.y - prior.y) / Math.max(0.001, dt);
              if (event.phase === 'down') {
                previous.set(event.id, point);
                pointerVelocity.set(event.id, { x: 0, y: 0 });
                if (mode === 'build')
                  paths.set(event.id, [
                    point
                  ]);
                else if (mode === 'pour')
                  model.pour(point.x, point.y, Math.min(80, Math.ceil(waterNumber(config, 'pourRate') * 0.012)), waterNumber(config, 'pourRadius'), 0, 120);
              }
              else if (event.phase === 'move') {
                previous.set(event.id, point);
                pointerVelocity.set(event.id, { x: vx, y: vy });
                if (mode === 'build') {
                  const path = paths.get(event.id);
                  if (path && distance(path[path.length - 1] ?? point, point) > 5)
                    path.push(point);
                }
                else if (mode === 'splash')
                  model.splash(point.x, point.y, waterNumber(config, 'interactionRadius'), waterNumber(config, 'interactionStrength'), vx, vy);
              }
              else {
                if (mode === 'build') {
                  const path = paths.get(event.id);
                  if (path) {
                    if (distance(path[path.length - 1] ?? point, point) > 2)
                      path.push(point);
                    commitBuild(path);
                    paths.delete(event.id);
                  }
                }
                previous.delete(event.id);
                pointerVelocity.delete(event.id);
              }
            }
          const pointer = selectHeldWaterTankPointer(input.snapshot.pointers);
          if (mode === 'pour' && pointer) {
            spawnAccumulator = Math.min(waterNumber(config, 'pourRate'), spawnAccumulator + waterNumber(config, 'pourRate') * dt);
            const count = Math.min(260, Math.floor(spawnAccumulator));
            spawnAccumulator -= count;
            const velocity = pointerVelocity.get(pointer.id) ?? { x: 0, y: 0 };
            model.pour(pointer.x, pointer.y, count, waterNumber(config, 'pourRadius'), velocity.x * 0.08, velocity.y * 0.08 + 125);
            pointerVelocity.set(pointer.id, { x: 0, y: 0 });
          }
          else
            spawnAccumulator = 0;
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0) {
            const x = width * (0.5 + Math.sin(elapsed * 1.1) * 0.28), y = height * (0.16 + Math.cos(elapsed * 0.8) * 0.07);
            spawnAccumulator += waterNumber(config, 'pourRate') * dt * (launch.profile === 'preview' ? 0.12 : 0.32);
            const count = Math.min(90, Math.floor(spawnAccumulator));
            spawnAccumulator -= count;
            if (count > 0)
              model.pour(x, y, count, waterNumber(config, 'pourRadius') * 0.65, Math.cos(elapsed * 1.6) * 35, 110);
          }
          model.step(dt, width, height, tuning());
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.water-tank.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), renderStyle = waterString(config, 'renderStyle'), palette = style.palette.slice(0, 4).map(waterColor3);
          if (renderStyle !== 'basic') renderer.submitMetaballs({
            id: 'water-tank.surface', count: model.count, positions: model.world.positions,
            radii: model.world.radii, temperatures: model.foam, worldWidth: width, worldHeight: height,
            fieldScale: Math.max(0.2, Math.min(1, waterNumber(config, 'fluidGridResolution') * waterNumber(config, 'liquidFieldScale') / Math.max(1, renderer.viewport.width))),
            particleRadiusScale: waterNumber(config, 'liquidSplatDensity') * waterNumber(config, 'liquidParticleRadius') * 1.35,
            threshold: waterNumber(config, 'liquidSurfaceThreshold') * 0.68,
            edgeSoftness: waterNumber(config, 'liquidEdgeSoftness') * (2 - waterNumber(config, 'liquidEdgeTightness')),
            edgeTightness: waterNumber(config, 'liquidEdgeTightness'),
            palette, background: waterColor3(style.background),
            thermalContrast: renderStyle === 'ultra' ? 1 + waterNumber(config, 'liquidFoamStrength') * 0.25 : 0.65,
            refraction: waterNumber(config, 'liquidRefraction'), gloss: waterNumber(config, 'liquidGloss'),
            rimLighting: renderStyle === 'ultra' ? waterNumber(config, 'liquidFoamStrength') * 0.28 : 0.28,
            foamStrength: renderStyle === 'ultra' ? waterNumber(config, 'liquidFoamStrength') : 0,
            thermalStrength: renderStyle === 'ultra' ? 1 : 0.48,
            bloomStrength: renderStyle === 'ultra' ? waterNumber(config, 'liquidBloomStrength') : 0,
            heatShimmer: renderStyle === 'ultra' ? waterNumber(config, 'liquidHeatShimmer') : 0,
            depthDiffusion: renderStyle === 'ultra' ? waterNumber(config, 'liquidDepthDiffusion') : 0,
            renderStyle: renderStyle === 'ultra' ? 'ultra' : 'enhanced',
            opacity: Math.min(1, waterNumber(config, 'opacity') + waterNumber(config, 'metaballBlend') * 0.24),
            time: elapsed, backgroundDepth: 0
          });
          renderer.submitSegments({
            id: 'water-tank.obstacles', ...model.packSegments(), worldWidth: width, worldHeight: height,
            palette: [[0.32, 0.38, 0.44], [0.72, 0.78, 0.84]], radiusScale: 1, opacity: 0.92, blend: 'alpha'
          });
          if (renderStyle === 'basic')
            renderer.submitParticles({
              id: 'water-tank-particles',
              count: model.count,
              positions: model.world.positions,
              radii: model.world.radii,
              colorSeeds: model.world.colorSeeds,
              palette: style.palette.slice(0, 4).map(waterColor4),
              blend: 'alpha',
              opacity: waterNumber(config, 'opacity')
            });
          const pegs = model.packPegs();
          renderer.submitParticles({
            id: 'water-tank-pegs',
            count: pegs.count,
            positions: pegs.positions,
            radii: pegs.radii,
            colorSeeds: pegs.seeds,
            palette: [
              [
                0.45,
                0.5,
                0.55,
                1
              ],
              [
                0.75,
                0.8,
                0.85,
                1
              ]
            ],
            blend: 'alpha',
            opacity: 0.94
          });
          const preview = packBuildPreview(paths.values(), waterNumber(config, 'buildRadius'));
          if (mode === 'build' && preview.count > 0) renderer.submitSegments({
            id: 'water-tank.build-preview', ...preview, worldWidth: width, worldHeight: height,
            palette: [[0.72, 0.78, 0.84]], opacity: 0.82, blend: 'alpha'
          });
        }
      });
      function reset(regenerateLayout: boolean) {
        const next = tuning(), preview = launch.profile === 'preview';
        if (regenerateLayout) layoutSeed = waterTankObstacleLayoutSeed(launch.seed ?? 8027693, layoutGeneration++);
        model.reset(width, height, preview ? {
          ...next,
          maxParticles: Math.min(1024, next.maxParticles)
        } : next);
        const ramps = Math.floor(waterNumber(config, 'obstacleRamps'));
        const pegs = Math.floor(waterNumber(config, 'obstaclePegs'));
        const buildRadius = waterNumber(config, 'buildRadius');
        model.seedObstacles(width, height, ramps, pegs, buildRadius, layoutSeed);
        const columns = Math.max(8, Math.floor(width / (next.particleRadius * 2.15)));
        const rows = Math.max(4, Math.floor(height * 0.42 / (next.particleRadius * 2.05)));
        const initialCount = Math.min(next.maxParticles, columns * rows);
        model.seedReservoir(width, height, initialCount, next.particleRadius);
        spawnAccumulator = 0;
        elapsed = 0;
        paths.clear();
        previous.clear();
        pointerVelocity.clear();
      }
      function commitBuild(path: readonly Point[]) {
        const fixture = createBuildFixture(path, waterNumber(config, 'buildRadius'));
        if (!fixture) return;
        if (fixture.ax === fixture.bx && fixture.ay === fixture.by) model.addCircle(fixture.ax, fixture.ay, fixture.radius);
        else model.addSegment(fixture.ax, fixture.ay, fixture.bx, fixture.by, fixture.radius);
      }
      function tuning(): WaterTankTuning {
        return {
          maxParticles: waterNumber(config, 'maxParticles'),
          particleRadius: waterNumber(config, 'particleRadius'),
          gravity: waterNumber(config, 'gravity'),
          viscosity: waterNumber(config, 'viscosity'),
          viscositySigma: waterNumber(config, 'viscositySigma'),
          viscosityBeta: waterNumber(config, 'viscosityBeta'),
          fluidity: waterNumber(config, 'fluidity'),
          supportRadiusScale: waterNumber(config, 'supportRadiusScale'),
          restDensity: waterNumber(config, 'restDensity'),
          stiffness: waterNumber(config, 'stiffness'),
          nearStiffness: waterNumber(config, 'nearStiffness'),
          neighborPairBudget: waterNumber(config, 'neighborPairBudget'),
          surfaceTension: waterNumber(config, 'surfaceTension'),
          collisionBounce: waterNumber(config, 'collisionBounce'),
          maxFluidSpeed: waterNumber(config, 'maxFluidSpeed'),
          substeps: waterNumber(config, 'substeps')
        };
      }
      function applyStyle() {
        const style = requireStyle(), ultra = waterString(config, 'renderStyle') === 'ultra';
        applyPaletteGradientBackdrop2D(renderer, style);
        renderer.setBloom({
          enabled: ultra,
          intensity: ultra ? waterNumber(config, 'liquidBloomStrength') : 0,
          threshold: 0.52,
          radius: 3.6,
          iterations: 2,
          resolutionScale: 0.5
        });
      }
      function requireStyle() {
        const style = WATER_TANK_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style)
          throw new Error(`Unknown Water Tank style: ${styleId}`);
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

export function selectHeldWaterTankPointer<T extends { readonly buttons: number }>(pointers: readonly T[]): T | undefined {
  return pointers.find(pointer => pointer.buttons !== 0);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validStyle(value: string | undefined) {
  return value && WATER_TANK_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
