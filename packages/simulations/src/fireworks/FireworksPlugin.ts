import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, ExperiencePreviewCycleControllerService,
  ParticleCommandQueue2D, type ExperienceLaunchOptions, type ExperiencePreviewCycleRequest,
  type ExperienceRuntimeController, type ExperienceSettingValue, type GpuParticleSystem2D,
  type GpuUniformEncoder2D, type GpuUniformLookup2D,
} from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createFireworksConfig, FIREWORKS_DEFAULTS, type FireworksBurstPattern, type FireworksConfig } from './config.js';
import { FIREWORKS_PARTICLE_EFFECT, fireworksColorModeCode, fireworksPatternCode } from './effect.js';
import {
  FIREWORKS_EVENT_SHADER, FIREWORKS_POINT_FRAGMENT_SHADER, FIREWORKS_POINT_VERTEX_SHADER,
  FIREWORKS_STEP_SHADER, FIREWORKS_STREAK_FRAGMENT_SHADER, FIREWORKS_STREAK_VERTEX_SHADER,
} from './shaders.js';
import { color3, FIREWORKS_STYLE_MANIFEST } from './styles.js';

export type FireworksMode = 'single' | 'stream';
interface SpawnCommand {
  archetypeId: 'shell' | 'primary'; x: number; y: number; vx: number; vy: number;
  count: number; power: number; life: number; lifeVariation: number; seed: number; paletteSeed: number; pattern: number;
}
interface ShellActor { x: number; y: number; vx: number; vy: number; age: number; fuse: number; paletteSeed: number; pattern: number }

export interface FireworksController extends ExperienceRuntimeController {
  readonly mode: FireworksMode; readonly activeShells: number; readonly particleCapacity: number;
}
export const FireworksControllerService = createExtensionToken<FireworksController>('gl-game-lab.simulations.fireworks.controller');
export const FIREWORKS_PLUGIN_ID = 'gl-game-lab.simulations.fireworks';

export function createFireworksPlugin(initial: FireworksConfig = FIREWORKS_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  const autonomousPreview = launch.profile === 'preview' || launch.profile === 'demo';
  let config = initial;
  let mode: FireworksMode = launch.modeId === 'stream' ? 'stream' : 'single';
  let styleId = validStyle(launch.styleId) ?? FIREWORKS_STYLE_MANIFEST.defaultStyleId;
  let elapsed = 0, pendingDt = 0, launchAccumulator = 0, randomState = normalizeSeed(launch.seed), rebuildState = false;
  let viewportWidth = 1280, viewportHeight = 720;
  let cleanupResources = (): void => undefined;
  const commands: SpawnCommand[] = [];
  const shells: ShellActor[] = [];
  const commandQueue = new ParticleCommandQueue2D(FIREWORKS_PARTICLE_EFFECT);
  const paletteBuffer = new Float32Array(24);
  let paletteCount = 0;

  return {
    id: FIREWORKS_PLUGIN_ID,
    version: '2.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let particles = createParticles(), observedGeneration = particles.generation;
      commandQueue.setCapacity(particles.capacity);
      cleanupResources = () => { particles.dispose(); };
      applyStyle();
      if (autonomousPreview) queuePreviewShow();

      const controller: FireworksController = {
        get mode() { return mode; }, get modeId() { return mode; }, get styleId() { return styleId; },
        get settings() { return Object.freeze({ ...config }); }, get activeShells() { return shells.length; },
        get particleCapacity() { return particles.capacity; }, get entityCount() { return particles.capacity; },
        get runtimeDiagnostics() { return Object.freeze({ ...particles.diagnostics(), activeShells: shells.length, queuedSceneCommands: commands.length }); },
        setMode: (value) => { if (value !== 'single' && value !== 'stream') throw new Error(`Unknown Fireworks mode: ${value}`); mode = value; launchAccumulator = 0; },
        setStyle: (value) => { const next = validStyle(value); if (!next) throw new Error(`Unknown Fireworks style: ${value}`); styleId = next; applyStyle(); },
        setSetting: (key, value) => {
          const previousSize = config.rawParticleTextureSize;
          config = createFireworksConfig({ ...configRecord(), [key]: value });
          rebuildState ||= previousSize !== config.rawParticleTextureSize;
        },
        reset: resetSimulation,
      };
      registerSimulationRuntime(context, FireworksControllerService, controller, () => {
        cleanupResources(); commands.length = 0; shells.length = 0; commandQueue.reset();
      });
      if (autonomousPreview) {
        context.provide(ExperiencePreviewCycleControllerService, {
          advancePreviewCycle: (request: ExperiencePreviewCycleRequest) => {
            randomState = normalizeSeed(request.seed);
            styleId = FIREWORKS_STYLE_MANIFEST.styles[Math.floor(nextRandom() * FIREWORKS_STYLE_MANIFEST.styles.length)]?.id ?? styleId;
            applyStyle(); resetSimulation(); queuePreviewShow(); return 'handled';
          },
        });
      }

      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fireworks.update', stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          viewportWidth = renderer.viewport.width; viewportHeight = renderer.viewport.height;
          elapsed += dt; pendingDt += dt; updateShells(dt);
          const pointerEvents = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          for (const event of pointerEvents) if (event.phase === 'down') launchShell(event.x, event.y);
          if (mode === 'stream' && input.snapshot.pointers.length > 0) {
            launchAccumulator += dt * config.autoFinaleRate;
            const pointer = input.snapshot.pointers[0];
            while (pointer && launchAccumulator >= 1) { launchShell(pointer.x, pointer.y); launchAccumulator -= 1; }
          } else if (autonomousPreview && input.snapshot.pointers.length === 0) {
            launchAccumulator += dt * (launch.profile === 'preview' ? 1.05 : 1.45);
            while (launchAccumulator >= 1) { launchShell(viewportWidth * (0.18 + nextRandom() * 0.64), viewportHeight * (0.14 + nextRandom() * 0.42)); launchAccumulator -= 1; }
          }
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fireworks.render', stage: 'renderExtract',
        run: () => {
          gpu.submit('fireworks.gpu-show', (destination) => {
            if (particles.generation !== observedGeneration) { observedGeneration = particles.generation; resetCpuState(); }
            if (rebuildState) {
              particles.dispose(); particles = createParticles(); observedGeneration = particles.generation;
              commandQueue.setCapacity(particles.capacity); commandQueue.reset(); rebuildState = false; particles.clearTrails();
            }
            const dt = pendingDt; pendingDt = 0;
            for (const command of commands.splice(0, commandQueue.commandCapacity)) enqueueCommand(command);
            particles.stepBatch(commandQueue.drain(), (gl, uniform) => bindSimulation(gl, uniform, dt));
            particles.stepEvents(bindEvents);
            renderParticles(destination);
          });
        },
      });

      function bindSimulation(gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D, dt: number): void {
        gl.uniform1i(uniform('uCapacity'), particles.capacity); gl.uniform1f(uniform('uDt'), dt);
        gl.uniform1f(uniform('uGravity'), config.gravity); gl.uniform1f(uniform('uDamping'), config.airDrag);
        gl.uniform1f(uniform('uBurstChaos'), config.burstChaos); gl.uniform1f(uniform('uPatternVariation'), config.patternVariation);
        gl.uniform1f(uniform('uSecondaryChance'), config.secondaryChance); gl.uniform1f(uniform('uSecondaryDelay'), config.secondaryDelay);
        gl.uniform1f(uniform('uSecondaryDepth'), config.secondaryDepth); gl.uniform1f(uniform('uTerminalChance'), config.terminalSparkleProbability);
      }
      function bindEvents(gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D): void {
        gl.uniform1i(uniform('uCapacity'), particles.capacity);
        gl.uniform1f(uniform('uSecondaryCount'), config.secondaryCount); gl.uniform1f(uniform('uSecondaryScale'), config.secondaryScale);
        gl.uniform1f(uniform('uSecondaryInheritance'), config.secondaryInheritance); gl.uniform1f(uniform('uSecondarySpread'), config.secondarySpread);
        gl.uniform1f(uniform('uSecondaryPower'), config.explosionPower * config.secondaryPowerScale); gl.uniform1f(uniform('uSecondaryLife'), 2.4);
        gl.uniform1f(uniform('uSparkleCount'), config.terminalSparkleCount); gl.uniform1f(uniform('uSparklePower'), config.terminalSparklePower);
        gl.uniform1f(uniform('uSparkleLife'), config.terminalSparkleLifetime);
      }
      function bindRender(renderTier: number, intensity = 1) {
        return (gl: GpuUniformEncoder2D, uniform: GpuUniformLookup2D): void => {
          gl.uniform2f(uniform('uCanvasSize'), renderer.viewport.width, renderer.viewport.height);
          gl.uniform1f(uniform('uPixelScale'), destinationScale()); gl.uniform1f(uniform('uParticleSize'), config.particleSize * intensity);
          gl.uniform1f(uniform('uParticleLength'), config.particleLength); gl.uniform1f(uniform('uTerminalSize'), config.terminalSparkleSize);
          gl.uniform1f(uniform('uSizeVariability'), config.sparkSizeVariability); gl.uniform1f(uniform('uRenderTier'), renderTier);
          gl.uniform1f(uniform('uCrackle'), config.crackleIntensity); gl.uniform1f(uniform('uPaletteTransition'), config.paletteTransition);
          gl.uniform1i(uniform('uColorMode'), fireworksColorModeCode(config.colorMode)); gl.uniform3fv(uniform('uPalette[0]'), paletteBuffer);
          gl.uniform1i(uniform('uPaletteCount'), paletteCount);
        };
      }
      let currentDestinationWidth = 1;
      function destinationScale(): number { return currentDestinationWidth / Math.max(1, renderer.viewport.width); }
      function renderParticles(destination: Parameters<GpuParticleSystem2D['render']>[0]): void {
        currentDestinationWidth = destination.width;
        if (config.renderStyle === 'basic') { particles.render(destination, bindRender(0)); return; }
        if (config.renderStyle === 'enhanced') {
          particles.renderPass('streaks', destination, bindRender(0.55)); particles.render(destination, bindRender(0.45)); return;
        }
        const trailDestination = particles.beginTrails(destination.width, destination.height, config.trailFade);
        particles.renderPass('streaks', trailDestination, bindRender(1)); particles.render(trailDestination, bindRender(0.72));
        particles.compositeTrails(destination, color3(requireStyle().background), config.bloomStrength);
        particles.render(destination, bindRender(0.82, 1.18));
      }
      function enqueueCommand(command: SpawnCommand): void {
        commandQueue.enqueue({
          archetypeId: command.archetypeId, count: command.count, position: [command.x, command.y],
          inheritedVelocity: [command.vx, command.vy], direction: -Math.PI * 0.5, spread: Math.PI * 2,
          power: command.power, seed: command.seed, paletteSeed: command.paletteSeed,
          lifetimeScale: command.life, lifetimeVariability: command.lifeVariation, variant: command.pattern,
        });
      }
      function resetSimulation(): void { particles.clear(); particles.clearTrails(); resetCpuState(); }
      function resetCpuState(): void {
        commands.length = 0; shells.length = 0; commandQueue.reset(); elapsed = 0; pendingDt = 0;
        launchAccumulator = 0; randomState = normalizeSeed(launch.seed);
      }
      function queuePreviewShow(): void {
        for (let index = 0; index < 3; index += 1) launchShell(viewportWidth * (0.25 + index * 0.25), viewportHeight * (0.2 + nextRandom() * 0.22));
      }
      function createParticles(): GpuParticleSystem2D {
        const size = Number(config.rawParticleTextureSize), profileSize = autonomousPreview ? Math.min(256, size) : size;
        return gpu.createParticleSystem(`${FIREWORKS_PLUGIN_ID}.particles`, {
          capacity: profileSize * profileSize, width: profileSize, height: profileSize, precision: 'float', metadata: true,
          commandCapacity: FIREWORKS_PARTICLE_EFFECT.capacity.commandCapacity ?? 64,
          simulationFragmentSource: FIREWORKS_STEP_SHADER, eventFragmentSource: FIREWORKS_EVENT_SHADER,
          particleVertexSource: FIREWORKS_POINT_VERTEX_SHADER, particleFragmentSource: FIREWORKS_POINT_FRAGMENT_SHADER,
          renderPasses: { streaks: { vertexSource: FIREWORKS_STREAK_VERTEX_SHADER, fragmentSource: FIREWORKS_STREAK_FRAGMENT_SHADER, blend: 'additive', verticesPerParticle: 6 } },
          blend: 'additive', trails: true,
        });
      }
      function applyStyle(): void {
        const style = requireStyle(), background = color3(style.background);
        renderer.setClearColor([background[0], background[1], background[2], 1]); renderer.setBackdrop(undefined); renderer.setBloom({ enabled: false });
        paletteBuffer.fill(0); paletteCount = Math.min(8, style.palette.length);
        style.palette.slice(0, 8).forEach((color, index) => paletteBuffer.set(color3(color), index * 3));
        particles.clearTrails();
      }
      function requireStyle() {
        const style = FIREWORKS_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
        if (!style) throw new Error(`Unknown Fireworks style: ${styleId}`); return style;
      }
    },
  };

  function launchShell(targetX: number, targetY: number): void {
    const startX = targetX + (nextRandom() * 2 - 1) * viewportWidth * config.launchSpread, startY = viewportHeight + 18;
    const fuse = config.shellFuse * (0.88 + nextRandom() * 0.24);
    const [vx, vy] = resolveFireworkLaunchVelocity(startX, startY, targetX, targetY, fuse, config.gravity, config.launchPower);
    const paletteSeed = nextRandom() * 10_000, pattern = fireworksPatternCode(autonomousPreview ? randomPattern() : config.burstPattern);
    shells.push({ x: startX, y: startY, vx, vy, age: 0, fuse, paletteSeed, pattern });
    commands.push({ archetypeId: 'shell', x: startX, y: startY, vx, vy, count: 1, power: config.launchPower, life: fuse, lifeVariation: 0, seed: nextRandom() * 10_000, paletteSeed, pattern });
  }
  function updateShells(dt: number): void {
    for (let index = shells.length - 1; index >= 0; index -= 1) {
      const shell = shells[index]; if (!shell) continue; shell.age += dt; if (shell.age < shell.fuse) continue;
      const x = shell.x + shell.vx * shell.fuse, y = shell.y + shell.vy * shell.fuse + 0.5 * config.gravity * shell.fuse * shell.fuse;
      commands.push({ archetypeId: 'primary', x, y, vx: shell.vx * 0.18, vy: (shell.vy + config.gravity * shell.fuse) * 0.18, count: config.burstParticles, power: config.explosionPower, life: 2.4, lifeVariation: 0.28, seed: nextRandom() * 10_000, paletteSeed: shell.paletteSeed, pattern: shell.pattern });
      shells.splice(index, 1);
    }
  }
  function randomPattern(): FireworksBurstPattern {
    const patterns: readonly FireworksBurstPattern[] = ['peony', 'ring', 'chrysanthemum', 'willow', 'palm', 'spiral', 'crossette', 'comet'];
    return patterns[Math.floor(nextRandom() * patterns.length)] ?? 'peony';
  }
  function configRecord(): Readonly<Record<string, ExperienceSettingValue>> { return Object.freeze({ ...config }); }
  function nextRandom(): number { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 0x1_0000_0000; }
}

function validStyle(value: string | undefined): string | undefined { return value && FIREWORKS_STYLE_MANIFEST.styles.some((style) => style.id === value) ? value : undefined; }
function normalizeSeed(seed: number | undefined): number { const value = seed === undefined ? 940_711 : seed; if (!Number.isSafeInteger(value)) throw new Error('Fireworks seed must be a safe integer'); return (value >>> 0) || 940_711; }

export function resolveFireworkLaunchVelocity(startX: number, startY: number, targetX: number, targetY: number, fuse: number, gravity: number, launchPower: number): readonly [number, number] {
  if (![startX, startY, targetX, targetY, fuse, gravity, launchPower].every(Number.isFinite) || fuse <= 0 || launchPower < 0) throw new Error('Firework launch inputs must be finite with positive fuse and non-negative power');
  const powerScale = launchPower / FIREWORKS_DEFAULTS.launchPower;
  return Object.freeze([(targetX - startX) / fuse * powerScale, (targetY - startY - 0.5 * gravity * fuse * fuse) / fuse * powerScale]);
}
