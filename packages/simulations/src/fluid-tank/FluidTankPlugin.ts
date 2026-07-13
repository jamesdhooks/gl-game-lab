import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineInput,
  EngineRender2D,
  EngineSchedule,
  type ExperienceLaunchOptions,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
  type FluidSplat2D,
} from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createFluidTankConfig, FLUID_TANK_DEFAULTS, fluidBoolean, fluidNumber, fluidString, type FluidTankConfig } from './config.js';
import { fluidColor3, FLUID_TANK_STYLE_MANIFEST } from './styles.js';

const PUBLIC_RANDOM_IMAGE_URL_BASE = 'https://picsum.photos';
const MAX_VELOCITY_CELLS = 36;
const PREVIEW_FINGER_RADIUS = 0.026;
const PREVIEW_INJECT_AMOUNT = 0.62;
const PREVIEW_INJECT_TURBULENCE = 0.32;

interface PointerTrailPoint {
  readonly x: number;
  readonly y: number;
}

interface FluidStyleOptions {
  readonly exposure: number;
  readonly paletteStrength: number;
  readonly edgeDarkening: number;
  readonly shadingStrength: number;
  readonly bloomStrength: number;
  readonly bloomThreshold: number;
  readonly sunraysStrength: number;
  readonly visualPipeline: 'standard' | 'reference';
}

const STYLE_OPTIONS: Readonly<Record<string, FluidStyleOptions>> = Object.freeze({
  'bounded-cyan': standard(1.06, 0.76, 0.18),
  'webgl-fluid-glow': Object.freeze({
    exposure: 1.16,
    paletteStrength: 0.7,
    edgeDarkening: 0.14,
    shadingStrength: 1,
    bloomStrength: 0.8,
    bloomThreshold: 0.6,
    sunraysStrength: 1,
    visualPipeline: 'reference',
  }),
  'nebula-oil': standard(1.22, 0.84, 0.16),
  'thermal-bloom': standard(1.34, 0.8, 0.2),
  'aurora-borealis': standard(1.18, 0.9, 0.22),
  'deep-ocean': standard(1.12, 0.78, 0.28),
  'lava-lamp': standard(1.28, 0.85, 0.14),
  'forest-moss': standard(1.08, 0.72, 0.2),
  'ink-wash': standard(0.9, 0.9, 0.35),
  'candy-diffusion': standard(1.05, 0.86, 0.2),
  'copper-patina': standard(0.98, 0.88, 0.28),
  __random__: standard(1.08, 0.82, 0.24),
});

export type FluidTankMode = 'inject' | 'stir';
export interface FluidTankController extends ExperienceRuntimeController {
  readonly mode: FluidTankMode;
  readonly fieldResolution: number;
}

export const FluidTankControllerService = createExtensionToken<FluidTankController>('gl-game-lab.simulations.fluid-tank.controller');
export const FLUID_TANK_PLUGIN_ID = 'gl-game-lab.simulations.fluid-tank';

export function createFluidTankPlugin(initial: FluidTankConfig = FLUID_TANK_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial;
  let mode: FluidTankMode = launch.modeId === 'stir' ? 'stir' : 'inject';
  let styleId = validStyle(launch.styleId) ?? FLUID_TANK_STYLE_MANIFEST.defaultStyleId;
  let pendingDt = 0;
  let elapsed = 0;
  let lastAmbient = 0;
  let rebuild = false;
  let needsSeed = true;
  let disposed = false;
  let imageRequest = 0;
  let randomState = (launch.seed ?? 260527) >>> 0;
  let seedValue = random() * 1000;
  let cleanup = (): void => undefined;
  const splats: FluidSplat2D[] = [];
  const pointerTrails = new Map<number, PointerTrailPoint>();

  return {
    id: FLUID_TANK_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D);
      const input = context.get(EngineInput);
      let aspect = 1;
      let field = createField();
      cleanup = () => field.dispose();
      applyStyle();

      const controller: FluidTankController = {
        get mode() { return mode; },
        get modeId() { return mode; },
        get styleId() { return styleId; },
        get settings() { return Object.freeze({ ...config }); },
        get entityCount() { return field.width * field.height; },
        get fieldResolution() { return field.width; },
        setMode: value => {
          if (value !== 'inject' && value !== 'stir') throw new Error(`Unknown Fluid Tank mode: ${value}`);
          mode = value;
          pointerTrails.clear();
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next) throw new Error(`Unknown Fluid Tank style: ${value}`);
          styleId = next;
          applyStyle();
          needsSeed = true;
        },
        setSetting: (key, value) => {
          const oldCell = fluidNumber(config, 'cellSize');
          const oldInit = fluidString(config, 'renderStyle');
          const oldUrl = fluidString(config, 'initImageUrl');
          config = createFluidTankConfig({ ...record(), [key]: value });
          if (oldCell !== fluidNumber(config, 'cellSize')) rebuild = true;
          if (oldInit !== fluidString(config, 'renderStyle') || oldUrl !== fluidString(config, 'initImageUrl')) needsSeed = true;
          applyStyle();
        },
        reset: () => {
          imageRequest += 1;
          splats.length = 0;
          pointerTrails.clear();
          field.clear();
          seedValue = random() * 1000;
          needsSeed = true;
          pendingDt = 0;
          elapsed = 0;
          lastAmbient = 0;
        },
      };

      registerSimulationRuntime(context, FluidTankControllerService, controller, () => {
        disposed = true;
        imageRequest += 1;
        cleanup();
        splats.length = 0;
        pointerTrails.clear();
      });

      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fluid-tank.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(1 / 30, Math.max(1 / 120, time.deltaSeconds || 1 / 60)) * Math.max(0, fluidNumber(config, 'timescale'));
          pendingDt += dt;
          elapsed += dt;
          const currentAspect = renderer.viewport.height / Math.max(1, renderer.viewport.width);
          if (Math.abs(currentAspect - aspect) > 0.04) rebuild = true;
          for (const event of input.snapshot.events) if (event.kind === 'pointer') routePointer(event);
          if (fluidBoolean(config, 'ambient') && elapsed - lastAmbient >= 0.28) ambientStir();
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0) runDemoInput(dt);
        },
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
          if (dt > 0) {
            field.step({
              deltaSeconds: dt,
              viscosity: fluidNumber(config, 'viscosity'),
              curl: fluidNumber(config, 'curl'),
              velocityDissipation: fluidNumber(config, 'velocityPersistence'),
              dyeDissipation: fluidNumber(config, 'dyePersistence'),
              pressureIterations: launch.profile === 'preview' ? Math.min(18, fluidNumber(config, 'pressureIterations')) : fluidNumber(config, 'pressureIterations'),
              ambient: fluidBoolean(config, 'ambient'),
              velocitySplatsBeforeProjection: true,
            }, splats.splice(0));
          }
          const style = requireStyle();
          const options = styleOptions();
          renderer.submitFluidField('fluid-tank.stable-field', field, {
            palette: style.palette.slice(0, 4).map(fluidColor3),
            background: fluidColor3(style.background),
            shadingStrength: options.visualPipeline === 'reference' ? fluidNumber(config, 'shadingStrength') : 0,
            sunraysStrength: options.visualPipeline === 'reference' ? fluidNumber(config, 'sunraysStrength') : 0,
            exposure: options.exposure,
            paletteStrength: options.paletteStrength,
            edgeDarkening: options.edgeDarkening,
            bloomStrength: options.visualPipeline === 'reference' ? fluidNumber(config, 'bloomStrength') : 0,
            bloomThreshold: fluidNumber(config, 'bloomThreshold'),
            visualPipeline: options.visualPipeline,
            initMode: effectiveInitMode(),
            timeSeconds: elapsed,
            seed: seedValue,
          });
        },
      });

      function routePointer(event: PointerInputEvent): void {
        if (event.phase === 'up' || event.phase === 'cancel' || (event.phase === 'move' && event.buttons === 0)) {
          pointerTrails.delete(event.id);
          return;
        }
        const width = Math.max(1, renderer.viewport.width);
        const height = Math.max(1, renderer.viewport.height);
        const screenPoint = { x: event.x / width, y: event.y / height };
        if (event.phase === 'down') {
          pointerTrails.set(event.id, { x: event.x, y: event.y });
          if (mode === 'inject') queueInject(screenPoint.x, screenPoint.y, 0, 0, 1.25);
          else queueSmallSwirl(screenPoint.x, screenPoint.y);
          return;
        }
        const prior = pointerTrails.get(event.id);
        if (!prior) return;
        const normalizedDx = (event.x - prior.x) / width;
        const normalizedDy = (event.y - prior.y) / height;
        if (Math.hypot(normalizedDx, normalizedDy) > 0.002) {
          const velocity = velocityFromScreenDelta(event.x - prior.x, event.y - prior.y, width, height, field.simulationWidth, field.simulationHeight);
          if (mode === 'inject') queueInject(screenPoint.x, screenPoint.y, velocity.dx, velocity.dy, 1.25);
          else queueStir(screenPoint.x, screenPoint.y, velocity.dx, velocity.dy, 1);
        }
        pointerTrails.set(event.id, { x: event.x, y: event.y });
      }

      function queueInject(screenX: number, screenY: number, dx: number, dy: number, intensity = 1): void {
        const x = clamp01(screenX);
        const y = clamp01(1 - screenY);
        const turbulence = clampValue(effectiveInjectTurbulence(), 0, 2);
        const radius = effectiveFingerRadius() * (0.82 + intensity * 0.28);
        const motionSpeed = Math.hypot(dx, dy);
        const motionBoost = clampValue(motionSpeed / 3, 0, 1.4);
        const spread = effectiveFingerForce() * (0.72 + motionBoost * 0.34);
        const velocityX = dx * spread;
        const velocityY = -dy * spread;
        const speed = Math.hypot(velocityX, velocityY);
        const segments = Math.round(clampValue(Math.ceil(speed / 2.1 + turbulence * 2.5), 2, 7));
        const inverseLength = speed > 0.0001 ? 1 / speed : 0;
        const unitX = velocityX * inverseLength;
        const unitY = velocityY * inverseLength;
        const perpendicularX = speed > 0.0001 ? -unitY : Math.cos(elapsed * 2.1);
        const perpendicularY = speed > 0.0001 ? unitX : Math.sin(elapsed * 2.1);
        const spacing = radius * (0.72 + turbulence * 0.45);
        for (let index = 0; index < segments; index += 1) {
          const t = segments <= 1 ? 0 : index / (segments - 1);
          const side = index % 2 === 0 ? 1 : -1;
          const wobble = Math.sin(elapsed * 11 + t * 13) * radius * turbulence * 0.42;
          const pointX = clamp01(x + unitX * (t - 0.5) * spacing + perpendicularX * wobble);
          const pointY = clamp01(y + unitY * (t - 0.5) * spacing + perpendicularY * wobble);
          const swirl = effectiveFingerForce() * turbulence * (0.14 + motionBoost * 0.08) * side;
          splats.push(velocitySplat(pointX, pointY, radius * (0.88 + t * 0.16), velocityX + perpendicularX * swirl, velocityY + perpendicularY * swirl));
        }
        const eddyAssist = fluidNumber(config, 'eddyAssist');
        if (eddyAssist > 0) splats.push(velocitySplat(x, y, radius * 1.22, -velocityY * eddyAssist, velocityX * eddyAssist));
        const dye = nextInjectColor(x, y, intensity);
        const colorRadiusBoost = fluidString(config, 'injectPalette') === 'style' ? 1 : 1.18;
        for (let index = 0; index < segments; index += 1) {
          const t = segments <= 1 ? 0 : index / (segments - 1);
          const wobble = Math.sin(elapsed * 11 + t * 13) * radius * turbulence * 0.22;
          splats.push({
            x: clamp01(x + unitX * (t - 0.5) * spacing + perpendicularX * wobble),
            y: clamp01(y + unitY * (t - 0.5) * spacing + perpendicularY * wobble),
            radius: radius * colorRadiusBoost * (0.72 + t * 0.18 + turbulence * 0.12),
            velocityX: 0,
            velocityY: 0,
            dye,
            amount: 1,
          });
        }
      }

      function queueStir(screenX: number, screenY: number, dx: number, dy: number, radiusScale: number): void {
        const x = clamp01(screenX);
        const y = clamp01(1 - screenY);
        const radius = effectiveFingerRadius() * radiusScale;
        const velocityX = dx * effectiveFingerForce();
        const velocityY = -dy * effectiveFingerForce();
        splats.push(velocitySplat(x, y, radius, velocityX, velocityY));
        const eddyAssist = fluidNumber(config, 'eddyAssist');
        if (eddyAssist > 0) splats.push(velocitySplat(x, y, radius * 1.35, dy * effectiveFingerForce() * eddyAssist, dx * effectiveFingerForce() * eddyAssist));
      }

      function queueSmallSwirl(x: number, y: number): void {
        for (let index = 0; index < 8; index += 1) {
          const angle = index / 8 * Math.PI * 2;
          const radius = randomBetween(effectiveFingerRadius() * 0.35, effectiveFingerRadius() * 0.9);
          queueStir(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, -Math.sin(angle) * 0.55, Math.cos(angle) * 0.55, 0.85);
        }
      }

      function ambientStir(): void {
        lastAmbient = elapsed;
        for (let index = 0; index < 2; index += 1) {
          const phase = index * Math.PI;
          queueStir(
            0.5 + Math.sin(elapsed * 0.31 + phase) * 0.28,
            0.5 + Math.cos(elapsed * 0.27 + phase * 1.3) * 0.24,
            Math.cos(elapsed * 0.71 + phase) * 0.5,
            Math.sin(elapsed * 0.63 + phase) * 0.5,
            2,
          );
        }
      }

      let demoAccumulator = 0;
      let demoAngle = 0;
      let demoX = 0.26;
      let demoY = 0.54;
      function runDemoInput(dt: number): void {
        demoAccumulator += dt;
        demoAngle += dt * (launch.profile === 'preview' ? 1.85 : 1.25);
        const interval = launch.profile === 'preview' ? 0.085 : 1 / 60;
        if (demoAccumulator < interval) return;
        demoAccumulator = 0;
        const x = 0.5 + Math.sin(demoAngle * 0.7) * 0.24;
        const y = 0.5 + Math.cos(demoAngle * 0.61) * 0.22;
        const dx = x - demoX;
        const dy = y - demoY;
        const distancePixels = Math.hypot(dx * renderer.viewport.width, dy * renderer.viewport.height);
        const stepSize = launch.profile === 'preview' ? 28 : 14;
        const steps = Math.max(1, Math.min(launch.profile === 'preview' ? 3 : 7, Math.ceil(distancePixels / stepSize)));
        for (let index = 1; index <= steps; index += 1) {
          const t = index / steps;
          const pointX = demoX + dx * t;
          const pointY = demoY + dy * t;
          const velocity = velocityFromScreenDelta(dx * renderer.viewport.width / steps, dy * renderer.viewport.height / steps, renderer.viewport.width, renderer.viewport.height, field.simulationWidth, field.simulationHeight);
          queueInject(pointX, pointY, velocity.dx, velocity.dy, 1);
        }
        demoX = x;
        demoY = y;
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

      function seedField(): void {
        imageRequest += 1;
        splats.length = 0;
        const style = requireStyle();
        const options = styleOptions();
        const seedOptions = {
          palette: style.palette.slice(0, 4).map(fluidColor3),
          paletteStrength: options.paletteStrength,
          cellSize: launch.profile === 'preview' ? Math.max(1.85, fluidNumber(config, 'cellSize')) : fluidNumber(config, 'cellSize'),
        };
        const initMode = effectiveInitMode();
        if (initMode === 'image') {
          field.seed('cloud', seedValue, seedOptions);
          loadImage(resolveInitImageUrl(fluidString(config, 'initImageUrl'), seedValue));
        } else {
          field.seed(initMode, seedValue, seedOptions);
        }
        if (initMode !== 'blank') seedRestingMotion();
      }

      function seedRestingMotion(): void {
        for (let index = 0; index < 7; index += 1) {
          const angle = random() * Math.PI * 2;
          queueStir(random(), random(), Math.cos(angle) * randomBetween(0.35, 0.75), Math.sin(angle) * randomBetween(0.35, 0.75), randomBetween(1.4, 2.4));
        }
      }

      function loadImage(url: string): void {
        const request = ++imageRequest;
        const current = field;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.decoding = 'async';
        image.onload = () => {
          if (disposed || request !== imageRequest || field !== current) return;
          const canvas = document.createElement('canvas');
          canvas.width = current.width;
          canvas.height = current.height;
          const context2d = canvas.getContext('2d', { willReadFrequently: true });
          if (!context2d) return;
          context2d.translate(0, canvas.height);
          context2d.scale(1, -1);
          context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
          const bytes = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
          const values = new Float32Array(bytes.length);
          for (let index = 0; index < bytes.length; index += 1) values[index] = (bytes[index] ?? 0) / 255;
          current.uploadDyeRgba(values);
        };
        image.onerror = () => {
          if (!disposed && request === imageRequest && field === current) current.seed('cloud', seedValue, {
            palette: requireStyle().palette.slice(0, 4).map(fluidColor3),
            paletteStrength: styleOptions().paletteStrength,
            cellSize: fluidNumber(config, 'cellSize'),
          });
        };
        image.src = url;
      }

      function nextInjectColor(x: number, y: number, intensity: number): readonly [number, number, number] {
        const colorMode = fluidString(config, 'injectPalette');
        let base: readonly [number, number, number];
        if (colorMode === 'cyan') base = [0.04, 0.92, 0.86];
        else if (colorMode === 'magenta') base = [0.94, 0.05, 0.82];
        else if (colorMode === 'amber') base = [0.96, 0.58, 0.04];
        else if (colorMode === 'green') base = [0.05, 0.92, 0.2];
        else if (colorMode === 'blue') base = [0.08, 0.24, 0.94];
        else if (colorMode === 'red') base = [0.96, 0.08, 0.03];
        else if (colorMode === 'white') base = [0.88, 0.88, 0.82];
        else if (colorMode === 'rainbow') base = hsv((elapsed * 0.12 + x * 0.5 + y * 0.35) % 1, 0.94, 1);
        else base = blendPalette(requireStyle().palette, (x * 0.7 + y * 0.31 + elapsed * 0.02) % 1);
        const fixedColorBoost = colorMode === 'style' ? 0 : 0.18;
        const style = styleOptions();
        const amount = (style.visualPipeline === 'reference'
          ? 0.13 + fixedColorBoost * 0.34 + style.paletteStrength * 0.02 + intensity * 0.07
          : 0.34 + fixedColorBoost + style.paletteStrength * 0.08 + intensity * 0.18)
          * clampValue(effectiveInjectAmount(), 0, 3);
        return [base[0] * amount, base[1] * amount, base[2] * amount];
      }

      function effectiveInitMode(): 'blank' | 'random' | 'voronoi' | 'cloud' | 'image' {
        if (launch.profile === 'preview') return 'blank';
        const value = fluidString(config, 'renderStyle');
        return value === 'blank' || value === 'random' || value === 'voronoi' || value === 'image' ? value : 'cloud';
      }

      function effectiveFingerForce(): number {
        return launch.profile === 'preview' ? Math.min(9, fluidNumber(config, 'fingerForce')) : fluidNumber(config, 'fingerForce');
      }

      function effectiveFingerRadius(): number {
        return launch.profile === 'preview' ? PREVIEW_FINGER_RADIUS : fluidNumber(config, 'fingerRadius');
      }

      function effectiveInjectAmount(): number {
        return launch.profile === 'preview' ? PREVIEW_INJECT_AMOUNT : fluidNumber(config, 'injectAmount');
      }

      function effectiveInjectTurbulence(): number {
        return launch.profile === 'preview' ? PREVIEW_INJECT_TURBULENCE : fluidNumber(config, 'injectTurbulence');
      }

      function applyStyle(): void {
        const style = requireStyle();
        const background = fluidColor3(style.background);
        renderer.setClearColor([background[0], background[1], background[2], 1]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({ enabled: false, intensity: 0, threshold: 1, radius: 1, iterations: 1, resolutionScale: 0.5 });
      }

      function styleOptions(): FluidStyleOptions {
        return STYLE_OPTIONS[styleId] ?? STYLE_OPTIONS['bounded-cyan'] ?? standard(1.06, 0.76, 0.18);
      }

      function requireStyle() {
        const style = FLUID_TANK_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
        if (!style) throw new Error(`Unknown Fluid Tank style: ${styleId}`);
        return style;
      }

      function randomBetween(min: number, max: number): number {
        return min + random() * (max - min);
      }

      function record(): Readonly<Record<string, ExperienceSettingValue>> {
        return Object.freeze({ ...config });
      }
    },
  };

  function random(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }
}

export function velocityFromScreenDelta(dx: number, dy: number, width: number, height: number, simulationWidth: number, simulationHeight: number): { readonly dx: number; readonly dy: number } {
  let velocityX = dx / Math.max(1, width) * simulationWidth;
  let velocityY = dy / Math.max(1, height) * simulationHeight;
  const magnitude = Math.hypot(velocityX, velocityY);
  if (magnitude > MAX_VELOCITY_CELLS) {
    const scale = MAX_VELOCITY_CELLS / magnitude;
    velocityX *= scale;
    velocityY *= scale;
  }
  return { dx: velocityX, dy: velocityY };
}

function standard(exposure: number, paletteStrength: number, edgeDarkening: number): FluidStyleOptions {
  return Object.freeze({ exposure, paletteStrength, edgeDarkening, shadingStrength: 0, bloomStrength: 0, bloomThreshold: 0.62, sunraysStrength: 0, visualPipeline: 'standard' });
}

function velocitySplat(x: number, y: number, radius: number, velocityX: number, velocityY: number): FluidSplat2D {
  return { x, y, radius, velocityX, velocityY, dye: [0, 0, 0], amount: 0 };
}

function resolveInitImageUrl(value: string, seed: number): string {
  const explicit = value.trim();
  if (explicit.length > 0) return explicit;
  const imageSeed = Math.abs(Math.floor(seed * 100000)).toString(36);
  return `${PUBLIC_RANDOM_IMAGE_URL_BASE}/seed/fluid-tank-${imageSeed}/1280/1280`;
}

function blendPalette(palette: readonly number[], t: number): readonly [number, number, number] {
  if (palette.length === 0) return fluidColor3(0x9dfff4);
  if (palette.length === 1) return fluidColor3(palette[0] ?? 0x9dfff4);
  const scaled = (((t % 1) + 1) % 1) * palette.length;
  const index = Math.floor(scaled) % palette.length;
  const next = (index + 1) % palette.length;
  const local = scaled - Math.floor(scaled);
  const eased = local * local * (3 - 2 * local);
  const a = fluidColor3(palette[index] ?? 0xffffff);
  const b = fluidColor3(palette[next] ?? 0xffffff);
  return [a[0] * (1 - eased) + b[0] * eased, a[1] * (1 - eased) + b[1] * eased, a[2] * (1 - eased) + b[2] * eased];
}

function hsv(h: number, saturation: number, value: number): readonly [number, number, number] {
  const index = Math.floor(h * 6);
  const f = h * 6 - index;
  const p = value * (1 - saturation);
  const q = value * (1 - f * saturation);
  const t = value * (1 - (1 - f) * saturation);
  switch (index % 6) {
    case 1: return [q, value, p];
    case 2: return [p, value, t];
    case 3: return [p, q, value];
    case 4: return [t, p, value];
    case 5: return [value, p, q];
    default: return [value, t, p];
  }
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clampValue(value, 0.001, 0.999);
}

function validStyle(value: string | undefined): string | undefined {
  return value && FLUID_TANK_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
