import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuParticleSystem2D } from '@hooksjam/gl-game-lab-engine';
import { createFireworksConfig, FIREWORKS_DEFAULTS, type FireworksConfig } from './config.js';
import { FIREWORKS_POINT_FRAGMENT_SHADER, FIREWORKS_POINT_VERTEX_SHADER, FIREWORKS_STEP_SHADER } from './shaders.js';
import { color3, FIREWORKS_STYLE_MANIFEST } from './styles.js';

export type FireworksMode = 'single' | 'stream';
interface SpawnCommand { x: number; y: number; vx: number; vy: number; kind: number; count: number; power: number; life: number; seed: number; paletteSeed: number }
interface ShellActor { x: number; y: number; vx: number; vy: number; age: number; fuse: number; generation: number; paletteSeed: number }
interface DelayedBurst { x: number; y: number; delay: number; generation: number; paletteSeed: number }

export interface FireworksController extends ExperienceRuntimeController { readonly mode: FireworksMode; readonly activeShells: number; readonly particleCapacity: number }
export const FireworksControllerService = createExtensionToken<FireworksController>('gl-game-lab.simulations.fireworks.controller');
export const FIREWORKS_PLUGIN_ID = 'gl-game-lab.simulations.fireworks';

export function createFireworksPlugin(initial: FireworksConfig = FIREWORKS_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial;
  let mode: FireworksMode = launch.modeId === 'stream' ? 'stream' : 'single';
  let styleId = validStyle(launch.styleId) ?? FIREWORKS_STYLE_MANIFEST.defaultStyleId;
  let elapsed = 0;
  let pendingDt = 0;
  let launchAccumulator = 0;
  let cursor = 0;
  let randomState = normalizeSeed(launch.seed);
  let rebuildState = false;
  let viewportWidth = 1280;
  let viewportHeight = 720;
  let cleanupResources = (): void => undefined;
  const commands: SpawnCommand[] = [];
  const shells: ShellActor[] = [];
  const delayed: DelayedBurst[] = [];

  return {
    id: FIREWORKS_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      const renderer = context.get(EngineRender2D);
      const gpu = context.get(EngineGpu2D);
      const input = context.get(EngineInput);
      let particles = createParticles(), observedGeneration = particles.generation;
      cleanupResources = () => { particles.dispose(); };
      applyStyle();

      const controller: FireworksController = {
        get mode() { return mode; }, get modeId() { return mode; }, get styleId() { return styleId; },
        get settings() { return Object.freeze({ ...config }); }, get activeShells() { return shells.length; },
        get particleCapacity() { return particles.capacity; }, get entityCount() { return particles.capacity; },
        setMode: (value) => { if (value !== 'single' && value !== 'stream') throw new Error(`Unknown Fireworks mode: ${value}`); mode = value; launchAccumulator = 0; },
        setStyle: (value) => { const next = validStyle(value); if (!next) throw new Error(`Unknown Fireworks style: ${value}`); styleId = next; applyStyle(); },
        setSetting: (key, value) => {
          const previousSize = config.rawParticleTextureSize;
          config = createFireworksConfig({ ...configRecord(), [key]: value });
          rebuildState ||= previousSize !== config.rawParticleTextureSize;
        },
        reset: resetSimulation,
      };
      context.provide(FireworksControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);

      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fireworks.update', stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          viewportWidth = renderer.viewport.width;
          viewportHeight = renderer.viewport.height;
          elapsed += dt; pendingDt += dt;
          updateShells(dt); updateDelayed(dt);
          const pointerEvents = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          for (const event of pointerEvents) if (event.phase === 'down') launchShell(event.x, event.y);
          if (mode === 'stream' && input.snapshot.pointers.length > 0) {
            launchAccumulator += dt * config.autoFinaleRate;
            const pointer = input.snapshot.pointers[0];
            while (pointer && launchAccumulator >= 1) { launchShell(pointer.x, pointer.y); launchAccumulator -= 1; }
          } else if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0) {
            launchAccumulator += dt * (launch.profile === 'preview' ? 0.75 : 1.25);
            while (launchAccumulator >= 1) { launchShell(renderer.viewport.width * (0.2 + nextRandom() * 0.6), renderer.viewport.height * (0.15 + nextRandom() * 0.38)); launchAccumulator -= 1; }
          }
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.fireworks.render', stage: 'renderExtract',
        run: () => {
          gpu.submit('fireworks.gpu-show', (destination) => {
            if (particles.generation !== observedGeneration) { observedGeneration = particles.generation; resetCpuState(); }
            if (rebuildState) { particles.dispose(); particles = createParticles(); observedGeneration = particles.generation; cursor = 0; rebuildState = false; particles.clearTrails(); }
            const dt = pendingDt; pendingDt = 0;
            if (commands.length === 0) runStep(dt);
            else {
              const queued = commands.splice(0, 12);
              queued.forEach((command, index) => runStep(index === 0 ? dt : 0, command));
            }
            const trailDestination = particles.beginTrails(destination.width, destination.height, config.trailFade);
            const palette = paletteData();
            particles.render(trailDestination, (contextGl, uniform) => {
              contextGl.uniform2f(uniform('uCanvasSize'), destination.width, destination.height);
              contextGl.uniform1f(uniform('uParticleSize'), config.particleSize * Math.max(1, destination.width / Math.max(1, renderer.viewport.width)));
              contextGl.uniform1f(uniform('uSizeVariability'), config.sparkSizeVariability);
              contextGl.uniform1f(uniform('uCrackle'), config.crackleIntensity);
              contextGl.uniform3fv(uniform('uPalette[0]'), palette.data);
              contextGl.uniform1i(uniform('uPaletteCount'), palette.count);
            });
            particles.compositeTrails(destination, color3(requireStyle().background), config.bloomStrength);
          });
        },
      });

      function runStep(dt: number, spawn?: SpawnCommand): void {
        const count = spawn ? Math.min(spawn.count, particles.capacity) : 0;
        const start = cursor;
        if (spawn) cursor = (cursor + count) % particles.capacity;
        particles.step((contextGl, uniform) => {
          contextGl.uniform1i(uniform('uCapacity'), particles.capacity);
          contextGl.uniform1f(uniform('uDt'), dt);
          contextGl.uniform1f(uniform('uGravity'), config.gravity);
          contextGl.uniform1f(uniform('uDamping'), config.airDrag);
          contextGl.uniform1f(uniform('uSpawnActive'), spawn ? 1 : 0);
          contextGl.uniform1i(uniform('uSpawnStart'), start);
          contextGl.uniform1i(uniform('uSpawnCount'), count);
          contextGl.uniform2f(uniform('uSpawnPosition'), spawn?.x ?? 0, spawn?.y ?? 0);
          contextGl.uniform2f(uniform('uSpawnVelocity'), spawn?.vx ?? 0, spawn?.vy ?? 0);
          contextGl.uniform1f(uniform('uSpawnKind'), spawn?.kind ?? 0);
          contextGl.uniform1f(uniform('uSpawnSeed'), spawn?.seed ?? 0);
          contextGl.uniform1f(uniform('uSpawnPaletteSeed'), spawn?.paletteSeed ?? 0);
          contextGl.uniform1f(uniform('uSpawnPower'), spawn?.power ?? 0);
          contextGl.uniform1f(uniform('uSpawnLife'), spawn?.life ?? 0);
          contextGl.uniform1f(uniform('uBurstChaos'), config.burstChaos);
        });
      }

      function resetSimulation(): void {
        particles.clear(); particles.clearTrails(); resetCpuState();
      }

      function resetCpuState(): void {
        commands.length = 0; shells.length = 0; delayed.length = 0;
        elapsed = 0; pendingDt = 0; launchAccumulator = 0; cursor = 0; randomState = normalizeSeed(launch.seed);
      }

      function createParticles(): GpuParticleSystem2D {
        const size = Number(config.rawParticleTextureSize);
        const profileSize = launch.profile === 'preview' ? Math.min(256, size) : size;
        return gpu.createParticleSystem(`${FIREWORKS_PLUGIN_ID}.particles`, {
          capacity: profileSize * profileSize,
          width: profileSize,
          height: profileSize,
          precision: 'float',
          simulationFragmentSource: FIREWORKS_STEP_SHADER,
          particleVertexSource: FIREWORKS_POINT_VERTEX_SHADER,
          particleFragmentSource: FIREWORKS_POINT_FRAGMENT_SHADER,
          blend: 'additive',
          trails: true,
        });
      }

      function applyStyle(): void {
        const background = color3(requireStyle().background);
        renderer.setClearColor([background[0], background[1], background[2], 1]);
        renderer.setBackdrop(undefined); renderer.setBloom({ enabled: false });
        particles.clearTrails();
      }

    },
    dispose: () => { cleanupResources(); commands.length = 0; shells.length = 0; delayed.length = 0; },
  };

  function launchShell(targetX: number, targetY: number): void {
    const startX = targetX + (nextRandom() * 2 - 1) * viewportWidth * config.launchSpread;
    const startY = viewportHeight + 18;
    const fuse = config.shellFuse * (0.88 + nextRandom() * 0.24);
    const vx = (targetX - startX) / fuse;
    const vy = (targetY - startY - 0.5 * config.gravity * fuse * fuse) / fuse;
    const paletteSeed = nextRandom() * 10_000;
    shells.push({ x: startX, y: startY, vx, vy, age: 0, fuse, generation: 0, paletteSeed });
    commands.push({ x: startX, y: startY, vx, vy, kind: 1, count: 1, power: config.launchPower, life: fuse, seed: nextRandom() * 10_000, paletteSeed });
  }

  function updateShells(dt: number): void {
    for (let index = shells.length - 1; index >= 0; index -= 1) {
      const shell = shells[index]; if (!shell) continue;
      shell.age += dt;
      if (shell.age < shell.fuse) continue;
      const x = shell.x + shell.vx * shell.age;
      const y = shell.y + shell.vy * shell.age + 0.5 * config.gravity * shell.age * shell.age;
      burst(x, y, shell.generation, shell.paletteSeed, shell.vx, shell.vy + config.gravity * shell.age);
      shells.splice(index, 1);
    }
  }

  function updateDelayed(dt: number): void {
    for (let index = delayed.length - 1; index >= 0; index -= 1) {
      const child = delayed[index]; if (!child) continue;
      child.delay -= dt;
      if (child.delay > 0) continue;
      burst(child.x, child.y, child.generation, child.paletteSeed, 0, 0);
      delayed.splice(index, 1);
    }
  }

  function burst(x: number, y: number, generation: number, paletteSeed: number, vx: number, vy: number): void {
    const scale = config.secondaryScale ** generation;
    commands.push({ x, y, vx: vx * 0.18, vy: vy * 0.18, kind: 2, count: Math.max(12, Math.round(config.burstParticles * scale)), power: config.explosionPower * scale, life: 2.4 * Math.max(0.45, scale), seed: nextRandom() * 10_000, paletteSeed });
    if (generation >= config.secondaryDepth || nextRandom() > config.secondaryChance) return;
    const children = 2 + Math.floor(nextRandom() * 3);
    for (let child = 0; child < children; child += 1) {
      const angle = nextRandom() * Math.PI * 2;
      const radius = config.explosionPower * 0.12 * scale;
      delayed.push({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius, delay: 0.28 + nextRandom() * 0.35, generation: generation + 1, paletteSeed: paletteSeed + child * 7.3 });
    }
  }

  function paletteData(): { data: Float32Array; count: number } {
    const palette = requireStyle().palette.slice(0, 8);
    const data = new Float32Array(24);
    palette.forEach((color, index) => data.set(color3(color), index * 3));
    return { data, count: palette.length };
  }

  function requireStyle() { const style = FIREWORKS_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId); if (!style) throw new Error(`Unknown Fireworks style: ${styleId}`); return style; }
  function configRecord(): Readonly<Record<string, ExperienceSettingValue>> { return Object.freeze({ ...config }); }
  function nextRandom(): number { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 0x1_0000_0000; }
}

function validStyle(value: string | undefined): string | undefined { return value && FIREWORKS_STYLE_MANIFEST.styles.some((style) => style.id === value) ? value : undefined; }
function normalizeSeed(seed: number | undefined): number { const value = seed === undefined ? 940_711 : seed; if (!Number.isSafeInteger(value)) throw new Error('Fireworks seed must be a safe integer'); return (value >>> 0) || 940_711; }
