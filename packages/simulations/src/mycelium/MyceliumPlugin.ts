import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { GpuFieldPass, GpuFieldState, GpuRenderPassQueueService, WEBGL2_RENDERER_PLUGIN_ID, WebGL2RendererService } from '@hooksjam/gl-game-lab-render-webgl2';
import { createMyceliumConfig, MYCELIUM_DEFAULTS, myceliumNumber, myceliumString, type MyceliumConfig } from './config.js';
import { MYCELIUM_DISPLAY_SHADER, MYCELIUM_SEED_SHADER, MYCELIUM_SPLAT_SHADER, MYCELIUM_STEP_SHADER } from './shaders.js';
import { myceliumColor3, MYCELIUM_STYLE_MANIFEST } from './styles.js';
interface Splat {
  x: number;
  y: number;
  radius: number;
  strain: number;
}
export interface MyceliumController extends ExperienceRuntimeController {
  readonly fieldResolution: number;
}
export const MyceliumControllerService = createExtensionToken<MyceliumController>('gl-game-lab.simulations.mycelium.controller');
export const MYCELIUM_PLUGIN_ID = 'gl-game-lab.simulations.mycelium';
export function createMyceliumPlugin(initial: MyceliumConfig = MYCELIUM_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, styleId = validStyle(launch.styleId) ?? MYCELIUM_STYLE_MANIFEST.defaultStyleId, pendingDt = 0, elapsed = 0, randomState = seedValue(launch.seed), rebuild = false, needsSeed = true, cleanup = (): void => undefined;
  const splats: Splat[] = [];
  return {
    id: MYCELIUM_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [
      {
        id: WEBGL2_RENDERER_PLUGIN_ID
      }
    ],
    install: context => {
      const renderer = context.get(WebGL2RendererService), input = context.get(EngineInput), gpuPasses = context.get(GpuRenderPassQueueService), gl = renderer.device.gl;
      let field = createField();
      const seedPass = new GpuFieldPass(gl, MYCELIUM_SEED_SHADER), stepPass = new GpuFieldPass(gl, MYCELIUM_STEP_SHADER), splatPass = new GpuFieldPass(gl, MYCELIUM_SPLAT_SHADER), displayPass = new GpuFieldPass(gl, MYCELIUM_DISPLAY_SHADER);
      cleanup = () => {
        field.dispose();
        seedPass.dispose();
        stepPass.dispose();
        splatPass.dispose();
        displayPass.dispose();
      };
      applyStyle();
      const controller: MyceliumController = {
        get modeId() {
          return 'paint';
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
          if (value !== 'paint')
            throw new Error(`Unknown Mycelium mode: ${value}`);
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Mycelium style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const oldResolution = myceliumNumber(config, 'resolution'), oldTopology = myceliumString(config, 'topology');
          config = createMyceliumConfig({
            ...record(),
            [key]: value
          });
          rebuild ||= oldResolution !== myceliumNumber(config, 'resolution') || oldTopology !== myceliumString(config, 'topology');
        },
        reset: () => {
          field.clear();
          splats.length = 0;
          needsSeed = true;
          pendingDt = 0;
          elapsed = 0;
          randomState = seedValue(launch.seed);
        }
      };
      context.provide(MyceliumControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.mycelium.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds) * myceliumNumber(config, 'timeScale');
          pendingDt += dt;
          elapsed += dt;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer' && (event.phase === 'down' || event.phase === 'move')) {
              const width = Math.max(1, renderer.sprites.activeCamera.viewportWidth), height = Math.max(1, renderer.sprites.activeCamera.viewportHeight);
              splats.push({
                x: Math.max(0, Math.min(1, event.x / width)),
                y: Math.max(0, Math.min(1, 1 - event.y / height)),
                radius: myceliumNumber(config, 'brushRadius') * (event.phase === 'down' ? 1.5 : 1),
                strain: nextRandom()
              });
            }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0 && Math.floor((elapsed - dt) * 1.2) !== Math.floor(elapsed * 1.2))
            splats.push({
              x: 0.12 + nextRandom() * 0.76,
              y: 0.12 + nextRandom() * 0.76,
              radius: myceliumNumber(config, 'demoSeedRadius') * 1.4,
              strain: nextRandom()
            });
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.mycelium.render',
        stage: 'renderExtract',
        run: () => {
          gpuPasses.submit({
            id: 'mycelium.cellular-field',
            execute: destination => {
              if (rebuild) {
                field.dispose();
                field = createField();
                rebuild = false;
                needsSeed = true;
              }
              if (needsSeed) {
                const configured = Math.round(myceliumNumber(config, 'demoSeedColonies')), colonies = configured > 0 ? configured : (launch.profile === 'preview' || launch.profile === 'demo' ? 4 : 0);
                seedPass.step(field, (g, u) => {
                  g.uniform1f(u('uSeed'), nextRandom() * 1000);
                  g.uniform1i(u('uColonies'), colonies);
                  g.uniform1f(u('uSeedRadius'), myceliumNumber(config, 'demoSeedRadius'));
                });
                needsSeed = false;
              }
              const dt = pendingDt;
              pendingDt = 0;
              if (dt > 0) {
                const steps = Math.max(1, Math.min(launch.profile === 'preview' ? 3 : 7, Math.ceil(dt * 90)));
                for (let index = 0; index < steps; index++)
                  stepPass.step(field, (g, u) => {
                    g.uniform2f(u('uTexel'), 1 / field.width, 1 / field.height);
                    g.uniform2f(u('uGrid'), field.width, field.height);
                    g.uniform1f(u('uGrowthRate'), myceliumNumber(config, 'growthRate'));
                    g.uniform1f(u('uDecayRate'), myceliumNumber(config, 'pruneRate'));
                    g.uniform1f(u('uBranchChance'), myceliumNumber(config, 'branchChance'));
                    g.uniform1f(u('uOverwriteChance'), myceliumNumber(config, 'overwriteChance'));
                    g.uniform1f(u('uClumping'), myceliumNumber(config, 'growthClumping'));
                    g.uniform1f(u('uColorMutation'), myceliumNumber(config, 'colorMutation'));
                    g.uniform1f(u('uColorDriftFrequency'), myceliumNumber(config, 'colorDriftFrequency'));
                    g.uniform1f(u('uBranchColorSplit'), myceliumNumber(config, 'branchColorSplit'));
                    g.uniform1f(u('uSubstrateColorBias'), myceliumNumber(config, 'substrateColorBias'));
                    g.uniform1f(u('uTime'), elapsed + index * 0.01);
                    g.uniform1i(u('uVariant'), myceliumString(config, 'topology') === 'triangle' ? 0 : 1);
                  });
              }
              for (const splat of splats.splice(0))
                splatPass.step(field, (g, u) => {
                  g.uniform2f(u('uPoint'), splat.x, splat.y);
                  g.uniform1f(u('uRadius'), splat.radius);
                  g.uniform1f(u('uStrain'), splat.strain);
                });
              const style = requireStyle(), palette = new Float32Array(24);
              style.palette.slice(0, 8).forEach((color, index) => palette.set(myceliumColor3(color), index * 3));
              displayPass.render(field, destination, (g, u) => {
                g.uniform2f(u('uGrid'), field.width, field.height);
                g.uniform3fv(u('uPalette[0]'), palette);
                g.uniform3fv(u('uBackground'), new Float32Array(myceliumColor3(style.background)));
                g.uniform1i(u('uVariant'), myceliumString(config, 'topology') === 'triangle' ? 0 : 1);
                const visual = myceliumString(config, 'renderStyle');
                g.uniform1i(u('uVisualStyle'), visual === 'basic' ? 0 : visual === 'enhanced' ? 1 : 2);
                g.uniform1f(u('uFieldSpread'), myceliumNumber(config, 'fieldSpread'));
              });
            }
          });
        }
      });
      function createField() {
        const requested = myceliumNumber(config, 'resolution'), resolution = launch.profile === 'preview' ? Math.min(256, requested) : requested, aspect = renderer.sprites.activeCamera.viewportHeight / Math.max(1, renderer.sprites.activeCamera.viewportWidth);
        return new GpuFieldState(gl, {
          width: Math.round(resolution),
          height: Math.max(1, Math.round(resolution * aspect)),
          precision: 'half-float',
          filter: 'nearest'
        });
      }
      function applyStyle() {
        const background = myceliumColor3(requireStyle().background);
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
    const style = MYCELIUM_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
    if (!style)
      throw new Error(`Unknown Mycelium style: ${styleId}`);
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
  return value && MYCELIUM_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function seedValue(seed: number | undefined) {
  const value = seed ?? 260618;
  if (!Number.isSafeInteger(value))
    throw new Error('Mycelium seed must be a safe integer');
  return (value >>> 0) || 260618;
}
