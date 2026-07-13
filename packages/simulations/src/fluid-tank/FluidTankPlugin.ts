import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type FluidSplat2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createFluidTankConfig, FLUID_TANK_DEFAULTS, fluidBoolean, fluidNumber, fluidString, type FluidTankConfig } from './config.js';
import { fluidColor3, FLUID_TANK_STYLE_MANIFEST } from './styles.js';
export type FluidTankMode = 'inject' | 'stir';
export interface FluidTankController extends ExperienceRuntimeController {
  readonly mode: FluidTankMode;
  readonly fieldResolution: number;
}
export const FluidTankControllerService = createExtensionToken<FluidTankController>('gl-game-lab.simulations.fluid-tank.controller');
export const FLUID_TANK_PLUGIN_ID = 'gl-game-lab.simulations.fluid-tank';
export function createFluidTankPlugin(initial: FluidTankConfig = FLUID_TANK_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: FluidTankMode = launch.modeId === 'stir' ? 'stir' : 'inject', styleId = validStyle(launch.styleId) ?? FLUID_TANK_STYLE_MANIFEST.defaultStyleId, pendingDt = 0, elapsed = 0, rebuild = false, needsSeed = true, disposed = false, imageRequest = 0, randomState = (launch.seed ?? 260527) >>> 0, cleanup = (): void => undefined;
  const splats: FluidSplat2D[] = [], previous = new Map<number, {
    x: number;
    y: number;
  }>();
  return {
    id: FLUID_TANK_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      let aspect = 1, field = createField();
      cleanup = () => field.dispose();
      applyStyle();
      const controller: FluidTankController = {
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
          return field.width * field.height;
        },
        get fieldResolution() {
          return field.width;
        },
        setMode: value => {
          if (value !== 'inject' && value !== 'stir')
            throw new Error(`Unknown Fluid Tank mode: ${value}`);
          mode = value;
          previous.clear();
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Fluid Tank style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const oldCell = fluidNumber(config, 'cellSize'), oldInit = fluidString(config, 'renderStyle'), oldUrl = fluidString(config, 'initImageUrl');
          config = createFluidTankConfig({
            ...record(),
            [key]: value
          });
          if (oldCell !== fluidNumber(config, 'cellSize'))
            rebuild = true;
          if (oldInit !== fluidString(config, 'renderStyle') || oldUrl !== fluidString(config, 'initImageUrl'))
            needsSeed = true;
          applyStyle();
        },
        reset: () => {
          splats.length = 0;
          previous.clear();
          field.clear();
          needsSeed = true;
          pendingDt = 0;
          elapsed = 0;
        }
      };
      registerSimulationRuntime(context, FluidTankControllerService, controller, () => {
        disposed = true;
        imageRequest++;
        cleanup();
        splats.length = 0;
        previous.clear();
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fluid-tank.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(1 / 30, time.deltaSeconds) * fluidNumber(config, 'timescale');
          pendingDt += dt;
          elapsed += dt;
          const currentAspect = renderer.viewport.height / Math.max(1, renderer.viewport.width);
          if (Math.abs(currentAspect - aspect) > 0.04)
            rebuild = true;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer')
              routePointer(event);
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0 && Math.floor((elapsed - dt) * 3) !== Math.floor(elapsed * 3)) {
            const angle = elapsed * 0.73 + random() * 2, speed = 0.8 + random() * 1.5;
            splats.push({
              x: 0.14 + random() * 0.72,
              y: 0.16 + random() * 0.68,
              radius: 0.035 + random() * 0.035,
              velocityX: Math.cos(angle) * speed,
              velocityY: Math.sin(angle) * speed,
              dye: injectionColor(),
              amount: 0.5 + random() * 0.9
            });
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fluid-tank.render',
        stage: 'renderExtract',
        run: () => {
            if (rebuild) {
              field.dispose();
              field = createField();
              rebuild = false;
              needsSeed = true;
            }
            if (needsSeed) {
              seedField();
              needsSeed = false;
            }
            const dt = pendingDt;
            pendingDt = 0;
            if (dt > 0)
              field.step({
                deltaSeconds: dt,
                viscosity: fluidNumber(config, 'viscosity'),
                curl: fluidNumber(config, 'curl'),
                velocityDissipation: fluidNumber(config, 'velocityPersistence'),
                dyeDissipation: fluidNumber(config, 'dyePersistence'),
                pressureIterations: launch.profile === 'preview' ? Math.min(14, fluidNumber(config, 'pressureIterations')) : fluidNumber(config, 'pressureIterations'),
                ambient: fluidBoolean(config, 'ambient')
              }, splats.splice(0));
            const style = requireStyle(), reference = styleId === 'webgl-fluid-glow';
            renderer.submitFluidField('fluid-tank.stable-field', field, {
              palette: style.palette.slice(0, 4).map(fluidColor3),
              background: fluidColor3(style.background),
              shadingStrength: fluidNumber(config, 'shadingStrength') * (reference ? 1 : 0.72),
              sunraysStrength: fluidNumber(config, 'sunraysStrength') * (reference ? 1 : 0.42),
              exposure: exposureForStyle(styleId)
            });
        }
      });
      function routePointer(event: PointerInputEvent) {
        const width = Math.max(1, renderer.viewport.width), height = Math.max(1, renderer.viewport.height), point = {
          x: event.x / width,
          y: 1 - event.y / height
        };
        if (event.phase === 'up' || event.phase === 'cancel') {
          previous.delete(event.id);
          return;
        }
        const prior = previous.get(event.id) ?? {
          x: event.x,
          y: event.y
        }, force = fluidNumber(config, 'fingerForce'), dx = (event.x - prior.x) / width * force, dy = -(event.y - prior.y) / height * force, eddy = mode === 'stir' ? fluidNumber(config, 'eddyAssist') : fluidNumber(config, 'injectTurbulence') * 0.08;
        previous.set(event.id, {
          x: event.x,
          y: event.y
        });
        splats.push({
          x: clamp(point.x),
          y: clamp(point.y),
          radius: fluidNumber(config, 'fingerRadius'),
          velocityX: dx - dy * eddy + (event.phase === 'down' ? (random() - 0.5) * 0.5 : 0),
          velocityY: dy + dx * eddy + (event.phase === 'down' ? (random() - 0.5) * 0.5 : 0),
          dye: injectionColor(),
          amount: mode === 'inject' ? fluidNumber(config, 'injectAmount') : 0
        });
      }
      function createField() {
        const effectiveCell = launch.profile === 'preview' ? Math.max(1.85, fluidNumber(config, 'cellSize')) : fluidNumber(config, 'cellSize');
        aspect = renderer.viewport.height / Math.max(1, renderer.viewport.width);
        const screenAspect = renderer.viewport.width / Math.max(1, renderer.viewport.height);
        const dimensions = (base: number) => screenAspect >= 1
          ? { width: Math.round(base * screenAspect), height: Math.round(base) }
          : { width: Math.round(base), height: Math.round(base / screenAspect) };
        const dye = dimensions(Math.max(300, Math.min(1200, Math.round(950 / effectiveCell))));
        const simulation = dimensions(Math.max(90, Math.min(260, Math.round(220 / effectiveCell))));
        return renderer.createFluidField('fluid-tank.field', dye.width, dye.height, { simulationWidth: simulation.width, simulationHeight: simulation.height });
      }
      function seedField() {
        const kind = fluidString(config, 'renderStyle');
        if (kind === 'image') {
          const url = fluidString(config, 'initImageUrl').trim();
          if (url)
            loadImage(url);
          else
            field.seed('random', random() * 1000);
          return;
        }
        field.seed(kind === 'voronoi' ? 'voronoi' : kind === 'random' ? 'random' : kind === 'blank' ? 'blank' : 'cloud', random() * 1000);
      }
      function loadImage(url: string) {
        const request = ++imageRequest, current = field, image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          if (disposed || request !== imageRequest || field !== current)
            return;
          const canvas = document.createElement('canvas');
          canvas.width = current.width;
          canvas.height = current.height;
          const ctx = canvas.getContext('2d', {
            willReadFrequently: true
          });
          if (!ctx)
            return;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data, values = new Float32Array(bytes.length);
          for (let i = 0; i < bytes.length; i++)
            values[i] = (bytes[i] ?? 0) / 255;
          current.uploadDyeRgba(values);
        };
        image.onerror = () => {
          if (!disposed && request === imageRequest && field === current)
            current.seed('random', random() * 1000);
        };
        image.src = url;
      }
      function injectionColor(): readonly [
        number,
        number,
        number
      ] {
        const choice = fluidString(config, 'injectPalette');
        if (choice === 'cyan')
          return [
            0,
            1,
            1
          ];
        if (choice === 'magenta')
          return [
            1,
            0,
            0.8
          ];
        if (choice === 'amber')
          return [
            1,
            0.55,
            0.05
          ];
        if (choice === 'green')
          return [
            0.1,
            1,
            0.25
          ];
        if (choice === 'blue')
          return [
            0.1,
            0.35,
            1
          ];
        if (choice === 'red')
          return [
            1,
            0.08,
            0.05
          ];
        if (choice === 'white')
          return [
            1,
            1,
            1
          ];
        if (choice === 'rainbow')
          return hsv((elapsed * 0.12 + random()) % 1);
        const palette = requireStyle().palette;
        return fluidColor3(palette[Math.floor(random() * palette.length)] ?? 16777215);
      }
      function applyStyle() {
        const style = requireStyle(), background = fluidColor3(style.background), reference = styleId === 'webgl-fluid-glow';
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({
          enabled: fluidNumber(config, 'bloomStrength') > 0,
          intensity: fluidNumber(config, 'bloomStrength') * (reference ? 1 : 0.7),
          threshold: fluidNumber(config, 'bloomThreshold'),
          radius: reference ? 4 : 3.2,
          iterations: reference ? 3 : 2,
          resolutionScale: 0.5
        });
      }
      function requireStyle() {
        const style = FLUID_TANK_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style)
          throw new Error(`Unknown Fluid Tank style: ${styleId}`);
        return style;
      }
      function random() {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        return (randomState >>> 0) / 4294967296;
      }
      function record(): Readonly<Record<string, ExperienceSettingValue>> {
        return Object.freeze({
          ...config
        });
      }
    }
  };
}
function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
function validStyle(value: string | undefined) {
  return value && FLUID_TANK_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function exposureForStyle(id: string) {
  if (id === 'thermal-bloom')
    return 1.34;
  if (id === 'lava-lamp')
    return 1.28;
  if (id === 'nebula-oil')
    return 1.22;
  if (id === 'webgl-fluid-glow' || id === 'aurora-borealis')
    return 1.18;
  return 1.08;
}
function hsv(h: number): readonly [
  number,
  number,
  number
] {
  const i = Math.floor(h * 6), f = h * 6 - i, q = 1 - f;
  switch (i % 6) {
    case 0: return [
      1,
      f,
      0
    ];
    case 1: return [
      q,
      1,
      0
    ];
    case 2: return [
      0,
      1,
      f
    ];
    case 3: return [
      0,
      q,
      1
    ];
    case 4: return [
      f,
      0,
      1
    ];
    default: return [
      1,
      0,
      q
    ];
  }
}
