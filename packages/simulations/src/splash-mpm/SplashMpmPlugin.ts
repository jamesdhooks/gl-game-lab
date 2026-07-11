import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { createSplashMpmConfig, SPLASH_MPM_DEFAULTS, splashNumber, splashString, type SplashMpmConfig } from './config.js';
import { SplashMpmModel, type SplashMpmTuning } from './SplashMpmModel.js';
import { splashRgb, splashRgba, SPLASH_MPM_STYLE_MANIFEST } from './styles.js';
export type SplashMpmMode = 'splash' | 'pour' | 'build';
export interface SplashMpmController extends ExperienceRuntimeController {
  readonly mode: SplashMpmMode;
  readonly particleCount: number;
  readonly obstacleCount: number;
}
export const SplashMpmControllerService = createExtensionToken<SplashMpmController>('gl-game-lab.simulations.splash-mpm.controller');
export const SPLASH_MPM_PLUGIN_ID = 'gl-game-lab.simulations.splash-mpm';
type Point = {
  readonly x: number;
  readonly y: number;
};
export function createSplashMpmPlugin(initial: SplashMpmConfig = SPLASH_MPM_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: SplashMpmMode = launch.modeId === 'pour' || launch.modeId === 'build' ? launch.modeId : 'splash', styleId = validStyle(launch.styleId) ?? SPLASH_MPM_STYLE_MANIFEST.defaultStyleId, width = 1, height = 1, pendingReset = true, time = 0, accumulator = 0, cleanup = (): void => undefined;
  const model = new SplashMpmModel(), paths = new Map<number, Point[]>(), previous = new Map<number, Point>();
  return {
    id: SPLASH_MPM_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      cleanup = () => undefined;
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
          return model.count;
        },
        get particleCount() {
          return model.count;
        },
        get obstacleCount() {
          return model.obstacles.length;
        },
        setMode: v => {
          if (v !== 'splash' && v !== 'pour' && v !== 'build')
            throw new Error(`Unknown Splash MPM mode: ${v}`);
          mode = v;
          paths.clear();
          previous.clear();
        },
        setStyle: v => {
          const next = validStyle(v);
          if (!next)
            throw new Error(`Unknown Splash MPM style: ${v}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          config = createSplashMpmConfig({
            ...record(),
            [key]: value
          });
          if (key === 'resolution' || key === 'maxParticles' || key === 'particleRadius')
            pendingReset = true;
          applyStyle();
        },
        reset: () => {
          pendingReset = true;
        }
      };
      context.provide(SplashMpmControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.splash-mpm.update',
        stage: 'update',
        run: ({ time: clock }) => {
          const w = Math.max(1, renderer.viewport.width), h = Math.max(1, renderer.viewport.height), dt = Math.min(1 / 30, clock.deltaSeconds);
          time += dt;
          if (pendingReset || w !== width || h !== height) {
            width = w;
            height = h;
            reset();
            pendingReset = false;
          }
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer') {
              const p = {
                x: event.x,
                y: event.y
              }, last = previous.get(event.id) ?? p, vx = (p.x - last.x) / Math.max(0.001, dt), vy = (p.y - last.y) / Math.max(0.001, dt);
              if (event.phase === 'down') {
                previous.set(event.id, p);
                if (mode === 'build')
                  paths.set(event.id, [
                    p
                  ]);
                else if (mode === 'pour')
                  model.pour(p.x, p.y, 12, splashNumber(config, 'pourRadius'), 0, 140);
              }
              else if (event.phase === 'move') {
                previous.set(event.id, p);
                if (mode === 'build') {
                  const path = paths.get(event.id);
                  if (path && distance(path[path.length - 1] ?? p, p) > 5)
                    path.push(p);
                }
                else if (mode === 'splash')
                  model.splash(p.x, p.y, splashNumber(config, 'inputRadius'), splashNumber(config, 'inputForce'), vx, vy);
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
              }
            }
          const pointer = input.snapshot.pointers[0];
          if (mode === 'pour' && pointer) {
            accumulator += splashNumber(config, 'emitRate') * dt;
            const count = Math.min(80, Math.floor(accumulator));
            accumulator -= count;
            model.pour(pointer.x, pointer.y, count, splashNumber(config, 'pourRadius'), 0, 160);
          }
          else
            accumulator = 0;
          if ((launch.profile === 'demo' || launch.profile === 'preview') && input.snapshot.pointers.length === 0) {
            const x = width * (0.52 + Math.sin(time * 0.9) * 0.25);
            accumulator += splashNumber(config, 'emitRate') * dt * (launch.profile === 'preview' ? 0.08 : 0.22);
            const count = Math.min(45, Math.floor(accumulator));
            accumulator -= count;
            if (count)
              model.pour(x, height * 0.14, count, splashNumber(config, 'pourRadius') * 0.7, Math.cos(time) * 40, 145);
          }
          model.step(dt, width, height, tuning());
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.splash-mpm.render',
        stage: 'renderExtract',
        run: () => {
          const style = requireStyle(), renderStyle = splashString(config, 'renderStyle'), palette = style.palette.slice(0, 4).map(splashRgb);
          if (renderStyle !== 'basic') renderer.submitMetaballs({
            id: 'splash-mpm.surface', count: model.count, positions: model.world.positions,
            radii: model.world.radii, temperatures: model.foam, worldWidth: width, worldHeight: height,
            fieldScale: Math.max(0.2, Math.min(1, splashNumber(config, 'enhancedQuality') * splashNumber(config, 'liquidFieldScale') * 0.75)),
            particleRadiusScale: splashNumber(config, 'enhancedSplatSize') * splashNumber(config, 'liquidParticleRadius'),
            threshold: splashNumber(config, 'liquidSurfaceThreshold'),
            edgeSoftness: splashNumber(config, 'liquidEdgeSoftness') * (2 - splashNumber(config, 'liquidEdgeTightness')),
            palette, background: splashRgb(style.background),
            thermalContrast: renderStyle === 'ultra' ? 1 + splashNumber(config, 'liquidFoamStrength') * 0.3 : splashNumber(config, 'enhancedDepth'),
            refraction: splashNumber(config, 'liquidRefraction'), gloss: splashNumber(config, 'liquidGloss'),
            rimLighting: splashNumber(config, 'enhancedEdge'), opacity: splashNumber(config, 'opacity'),
            time, backgroundDepth: 0
          });
          renderer.submitSegments({
            id: 'splash-mpm.obstacles', ...model.packSegments(), worldWidth: width, worldHeight: height,
            palette: [[0.35, 0.4, 0.46], [0.78, 0.82, 0.86]], radiusScale: 1, opacity: 0.92, blend: 'alpha'
          });
          if (renderStyle === 'basic' || renderStyle === 'ultra')
            renderer.submitParticles({
              id: 'splash-mpm-particles',
              count: model.count,
              positions: model.world.positions,
              radii: model.world.radii,
              colorSeeds: model.world.colorSeeds,
              palette: renderStyle === 'basic' ? style.palette.slice(0, 4).map(splashRgba) : [
                [
                  1,
                  1,
                  1,
                  0.2
                ]
              ],
              blend: renderStyle === 'ultra' ? 'additive' : 'alpha',
              opacity: renderStyle === 'basic' ? splashNumber(config, 'opacity') : 0.22
            });
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
        }
      });
      function reset() {
        const t = tuning();
        model.reset(width, height, t);
        model.seed(width, height, t, launch.profile === 'preview');
        model.addSegment(width * 0.58, height * 0.62, width * 0.86, height * 0.7, splashNumber(config, 'buildRadius'));
        accumulator = 0;
        time = 0;
        paths.clear();
        previous.clear();
      }
      function commit(path: readonly Point[]) {
        const a = path[0], b = path[path.length - 1], r = splashNumber(config, 'buildRadius');
        if (!a || !b)
          return;
        if (path.length < 3 || distance(a, b) < r * 0.7)
          model.addCircle(a.x, a.y, r);
        else
          model.addSegment(a.x, a.y, b.x, b.y, r);
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
      function applyStyle() {
        const style = requireStyle(), bg = splashRgb(style.background), ultra = splashString(config, 'renderStyle') === 'ultra';
        renderer.setClearColor([
          bg[0],
          bg[1],
          bg[2],
          1
        ]);
        renderer.setBackdrop(undefined);
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
    },
    dispose: () => cleanup()
  };
}
function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function validStyle(v: string | undefined) {
  return v && SPLASH_MPM_STYLE_MANIFEST.styles.some(x => x.id === v) ? v : undefined;
}
