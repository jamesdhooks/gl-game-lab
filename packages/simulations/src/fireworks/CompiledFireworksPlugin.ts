import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineGpu2D,
  EngineInput,
  EngineParticleEffects,
  particleDiagnosticsSummary2D,
  EngineRender2D,
  EngineSchedule,
  ExperiencePreviewCycleControllerService,
  type ExperienceLaunchOptions,
  type ExperiencePreviewCycleRequest,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
  type ParticleEffectInstance2D,
} from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import {
  createFireworksConfig,
  FIREWORKS_DEFAULTS,
  type FireworksBurstPattern,
  type FireworksColorMode,
  type FireworksConfig,
} from './config.js';
import { FIREWORKS_PARTICLE_PROGRAM } from '../particlePrograms.js';
import { resolveFireworkLaunchVelocity, type FireworksMode } from './FireworksPlugin.js';
import { color3, FIREWORKS_STYLE_MANIFEST } from './styles.js';

const MAX_SHELLS = 128;
const PATTERNS: readonly FireworksBurstPattern[] = ['peony', 'ring', 'chrysanthemum', 'willow', 'palm', 'spiral', 'crossette', 'comet'];
const EFFECT_ID = FIREWORKS_PARTICLE_PROGRAM.effect.source.id;

export interface CompiledFireworksController extends ExperienceRuntimeController {
  readonly mode: FireworksMode;
  readonly activeShells: number;
  readonly particleCapacity: number;
}

export const CompiledFireworksControllerService = createExtensionToken<CompiledFireworksController>('gl-game-lab.simulations.fireworks.compiled.controller');
export const COMPILED_FIREWORKS_PLUGIN_ID = 'gl-game-lab.simulations.fireworks.compiled';

export function createCompiledFireworksPlugin(initial: FireworksConfig = FIREWORKS_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  const autonomous = launch.profile === 'preview' || launch.profile === 'demo';
  let config = initial;
  let mode: FireworksMode = launch.modeId === 'stream' ? 'stream' : 'single';
  let styleId = validStyle(launch.styleId) ?? FIREWORKS_STYLE_MANIFEST.defaultStyleId;
  let randomState = normalizeSeed(launch.seed);
  let capacity = capacityFor(config, autonomous);
  let width = 1280;
  let height = 720;
  let launchAccumulator = 0;
  let shellCount = 0;
  const shellX = new Float32Array(MAX_SHELLS);
  const shellY = new Float32Array(MAX_SHELLS);
  const shellVx = new Float32Array(MAX_SHELLS);
  const shellVy = new Float32Array(MAX_SHELLS);
  const shellAge = new Float32Array(MAX_SHELLS);
  const shellFuse = new Float32Array(MAX_SHELLS);
  const shellPattern = new Uint8Array(MAX_SHELLS);

  return {
    id: COMPILED_FIREWORKS_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      const renderer = context.get(EngineRender2D);
      const gpu = context.get(EngineGpu2D);
      const input = context.get(EngineInput);
      const effects = context.get(EngineParticleEffects);
      effects.register(FIREWORKS_PARTICLE_PROGRAM, { capacity });
      effects.prewarm(EFFECT_ID);
      const instance = effects.createInstance(EFFECT_ID, { seed: normalizeSeed(launch.seed), qualityTier: config.renderStyle, preview: launch.profile === 'preview' });
      applyStyle(instance, renderer);
      configure(instance, renderer);
      if (autonomous) queuePreviewShow(instance);

      const controller: CompiledFireworksController = {
        get mode() { return mode; },
        get modeId() { return mode; },
        get styleId() { return styleId; },
        get settings() { return Object.freeze({ ...config }); },
        get activeShells() { return shellCount; },
        get particleCapacity() { return capacity; },
        get entityCount() { return instance.diagnostics().activeEstimate; },
        get runtimeDiagnostics() { return Object.freeze({ ...particleDiagnosticsSummary2D(instance.diagnostics()), activeShells: shellCount }); },
        setMode: (value) => {
          if (value !== 'single' && value !== 'stream') throw new Error(`Unknown Fireworks mode: ${value}`);
          mode = value;
          launchAccumulator = 0;
        },
        setStyle: (value) => {
          const next = validStyle(value);
          if (!next) throw new Error(`Unknown Fireworks style: ${value}`);
          styleId = next;
          applyStyle(instance, renderer);
        },
        setSetting: (key, value) => {
          const previousCapacity = capacity;
          config = createFireworksConfig({ ...configRecord(), [key]: value });
          capacity = capacityFor(config, autonomous);
          if (capacity !== previousCapacity) effects.setCapacity(EFFECT_ID, capacity);
          configure(instance, renderer);
        },
        reset: () => reset(instance),
      };
      registerSimulationRuntime(context, CompiledFireworksControllerService, controller, () => instance.dispose());

      if (autonomous) {
        context.provide(ExperiencePreviewCycleControllerService, {
          advancePreviewCycle: (request: ExperiencePreviewCycleRequest) => {
            randomState = normalizeSeed(request.seed);
            styleId = FIREWORKS_STYLE_MANIFEST.styles[Math.floor(nextRandom() * FIREWORKS_STYLE_MANIFEST.styles.length)]?.id ?? styleId;
            applyStyle(instance, renderer);
            reset(instance);
            queuePreviewShow(instance);
            return 'handled';
          },
        });
      }

      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fireworks.compiled.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          if (renderer.viewport.width !== width || renderer.viewport.height !== height) configure(instance, renderer);
          updateShells(instance, dt);
          for (const event of input.snapshot.events) if (event.kind === 'pointer') routePointer(instance, event);
          const held = input.snapshot.pointers.find((pointer) => pointer.buttons !== 0);
          if (mode === 'stream' && held) {
            launchAccumulator += dt * config.autoFinaleRate;
            while (launchAccumulator >= 1) {
              launchShell(instance, held.x, held.y);
              launchAccumulator -= 1;
            }
          } else if (autonomous && !held) {
            launchAccumulator += dt * (launch.profile === 'preview' ? 1.05 : 1.45);
            while (launchAccumulator >= 1) {
              launchShell(instance, width * (0.18 + nextRandom() * 0.64), height * (0.14 + nextRandom() * 0.42));
              launchAccumulator -= 1;
            }
          }
          effects.update(dt);
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fireworks.compiled.render',
        stage: 'renderExtract',
        run: () => gpu.submit('fireworks.compiled-particles', (target) => effects.render(target)),
      });

      function configure(effect: ParticleEffectInstance2D, render: typeof renderer): void {
        width = Math.max(1, render.viewport.width);
        height = Math.max(1, render.viewport.height);
        effect.setViewport({ width, height, dpr: render.viewport.pixelRatio ?? 1 });
        effect.setDomain({ revision: 1, shape: 'rectangle', behavior: 'kill', center: [width * 0.5, height * 0.5], halfExtents: [width * 0.5 + 160, height * 0.5 + 160] });
        effect.setParameter('gravity', config.gravity);
        effect.setParameter('air-drag', config.airDrag);
        effect.setParameter('particle-size', config.particleSize);
        effect.setParameter('particle-length', config.particleLength);
        effect.setParameter('secondary-size', config.particleSize * config.secondaryScale);
        effect.setParameter('sparkle-size', config.terminalSparkleSize);
        effect.setQualityTier(config.renderStyle);
        effect.setRenderParameters({
          pointScale: 1,
          intensity: config.renderStyle === 'ultra' ? 0.62 : 0.9,
          trailFade: config.trailFade,
          trailBloom: config.bloomStrength * 0.42,
          trailBackground: color3(requireStyle().background),
          directComposite: config.renderStyle !== 'ultra',
          paletteTransition: config.paletteTransition,
          colorMode: renderColorMode(config.colorMode),
        });
        const secondary = {
          probability: config.secondaryChance,
          count: config.secondaryCount,
          maxGeneration: config.secondaryDepth,
          delay: config.secondaryDelay,
          velocityInheritance: config.secondaryInheritance,
          powerScale: config.secondaryPowerScale,
          spread: config.secondarySpread * Math.PI * 2,
        };
        effect.setEventParameters('primary', 0, secondary);
        effect.setEventParameters('secondary', 0, secondary);
        const sparkle = {
          probability: config.terminalSparkleProbability,
          count: config.terminalSparkleCount,
          maxGeneration: 3,
          lifetime: config.terminalSparkleLifetime,
          powerScale: config.explosionPower > 0 ? config.terminalSparklePower / config.explosionPower : 0,
          spread: Math.PI * 2,
        };
        effect.setEventParameters('primary', 1, sparkle);
        effect.setEventParameters('secondary', 1, sparkle);
      }

      function applyStyle(effect: ParticleEffectInstance2D, render: typeof renderer): void {
        const style = requireStyle();
        const background = color3(style.background);
        render.setClearColor([background[0], background[1], background[2], 1]);
        render.setBackdrop(undefined);
        render.setBloom({ enabled: false });
        effect.setPalette({ revision: nextSeed(), colors: style.palette.slice(0, 8).map(color3) });
      }

      function reset(effect: ParticleEffectInstance2D): void {
        shellCount = 0;
        launchAccumulator = 0;
        randomState = normalizeSeed(launch.seed);
        effect.restart(randomState);
      }

      function queuePreviewShow(effect: ParticleEffectInstance2D): void {
        for (let index = 0; index < 3; index += 1) launchShell(effect, width * (0.25 + index * 0.25), height * (0.2 + nextRandom() * 0.22));
      }

      function routePointer(effect: ParticleEffectInstance2D, event: PointerInputEvent): void {
        if (event.phase === 'down') launchShell(effect, event.x, event.y);
      }

      function launchShell(effect: ParticleEffectInstance2D, targetX: number, targetY: number): void {
        if (shellCount >= MAX_SHELLS) return;
        const index = shellCount++;
        const startX = targetX + (nextRandom() * 2 - 1) * width * config.launchSpread;
        const startY = height + 18;
        const fuse = config.shellFuse * (0.88 + nextRandom() * 0.24);
        const [vx, vy] = resolveFireworkLaunchVelocity(startX, startY, targetX, targetY, fuse, config.gravity, config.launchPower);
        const pattern = autonomous ? Math.floor(nextRandom() * PATTERNS.length) : PATTERNS.indexOf(config.burstPattern);
        shellX[index] = startX;
        shellY[index] = startY;
        shellVx[index] = vx;
        shellVy[index] = vy;
        shellAge[index] = 0;
        shellFuse[index] = fuse;
        shellPattern[index] = Math.max(0, pattern);
        effect.emitter('shell-launch').writer().position(startX, startY).power(0).inheritedVelocity(vx, vy).lifetime(fuse).seed(nextSeed()).count(1).submit();
      }

      function updateShells(effect: ParticleEffectInstance2D, dt: number): void {
        for (let index = shellCount - 1; index >= 0; index -= 1) {
          shellVy[index] = shellVy[index]! + config.gravity * dt;
          shellX[index] = shellX[index]! + shellVx[index]! * dt;
          shellY[index] = shellY[index]! + shellVy[index]! * dt;
          shellAge[index] = shellAge[index]! + dt;
          if (shellAge[index]! < shellFuse[index]!) continue;
          const pattern = PATTERNS[shellPattern[index]!] ?? 'peony';
          effect
            .emitter(`primary-${pattern}`)
            .writer()
            .position(shellX[index]!, shellY[index]!)
            .direction(-Math.PI * 0.5)
            .spread(pattern === 'comet' ? 0.42 : Math.PI * 2)
            .power(config.explosionPower)
            .inheritedVelocity(shellVx[index]! * 0.18, shellVy[index]! * 0.18)
            .seed(nextSeed())
            .count(config.burstParticles)
            .submit();
          removeShell(index);
        }
      }

      function removeShell(index: number): void {
        const last = --shellCount;
        if (index === last) return;
        shellX[index] = shellX[last]!;
        shellY[index] = shellY[last]!;
        shellVx[index] = shellVx[last]!;
        shellVy[index] = shellVy[last]!;
        shellAge[index] = shellAge[last]!;
        shellFuse[index] = shellFuse[last]!;
        shellPattern[index] = shellPattern[last]!;
      }

      function requireStyle() {
        const style = FIREWORKS_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
        if (!style) throw new Error(`Unknown Fireworks style: ${styleId}`);
        return style;
      }
    },
  };

  function configRecord(): Readonly<Record<string, ExperienceSettingValue>> {
    return Object.freeze({ ...config });
  }
  function nextSeed(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return randomState >>> 0;
  }
  function nextRandom(): number {
    return nextSeed() / 0x1_0000_0000;
  }
}

function capacityFor(config: FireworksConfig, autonomous: boolean): number {
  const size = Number(config.rawParticleTextureSize);
  const bounded = autonomous ? Math.min(256, size) : size;
  return bounded * bounded;
}

function renderColorMode(mode: FireworksColorMode): 'seeded' | 'over-life' | 'generation' {
  return mode === 'over-life' ? 'over-life' : mode === 'secondary-accent' ? 'generation' : 'seeded';
}

function validStyle(value: string | undefined): string | undefined {
  return value && FIREWORKS_STYLE_MANIFEST.styles.some((style) => style.id === value) ? value : undefined;
}

function normalizeSeed(seed: number | undefined): number {
  const value = seed ?? 940_711;
  if (!Number.isSafeInteger(value)) throw new Error('Fireworks seed must be a safe integer');
  return (value >>> 0) || 940_711;
}
