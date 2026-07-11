import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { createLavaLampConfig, LAVA_LAMP_DEFAULTS, lavaNumber, lavaString, type LavaLampConfig } from './config.js';
import { LavaLampModel, type LavaLampTuning } from './LavaLampModel.js';
import { lavaColor3, lavaColor4, LAVA_LAMP_STYLE_MANIFEST } from './styles.js';
export type LavaLampMode = 'add' | 'remove';
export interface LavaLampController extends ExperienceRuntimeController {
  readonly mode: LavaLampMode;
  readonly waxCount: number;
}
export const LavaLampControllerService = createExtensionToken<LavaLampController>('gl-game-lab.simulations.lava-lamp.controller');
export const LAVA_LAMP_PLUGIN_ID = 'gl-game-lab.simulations.lava-lamp';
export function createLavaLampPlugin(initial: LavaLampConfig = LAVA_LAMP_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: LavaLampMode = launch.modeId === 'remove' ? 'remove' : 'add', styleId = validStyle(launch.styleId) ?? LAVA_LAMP_STYLE_MANIFEST.defaultStyleId, width = 1, height = 1, elapsed = 0, pendingReset = true, lastAutoAdd = 0, randomState = (launch.seed ?? 260706) >>> 0, cleanup = (): void => undefined;
  const model = new LavaLampModel();
  return {
    id: LAVA_LAMP_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), input = context.get(EngineInput);
      cleanup = () => undefined;
      applyStyle();
      const controller: LavaLampController = {
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
        get waxCount() {
          return model.count;
        },
        setMode: value => {
          if (value !== 'add' && value !== 'remove')
            throw new Error(`Unknown Lava Lamp mode: ${value}`);
          mode = value;
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Lava Lamp style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          config = createLavaLampConfig({
            ...record(),
            [key]: value
          });
          model.configure(tuning());
          applyStyle();
        },
        reset: () => {
          pendingReset = true;
        }
      };
      context.provide(LavaLampControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.lava-lamp.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.viewport.width), nextHeight = Math.max(1, renderer.viewport.height), dt = Math.min(1 / 30, time.deltaSeconds) * lavaNumber(config, 'timeScale');
          elapsed += dt;
          if (pendingReset || width !== nextWidth || height !== nextHeight) {
            width = nextWidth;
            height = nextHeight;
            reset();
            pendingReset = false;
          }
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer' && (event.phase === 'down' || event.phase === 'move')) {
              if (mode === 'remove')
                model.remove(event.x, event.y, lavaNumber(config, 'inputRadius'));
              else {
                if (event.phase === 'down')
                  addWax(event.x, event.y, launch.profile === 'preview' ? 3 : 5);
                model.heat(event.x, event.y, lavaNumber(config, 'inputRadius'), lavaNumber(config, 'inputThermalRate') * (event.phase === 'down' ? 2 : 0.5), lavaNumber(config, 'inputLift') * dt);
              }
            }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && elapsed - lastAutoAdd > (launch.profile === 'preview' ? 0.68 : 1.1)) {
            lastAutoAdd = elapsed;
            const x = width * (0.22 + random() * 0.56), y = height * (0.72 + random() * 0.18);
            addWax(x, y, launch.profile === 'preview' ? 2 : 3);
          }
          model.step(dt, width, height, tuning());
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.lava-lamp.render',
        stage: 'renderExtract',
        run: () => {
          const renderStyle = lavaString(config, 'renderStyle'), style = requireStyle(), palette3 = style.palette.slice(0, 4).map(lavaColor3);
          if (renderStyle === 'basic') {
            renderer.submitParticles({
              id: 'lava-lamp-basic',
              count: model.count,
              positions: model.world.positions,
              radii: model.world.radii,
              colorSeeds: model.world.colorSeeds,
              palette: style.palette.slice(0, 4).map(lavaColor4),
              blend: 'alpha',
              opacity: Math.min(1, lavaNumber(config, 'opacity') * 1.8)
            });
            return;
          }
          renderer.submitMetaballs({
                id: 'lava-lamp.density-surface',
                count: model.count,
                positions: model.world.positions,
                radii: model.world.radii,
                temperatures: model.temperatures,
                worldWidth: width,
                worldHeight: height,
                fieldScale: Math.min(1, lavaNumber(config, 'liquidFieldScale') * lavaNumber(config, 'enhancedQuality')),
                particleRadiusScale: lavaNumber(config, 'liquidParticleRadius') * lavaNumber(config, 'liquidExpansion') * lavaNumber(config, 'liquidSplatDensity'),
                threshold: lavaNumber(config, 'liquidSurfaceThreshold'),
                edgeSoftness: lavaNumber(config, 'liquidEdgeSoftness') * (2 - lavaNumber(config, 'liquidEdgeTightness')),
                palette: palette3,
                background: lavaColor3(style.background),
                thermalContrast: lavaNumber(config, 'thermalContrast') * lavaNumber(config, 'liquidThermalStrength'),
                refraction: lavaNumber(config, 'liquidRefraction'),
                gloss: renderStyle === 'ultra' ? lavaNumber(config, 'liquidGloss') : lavaNumber(config, 'liquidGloss') * 0.55,
                rimLighting: renderStyle === 'ultra' ? lavaNumber(config, 'liquidRimLighting') : 0.35,
                opacity: Math.min(1, lavaNumber(config, 'opacity') + lavaNumber(config, 'metaballBlend') * 0.45),
                time: elapsed,
                backgroundDepth: renderStyle === 'ultra' ? 0.9 : 0
          });
        }
      });
      function reset() {
        const preview = launch.profile === 'preview', base = tuning(), next = {
          ...base,
          maxParticles: preview ? Math.max(384, base.maxParticles) : base.maxParticles,
          blobRadius: preview ? Math.min(18, base.blobRadius) : base.blobRadius
        };
        model.reset(width, height, preview ? Math.max(112, lavaNumber(config, 'initialBlobs')) : lavaNumber(config, 'initialBlobs'), next, randomState);
        lastAutoAdd = 0;
        elapsed = 0;
      }
      function addWax(x: number, y: number, count: number) {
        for (let i = 0; i < count; i++)
          model.add(x + (random() - 0.5) * lavaNumber(config, 'blobRadius') * 1.5, y + (random() - 0.5) * lavaNumber(config, 'blobRadius'), tuning(), 0.82 + random() * 0.18, -lavaNumber(config, 'inputLift') * (0.45 + random() * 0.35));
      }
      function tuning(): LavaLampTuning {
        return {
          gravity: lavaNumber(config, 'gravity'),
          buoyancy: lavaNumber(config, 'buoyancy'),
          thermalDrive: lavaNumber(config, 'thermalDrive'),
          heatRegion: lavaNumber(config, 'heatRegion'),
          coolRegion: lavaNumber(config, 'coolRegion'),
          heatRate: lavaNumber(config, 'heatRate'),
          coolRate: lavaNumber(config, 'coolRate'),
          heatTransfer: lavaNumber(config, 'heatTransfer'),
          turbulence: lavaNumber(config, 'turbulence'),
          verticalTurbulence: lavaNumber(config, 'verticalTurbulence'),
          waxViscosity: lavaNumber(config, 'waxViscosity'),
          surfaceTension: lavaNumber(config, 'surfaceTension'),
          clumping: lavaNumber(config, 'clumping'),
          substeps: lavaNumber(config, 'substeps'),
          maxParticles: lavaNumber(config, 'maxParticles'),
          blobRadius: lavaNumber(config, 'blobRadius')
        };
      }
      function applyStyle() {
        const style = requireStyle(), background = lavaColor3(style.background), ultra = lavaString(config, 'renderStyle') === 'ultra';
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(ultra ? undefined : {
          base: [
            background[0],
            background[1],
            background[2],
            1
          ],
          palette: style.palette.slice(0, 4).map(lavaColor4),
          tier: 0.4,
          blendStrength: 0.06
        });
        renderer.setBloom({
          enabled: ultra,
          intensity: ultra ? lavaNumber(config, 'liquidBloomStrength') : 0,
          threshold: 0.46,
          radius: 3.8,
          iterations: 2,
          resolutionScale: 0.5
        });
      }
      function requireStyle() {
        const style = LAVA_LAMP_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style)
          throw new Error(`Unknown Lava Lamp style: ${styleId}`);
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
    },
    dispose: () => cleanup()
  };
}
function validStyle(value: string | undefined) {
  return value && LAVA_LAMP_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
