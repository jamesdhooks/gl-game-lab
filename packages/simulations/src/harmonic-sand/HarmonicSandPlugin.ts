import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineInput,
  EngineRender2D,
  EngineSchedule,
  type ExperienceLaunchOptions,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
} from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createHarmonicSandConfig, HARMONIC_SAND_DEFAULTS, type HarmonicSandConfig } from './config.js';
import { HARMONIC_SAND_FRAGMENT_SHADER } from './shader.js';
import { HARMONIC_SAND_STYLE_MANIFEST, rgb } from './styles.js';

const MAX_EMITTERS = 16;
const PICK_RADIUS = 0.18;

interface Emitter { x: number; y: number; frequency: number; phase: number; amplitude: number }

export interface HarmonicSandController extends ExperienceRuntimeController {
  readonly emitterCount: number;
}

export const HarmonicSandControllerService = createExtensionToken<HarmonicSandController>('gl-game-lab.simulations.harmonic-sand.controller');
export const HARMONIC_SAND_PLUGIN_ID = 'gl-game-lab.simulations.harmonic-sand';

export function createHarmonicSandPlugin(
  initialConfig: HarmonicSandConfig = HARMONIC_SAND_DEFAULTS,
  launch: ExperienceLaunchOptions = {},
): EnginePlugin {
  let config = initialConfig;
  let styleId = validStyle(launch.styleId) ?? HARMONIC_SAND_STYLE_MANIFEST.defaultStyleId;
  let elapsed = 0;
  let activePointer: number | undefined;
  let draggingIndex: number | undefined;
  let lastTapTime = Number.NEGATIVE_INFINITY;
  let lastTapIndex: number | undefined;
  const emitters: Emitter[] = [];
  const emitterData = new Float32Array(MAX_EMITTERS * 4);
  const amplitudes = new Float32Array(MAX_EMITTERS);

  return {
    id: HARMONIC_SAND_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      const renderer = context.get(EngineRender2D);
      const input = context.get(EngineInput);
      resetEmitters();
      applyBackground();

      const controller: HarmonicSandController = {
        get modeId() { return 'shape'; },
        get styleId() { return styleId; },
        get settings() { return Object.freeze({ ...config }); },
        get emitterCount() { return emitters.length; },
        get entityCount() { return emitters.length; },
        setMode: (modeId) => { if (modeId !== 'shape') throw new Error(`Unknown Harmonic Sand mode: ${modeId}`); },
        setStyle: (nextStyleId) => {
          const next = validStyle(nextStyleId);
          if (!next) throw new Error(`Unknown Harmonic Sand style: ${nextStyleId}`);
          styleId = next;
          applyBackground();
        },
        setSetting: (key, value) => {
          config = createHarmonicSandConfig({ ...configRecord(), [key]: value });
          while (emitters.length > config.rawEmitterLimit) emitters.shift();
        },
        reset: () => { elapsed = 0; resetEmitters(); },
      };
      registerSimulationRuntime(context, HarmonicSandControllerService, controller, () => {
        emitters.length = 0;
      });

      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.harmonic-sand.input',
        stage: 'update',
        run: ({ time }) => {
          elapsed += time.deltaSeconds;
          for (const event of input.snapshot.events) if (event.kind === 'pointer') routePointer(event);
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.harmonic-sand.render',
        stage: 'renderExtract',
        run: () => {
          fillEmitterArrays();
          const style = requireStyle();
          const palette = style.palette;
          renderer.submitFullscreenEffect({
            id: 'harmonic-sand.field',
            language: 'glsl-es-300',
            fragmentSource: HARMONIC_SAND_FRAGMENT_SHADER,
            uniforms: {
              uResolution: { type: '2f', value: [renderer.viewport.width, renderer.viewport.height] },
              uFieldResolution: { type: '1f', value: config.resolution },
              uTime: { type: '1f', value: elapsed / config.wavePeriod },
              uBaseFrequency: { type: '1f', value: config.baseFrequency },
              uParticleDensity: { type: '1f', value: config.rawParticleDensity },
              uParticleCount: { type: '1f', value: config.rawParticleCount },
              uLineSharpness: { type: '1f', value: config.rawLineSharpness },
              uGlow: { type: '1f', value: config.rawGlow },
              uRenderMode: { type: '1i', value: config.renderStyle === 'basic' ? 0 : config.renderStyle === 'enhanced' ? 1 : 2 },
              uEmitterCount: { type: '1i', value: emitters.length },
              uEmitters: { type: '4fv', value: emitterData.subarray(0, emitters.length * 4) },
              uEmitterAmplitudes: { type: '1fv', value: amplitudes.subarray(0, emitters.length) },
              uPaletteA: { type: '3f', value: rgb(palette[0] ?? 0xffffff) },
              uPaletteB: { type: '3f', value: rgb(palette[1] ?? palette[0] ?? 0xffffff) },
              uPaletteC: { type: '3f', value: rgb(palette[2] ?? palette[0] ?? 0xffffff) },
              uPaletteD: { type: '3f', value: rgb(palette[3] ?? palette[0] ?? 0xffffff) },
              uBackground: { type: '3f', value: rgb(style.background) },
            },
          });
        },
      });

      function applyBackground(): void {
        const background = rgb(requireStyle().background);
        renderer.setClearColor([background[0], background[1], background[2], 1]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({ enabled: false });
      }

      function routePointer(event: PointerInputEvent): void {
        const point = toPlate(event.x, event.y, renderer.viewport.width, renderer.viewport.height);
        if (event.phase === 'down') {
          const nearest = nearestEmitter(point.x, point.y);
          if (nearest !== undefined && nearest === lastTapIndex && elapsed - lastTapTime <= 0.32) {
            emitters.splice(nearest, 1);
            activePointer = undefined;
            draggingIndex = undefined;
            lastTapIndex = undefined;
            return;
          }
          lastTapTime = elapsed;
          lastTapIndex = nearest;
          draggingIndex = nearest ?? addEmitter(point.x, point.y);
          activePointer = event.id;
        } else if (event.phase === 'move' && activePointer === event.id && draggingIndex !== undefined) {
          const emitter = emitters[draggingIndex];
          if (emitter) { emitter.x = point.x; emitter.y = point.y; }
        } else if ((event.phase === 'up' || event.phase === 'cancel') && activePointer === event.id) {
          activePointer = undefined;
          draggingIndex = undefined;
        }
      }
    }
  };

  function resetEmitters(): void {
    emitters.splice(0, emitters.length,
      { x: -0.44, y: -0.22, frequency: 2.6, phase: 0.2, amplitude: 1 },
      { x: 0.36, y: -0.1, frequency: 3.1, phase: 2.4, amplitude: 1 },
      { x: -0.02, y: 0.38, frequency: 2.2, phase: 4.1, amplitude: 0.9 },
    );
    emitters.splice(config.rawEmitterLimit);
  }

  function addEmitter(x: number, y: number): number {
    if (emitters.length >= config.rawEmitterLimit) emitters.shift();
    const index = emitters.length;
    emitters.push({
      x, y,
      frequency: config.baseFrequency * (0.82 + (index % 5) * 0.08),
      phase: (x * 5.1 + y * 3.7 + index * 1.9) % (Math.PI * 2),
      amplitude: 1,
    });
    return emitters.length - 1;
  }

  function nearestEmitter(x: number, y: number): number | undefined {
    let best: number | undefined;
    let distance = PICK_RADIUS;
    emitters.forEach((emitter, index) => {
      const candidate = Math.hypot(emitter.x - x, emitter.y - y);
      if (candidate <= distance) { distance = candidate; best = index; }
    });
    return best;
  }

  function fillEmitterArrays(): void {
    emitters.forEach((emitter, index) => {
      emitterData.set([emitter.x, emitter.y, emitter.frequency, emitter.phase], index * 4);
      amplitudes[index] = emitter.amplitude;
    });
  }

  function requireStyle() {
    const style = HARMONIC_SAND_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
    if (!style) throw new Error(`Unknown Harmonic Sand style: ${styleId}`);
    return style;
  }

  function configRecord(): Readonly<Record<string, ExperienceSettingValue>> { return Object.freeze({ ...config }); }
}

function validStyle(value: string | undefined): string | undefined {
  return value && HARMONIC_SAND_STYLE_MANIFEST.styles.some((style) => style.id === value) ? value : undefined;
}

function toPlate(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const aspect = width / Math.max(1, height);
  return { x: (x / Math.max(1, width) - 0.5) * 2 * aspect, y: (y / Math.max(1, height) - 0.5) * 2 };
}
