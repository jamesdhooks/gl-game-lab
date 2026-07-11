import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { GpuFieldPass, GpuFieldState, GpuRenderPassQueueService, WEBGL2_RENDERER_PLUGIN_ID, WebGL2RendererService } from '@hooksjam/gl-game-lab-render-webgl2';
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
interface TuringSkinGpuResources {
  field: GpuFieldState;
  readonly seedPass: GpuFieldPass;
  readonly stepPass: GpuFieldPass;
  readonly splatPass: GpuFieldPass;
  readonly displayPass: GpuFieldPass;
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
    dependencies: [
      {
        id: WEBGL2_RENDERER_PLUGIN_ID
      }
    ],
    install: context => {
      const renderer = context.get(WebGL2RendererService), input = context.get(EngineInput), gpuPasses = context.get(GpuRenderPassQueueService), gl = renderer.device.gl;
      const gpuResources = renderer.device.ownContextResource<TuringSkinGpuResources>({
        id: `${TURING_SKIN_PLUGIN_ID}.gpu`, priority: 50,
        create: createGpuResources, dispose: disposeGpuResources,
        invalidate: () => { randomState = normalizeSeed(launch.seed); },
        restored: resetCpuState,
      });
      cleanup = () => { gpuResources.dispose(); };
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
          return gpuResources.value.field.width;
        },
        get entityCount() {
          const { field } = gpuResources.value;
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
          gpuResources.value.field.clear();
          randomState = normalizeSeed(launch.seed);
          resetCpuState();
        }
      };
      context.provide(TuringSkinControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
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
          gpuPasses.submit({
            id: 'turing-skin.reaction-field',
            execute: destination => {
              const resources = gpuResources.value;
              if (rebuild) {
                resources.field.dispose();
                resources.field = createField();
                rebuild = false;
                needsSeed = true;
              }
              const { field, seedPass, stepPass, splatPass, displayPass } = resources;
              if (needsSeed) {
                seedPass.step(field, (g, u) => {
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
                  stepPass.step(field, (g, u) => {
                    g.uniform2f(u('uTexel'), 1 / field.width, 1 / field.height);
                    g.uniform1f(u('uFeed'), config.feedRate);
                    g.uniform1f(u('uKill'), config.killRate);
                    g.uniform1f(u('uDiffusionA'), config.diffusionA);
                    g.uniform1f(u('uDiffusionB'), config.diffusionB);
                    g.uniform1f(u('uDt'), subDt);
                  });
              }
              for (const splat of splats.splice(0))
                splatPass.step(field, (g, u) => {
                  g.uniform2f(u('uPoint'), splat.x, splat.y);
                  g.uniform1f(u('uRadius'), splat.radius);
                  g.uniform1f(u('uStrength'), splat.strength);
                });
              const style = requireStyle(), palette = new Float32Array(12);
              style.palette.slice(0, 4).forEach((color, index) => palette.set(turingColor3(color), index * 3));
              displayPass.render(field, destination, (g, u) => {
                g.uniform3fv(u('uPalette[0]'), palette);
                g.uniform3fv(u('uBackground'), new Float32Array(turingColor3(style.background)));
              });
            }
          });
        }
      });
      function routePointer(event: PointerInputEvent): void {
        if (event.phase !== 'down' && event.phase !== 'move')
          return;
        const width = Math.max(1, renderer.sprites.activeCamera.viewportWidth), height = Math.max(1, renderer.sprites.activeCamera.viewportHeight);
        splats.push({
          x: Math.max(0, Math.min(1, event.x / width)),
          y: Math.max(0, Math.min(1, 1 - event.y / height)),
          radius: event.phase === 'down' ? 0.045 : 0.028,
          strength: config.brushStrength * (mode === 'erase' ? -1 : 1)
        });
      }
      function createField(): GpuFieldState {
        const requested = config.resolution, resolution = launch.profile === 'preview' ? Math.min(256, requested) : requested, aspect = renderer.sprites.activeCamera.viewportHeight / Math.max(1, renderer.sprites.activeCamera.viewportWidth), rows = Math.max(1, Math.round(resolution * aspect));
        return new GpuFieldState(gl, {
          width: resolution,
          height: rows,
          precision: 'half-float',
          filter: 'linear'
        });
      }
      function createGpuResources(): TuringSkinGpuResources {
        const disposers: Array<() => void> = [];
        try {
          const field = createField(); disposers.push(() => { field.dispose(); });
          const seedPass = new GpuFieldPass(gl, TURING_SEED_SHADER); disposers.push(() => { seedPass.dispose(); });
          const stepPass = new GpuFieldPass(gl, TURING_STEP_SHADER); disposers.push(() => { stepPass.dispose(); });
          const splatPass = new GpuFieldPass(gl, TURING_SPLAT_SHADER); disposers.push(() => { splatPass.dispose(); });
          const displayPass = new GpuFieldPass(gl, TURING_DISPLAY_SHADER); disposers.push(() => { displayPass.dispose(); });
          return { field, seedPass, stepPass, splatPass, displayPass };
        } catch (error) {
          for (const dispose of disposers.reverse()) dispose();
          throw error;
        }
      }
      function disposeGpuResources(resources: TuringSkinGpuResources): void {
        resources.displayPass.dispose(); resources.splatPass.dispose(); resources.stepPass.dispose(); resources.seedPass.dispose(); resources.field.dispose();
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
        renderer.setPaletteBackdrop(undefined);
        renderer.setBloom({
          enabled: false
        });
      }
    },
    dispose: () => {
      cleanup();
      splats.length = 0;
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
