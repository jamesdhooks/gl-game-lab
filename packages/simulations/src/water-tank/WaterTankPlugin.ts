import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createWaterTankConfig, WATER_TANK_DEFAULTS, waterNumber, waterString, type WaterTankConfig } from './config.js';
import { WaterTankModel, type WaterTankTuning } from './WaterTankModel.js';
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
  let config = initial, mode: WaterTankMode = launch.modeId === 'splash' || launch.modeId === 'build' ? launch.modeId : 'pour', styleId = validStyle(launch.styleId) ?? WATER_TANK_STYLE_MANIFEST.defaultStyleId, width = 1, height = 1, pendingReset = true, elapsed = 0, spawnAccumulator = 0, cleanup = (): void => undefined;
  const model = new WaterTankModel(), paths = new Map<number, Point[]>(), previous = new Map<number, Point>();
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
          if (layout)
            pendingReset = true;
          applyStyle();
        },
        reset: () => {
          pendingReset = true;
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
            width = nextWidth;
            height = nextHeight;
            reset();
            pendingReset = false;
          }
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer') {
              const point = {
                x: event.x,
                y: event.y
              }, prior = previous.get(event.id) ?? point, vx = (point.x - prior.x) / Math.max(0.001, dt), vy = (point.y - prior.y) / Math.max(0.001, dt);
              if (event.phase === 'down') {
                previous.set(event.id, point);
                if (mode === 'build')
                  paths.set(event.id, [
                    point
                  ]);
                else if (mode === 'pour')
                  model.pour(point.x, point.y, Math.min(80, Math.ceil(waterNumber(config, 'pourRate') * 0.012)), waterNumber(config, 'pourRadius'), 0, 120);
              }
              else if (event.phase === 'move') {
                previous.set(event.id, point);
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
              }
            }
          const pointer = input.snapshot.pointers[0];
          if (mode === 'pour' && pointer) {
            spawnAccumulator = Math.min(waterNumber(config, 'pourRate'), spawnAccumulator + waterNumber(config, 'pourRate') * dt);
            const count = Math.min(260, Math.floor(spawnAccumulator));
            spawnAccumulator -= count;
            const prior = previous.get(pointer.id) ?? pointer;
            model.pour(pointer.x, pointer.y, count, waterNumber(config, 'pourRadius'), (pointer.x - prior.x) * 6, (pointer.y - prior.y) * 6 + 125);
            previous.set(pointer.id, {
              x: pointer.x,
              y: pointer.y
            });
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
            particleRadiusScale: waterNumber(config, 'liquidSplatDensity') * waterNumber(config, 'liquidParticleRadius'),
            threshold: waterNumber(config, 'liquidSurfaceThreshold'),
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
          else if (renderStyle === 'ultra')
            renderer.submitParticles({
              id: 'water-tank-foam',
              count: model.count,
              positions: model.world.positions,
              radii: model.world.radii,
              colorSeeds: model.world.colorSeeds,
              palette: [
                [
                  1,
                  1,
                  1,
                  0.18
                ]
              ],
              blend: 'additive',
              opacity: 0.16
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
        }
      });
      function reset() {
        const next = tuning(), preview = launch.profile === 'preview';
        model.reset(width, height, preview ? {
          ...next,
          maxParticles: Math.min(1024, next.maxParticles)
        } : next);
        model.seedObstacles(width, height, Math.floor(waterNumber(config, 'obstacleRamps')), Math.floor(waterNumber(config, 'obstaclePegs')), waterNumber(config, 'buildRadius'));
        model.pour(width * 0.5, height * 0.12, Math.min(preview ? 220 : 360, Math.floor(next.maxParticles * 0.18)), width * 0.22, 0, 150);
        spawnAccumulator = 0;
        elapsed = 0;
        paths.clear();
        previous.clear();
      }
      function commitBuild(path: readonly Point[]) {
        const radius = waterNumber(config, 'buildRadius'), first = path[0], last = path[path.length - 1];
        if (!first || !last)
          return;
        if (path.length < 2 || distance(first, last) < radius * 0.7)
          model.addCircle(first.x, first.y, radius);
        else
          model.addSegment(first.x, first.y, last.x, last.y, radius);
      }
      function tuning(): WaterTankTuning {
        return {
          maxParticles: waterNumber(config, 'maxParticles'),
          particleRadius: waterNumber(config, 'particleRadius'),
          gravity: waterNumber(config, 'gravity'),
          viscosity: waterNumber(config, 'viscosity'),
          viscositySigma: waterNumber(config, 'viscositySigma'),
          viscosityBeta: waterNumber(config, 'viscosityBeta'),
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
        const style = requireStyle(), background = waterColor3(style.background), ultra = waterString(config, 'renderStyle') === 'ultra';
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
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
function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validStyle(value: string | undefined) {
  return value && WATER_TANK_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
