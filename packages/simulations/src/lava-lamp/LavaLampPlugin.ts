import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
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
interface HeldWax {
  readonly index: number;
  x: number;
  y: number;
  seconds: number;
  velocityX: number;
  velocityY: number;
}
export function createLavaLampPlugin(initial: LavaLampConfig = LAVA_LAMP_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode: LavaLampMode = launch.modeId === 'remove' ? 'remove' : 'add', styleId = validStyle(launch.styleId) ?? LAVA_LAMP_STYLE_MANIFEST.defaultStyleId, width = 1, height = 1, elapsed = 0, pendingReset = true, lastAutoAdd = 0, randomState = (launch.seed ?? 260706) >>> 0, cleanup = (): void => undefined;
  const model = new LavaLampModel();
  const visualRadii = new Float32Array(1024);
  const heldWax = new Map<number, HeldWax>();
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
          releaseAllHeld();
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
          heldWax.clear();
          pendingReset = true;
        }
      };
      registerSimulationRuntime(context, LavaLampControllerService, controller, () => {
        heldWax.clear();
        cleanup();
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.lava-lamp.update',
        stage: 'update',
        run: ({ time }) => {
          const nextWidth = Math.max(1, renderer.viewport.width), nextHeight = Math.max(1, renderer.viewport.height), frameDt = Math.min(1 / 30, Math.max(1 / 120, time.deltaSeconds || 1 / 60)), dt = frameDt * lavaNumber(config, 'timeScale');
          elapsed += dt;
          if (pendingReset || width !== nextWidth || height !== nextHeight) {
            width = nextWidth;
            height = nextHeight;
            reset();
            pendingReset = false;
          }
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer')
              routePointer(event, frameDt);
          updateHeldWax(dt);
          if ((launch.profile === 'preview' || launch.profile === 'demo') && elapsed - lastAutoAdd > (launch.profile === 'preview' ? 0.68 : 1.1)) {
            lastAutoAdd = elapsed;
            const x = width * (0.22 + random() * 0.56), y = height * (0.72 + random() * 0.18);
            addWax(x, y, launch.profile === 'preview' ? 2 : 3);
          }
          model.step(dt, width, height, tuning());
          pinHeldWax();
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.lava-lamp.render',
        stage: 'renderExtract',
        run: () => {
          const renderStyle = lavaString(config, 'renderStyle'), style = requireStyle(), palette3 = style.palette.slice(0, 4).map(lavaColor3);
          for (let i = 0; i < model.count; i++) visualRadii[i] = lavaNumber(config, 'blobRadius') * (0.82 + ((model.world.radii[i] ?? 1) / Math.max(1, lavaNumber(config, 'blobRadius') * 0.34) - 1) * 0.35);
          if (renderStyle === 'basic') {
            renderer.submitParticles({
              id: 'lava-lamp-basic',
              count: model.count,
              positions: model.world.positions,
              radii: visualRadii,
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
                radii: visualRadii,
                temperatures: model.temperatures,
                worldWidth: width,
                worldHeight: height,
                fieldScale: Math.min(1, lavaNumber(config, 'liquidFieldScale') * lavaNumber(config, 'enhancedQuality')),
                particleRadiusScale: lavaNumber(config, 'liquidParticleRadius') * lavaNumber(config, 'liquidExpansion') * lavaNumber(config, 'liquidSplatDensity') * 0.32,
                threshold: lavaNumber(config, 'liquidSurfaceThreshold'),
                edgeSoftness: lavaNumber(config, 'liquidEdgeSoftness') * (2 - lavaNumber(config, 'liquidEdgeTightness')),
                edgeTightness: lavaNumber(config, 'liquidEdgeTightness'),
                palette: palette3,
                background: lavaColor3(style.background),
                thermalContrast: lavaNumber(config, 'thermalContrast') * lavaNumber(config, 'liquidThermalStrength'),
                refraction: lavaNumber(config, 'liquidRefraction'),
                gloss: renderStyle === 'ultra' ? lavaNumber(config, 'liquidGloss') : lavaNumber(config, 'liquidGloss') * 0.55,
                rimLighting: renderStyle === 'ultra' ? lavaNumber(config, 'liquidRimLighting') : 0.35,
                foamStrength: 0,
                thermalStrength: lavaNumber(config, 'liquidThermalStrength'),
                bloomStrength: renderStyle === 'ultra' ? lavaNumber(config, 'liquidBloomStrength') : 0,
                heatShimmer: renderStyle === 'ultra' ? lavaNumber(config, 'liquidHeatShimmer') : 0,
                depthDiffusion: renderStyle === 'ultra' ? lavaNumber(config, 'liquidDepthDiffusion') : 0,
                renderStyle: renderStyle === 'ultra' ? 'ultra' : 'enhanced',
                opacity: Math.min(1, lavaNumber(config, 'opacity') + lavaNumber(config, 'metaballBlend') * 0.45),
                time: elapsed,
                backgroundDepth: renderStyle === 'ultra' ? 0.9 : 0
          });
        }
      });
      function reset() {
        heldWax.clear();
        const preview = launch.profile === 'preview', base = tuning(), next = {
          ...base,
          maxParticles: preview ? Math.max(384, base.maxParticles) : base.maxParticles,
          blobRadius: preview ? Math.min(18, base.blobRadius) : base.blobRadius
        };
        model.reset(width, height, preview ? Math.max(112, lavaNumber(config, 'initialBlobs')) : lavaNumber(config, 'initialBlobs'), next, randomState);
        lastAutoAdd = 0;
        elapsed = 0;
      }
      function routePointer(event: PointerInputEvent, frameDt: number) {
        if (event.phase === 'up' || event.phase === 'cancel' || (event.phase === 'move' && event.buttons === 0)) {
          releaseHeld(event.id);
          return;
        }
        if (mode === 'remove') {
          if (event.phase === 'down' || event.phase === 'move')
            model.remove(event.x, event.y, lavaNumber(config, 'inputRadius'));
          return;
        }
        if (event.phase === 'down') {
          releaseHeld(event.id);
          const index = model.beginHeld(event.x, event.y, tuning());
          if (index >= 0)
            heldWax.set(event.id, {
              index,
              x: event.x,
              y: event.y,
              seconds: 0,
              velocityX: 0,
              velocityY: 0
            });
          return;
        }
        const held = heldWax.get(event.id);
        if (!held)
          return;
        const inverseDt = 1 / Math.max(1 / 120, frameDt);
        const velocityX = clampMotion((event.x - held.x) * inverseDt);
        const velocityY = clampMotion((event.y - held.y) * inverseDt);
        held.velocityX = held.velocityX * 0.45 + velocityX * 0.55;
        held.velocityY = held.velocityY * 0.45 + velocityY * 0.55;
        held.x = event.x;
        held.y = event.y;
      }
      function updateHeldWax(dt: number) {
        const currentTuning = tuning(), maximumRadius = lavaNumber(config, 'inputRadius'), growthRate = lavaNumber(config, 'inputThermalRate');
        for (const [pointerId, held] of heldWax) {
          held.seconds += dt;
          if (!model.updateHeld(held.index, held.x, held.y, held.seconds, growthRate, currentTuning, maximumRadius))
            heldWax.delete(pointerId);
        }
      }
      function pinHeldWax() {
        const currentTuning = tuning(), maximumRadius = lavaNumber(config, 'inputRadius'), growthRate = lavaNumber(config, 'inputThermalRate');
        for (const [pointerId, held] of heldWax)
          if (!model.updateHeld(held.index, held.x, held.y, held.seconds, growthRate, currentTuning, maximumRadius))
            heldWax.delete(pointerId);
      }
      function releaseHeld(pointerId: number) {
        const held = heldWax.get(pointerId);
        if (!held)
          return;
        model.releaseHeld(held.index, held.velocityX * 0.35, held.velocityY * 0.35 - lavaNumber(config, 'inputLift') * 0.65);
        heldWax.delete(pointerId);
      }
      function releaseAllHeld() {
        for (const pointerId of [...heldWax.keys()])
          releaseHeld(pointerId);
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
    }
  };
}
function validStyle(value: string | undefined) {
  return value && LAVA_LAMP_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function clampMotion(value: number) {
  return Math.max(-900, Math.min(900, value));
}
