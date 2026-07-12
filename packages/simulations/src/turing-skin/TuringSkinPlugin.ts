import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuFieldSystem2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createTuringSkinConfig, TURING_SKIN_DEFAULTS, type TuringSkinConfig } from './config.js';
import { TURING_DISPLAY_SHADER, TURING_SEED_SHADER, TURING_SPLAT_SHADER, TURING_STEP_SHADER } from './shaders.js';
import { turingColor3, TURING_SKIN_STYLE_MANIFEST } from './styles.js';
export type TuringSkinMode = 'paint' | 'erase';
interface Splat {
  x: number;
  y: number;
  radius: number;
  strength: number;
}
export interface TuringSkinController extends ExperienceRuntimeController {
  readonly mode: TuringSkinMode;
  readonly fieldResolution: number;
}
export const TuringSkinControllerService = createExtensionToken<TuringSkinController>('gl-game-lab.simulations.turing-skin.controller');
export const TURING_SKIN_PLUGIN_ID = 'gl-game-lab.simulations.turing-skin';
export function createTuringSkinPlugin(initial: TuringSkinConfig = TURING_SKIN_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: TuringSkinMode = launch.modeId === 'erase' ? 'erase' : 'paint', styleId = validStyle(launch.styleId) ?? TURING_SKIN_STYLE_MANIFEST.defaultStyleId, pendingDt = 0, elapsed = 0, randomState = normalizeSeed(launch.seed), rebuild = false, needsSeed = true, cleanup = (): void => undefined;
  const splats: Splat[] = [];
  return {
    id: TURING_SKIN_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let field = createField(), observedGeneration = field.generation;
      cleanup = () => { field.dispose(); };
      applyStyle();
      const controller: TuringSkinController = {
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
        get fieldResolution() {
          return field.width;
        },
        get entityCount() {
          return field.width * field.height;
        },
        setMode: value => {
          if (value !== 'paint' && value !== 'erase')
            throw new Error(`Unknown Turing Skin mode: ${value}`);
          mode = value;
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Turing Skin style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const previousResolution = config.resolution, previousPattern = config.renderStyle;
          config = createTuringSkinConfig({
            ...record(),
            [key]: value
          });
          rebuild ||= previousResolution !== config.resolution || previousPattern !== config.renderStyle;
        },
        reset: () => {
          field.clear();
          randomState = normalizeSeed(launch.seed);
          resetCpuState();
        }
      };
      registerSimulationRuntime(context, TuringSkinControllerService, controller, () => {
        cleanup();
        splats.length = 0;
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.turing-skin.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds) * config.timeScale;
          pendingDt += dt;
          elapsed += dt;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer')
              routePointer(event);
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0 && Math.floor((elapsed - dt) * 1.4) !== Math.floor(elapsed * 1.4)) {
            splats.push({
              x: 0.18 + nextRandom() * 0.64,
              y: 0.18 + nextRandom() * 0.64,
              radius: 0.028 + nextRandom() * 0.035,
              strength: config.brushStrength * (nextRandom() > 0.2 ? 1 : -0.75)
            });
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.turing-skin.render',
        stage: 'renderExtract',
        run: () => {
          gpu.submit('turing-skin.reaction-field', destination => {
              if (field.generation !== observedGeneration) {
                observedGeneration = field.generation;
                randomState = normalizeSeed(launch.seed);
                resetCpuState();
              }
              if (rebuild) {
                field.dispose();
                field = createField();
                observedGeneration = field.generation;
                rebuild = false;
                needsSeed = true;
              }
              if (needsSeed) {
                field.step('seed', (g, u) => {
                  g.uniform1i(u('uPattern'), config.renderStyle === 'bands' ? 1 : 0);
                  g.uniform1f(u('uSeed'), nextRandom() * 1000);
                });
                needsSeed = false;
              }
              const dt = pendingDt;
              pendingDt = 0;
              if (dt > 0) {
                const steps = Math.max(1, Math.min(launch.profile === 'preview' ? 2 : 8, Math.ceil(dt * 90))), subDt = Math.max(0.08, Math.min(1, dt * 60 / steps));
                for (let index = 0; index < steps; index++)
                  field.step('step', (g, u) => {
                    g.uniform2f(u('uTexel'), 1 / field.width, 1 / field.height);
                    g.uniform1f(u('uFeed'), config.feedRate);
                    g.uniform1f(u('uKill'), config.killRate);
                    g.uniform1f(u('uDiffusionA'), config.diffusionA);
                    g.uniform1f(u('uDiffusionB'), config.diffusionB);
                    g.uniform1f(u('uDt'), subDt);
                  });
              }
              for (const splat of splats.splice(0))
                field.step('splat', (g, u) => {
                  g.uniform2f(u('uPoint'), splat.x, splat.y);
                  g.uniform1f(u('uRadius'), splat.radius);
                  g.uniform1f(u('uStrength'), splat.strength);
                });
              const style = requireStyle(), palette = new Float32Array(12);
              style.palette.slice(0, 4).forEach((color, index) => palette.set(turingColor3(color), index * 3));
              field.render('display', destination, (g, u) => {
                g.uniform3fv(u('uPalette[0]'), palette);
                g.uniform3fv(u('uBackground'), new Float32Array(turingColor3(style.background)));
              });
          });
        }
      });
      function routePointer(event: PointerInputEvent): void {
        if (event.phase !== 'down' && event.phase !== 'move')
          return;
        const width = Math.max(1, renderer.viewport.width), height = Math.max(1, renderer.viewport.height);
        splats.push({
          x: Math.max(0, Math.min(1, event.x / width)),
          y: Math.max(0, Math.min(1, 1 - event.y / height)),
          radius: event.phase === 'down' ? 0.045 : 0.028,
          strength: config.brushStrength * (mode === 'erase' ? -1 : 1)
        });
      }
      function createField(): GpuFieldSystem2D {
        const requested = config.resolution, resolution = launch.profile === 'preview' ? Math.min(256, requested) : requested, aspect = renderer.viewport.height / Math.max(1, renderer.viewport.width), rows = Math.max(1, Math.round(resolution * aspect));
        return gpu.createFieldSystem(`${TURING_SKIN_PLUGIN_ID}.field`, {
          width: resolution,
          height: rows,
          precision: 'half-float',
          filter: 'linear',
          passes: { seed: TURING_SEED_SHADER, step: TURING_STEP_SHADER, splat: TURING_SPLAT_SHADER, display: TURING_DISPLAY_SHADER }
        });
      }
      function resetCpuState(): void {
        splats.length = 0; needsSeed = true; pendingDt = 0; elapsed = 0;
      }
      function applyStyle(): void {
        const background = turingColor3(requireStyle().background);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({
          enabled: false
        });
      }
    }
  };
  function requireStyle() {
    const style = TURING_SKIN_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
    if (!style)
      throw new Error(`Unknown Turing Skin style: ${styleId}`);
    return style;
  }
  function record(): Readonly<Record<string, ExperienceSettingValue>> {
    return Object.freeze({
      ...config
    });
  }
  function nextRandom() {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }
}
function validStyle(value: string | undefined) {
  return value && TURING_SKIN_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function normalizeSeed(seed: number | undefined) {
  const value = seed ?? 260527;
  if (!Number.isSafeInteger(value))
    throw new Error('Turing Skin seed must be a safe integer');
  return (value >>> 0) || 260527;
}
