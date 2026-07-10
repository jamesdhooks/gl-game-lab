import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineInput,
  EngineSchedule,
  ExperienceRuntimeControllerService,
  type ExperienceLaunchOptions,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
} from '@hooksjam/gl-game-lab-engine';
import {
  DENSE_CIRCLE_PARTICLE_PLUGIN_ID,
  DenseCircleParticleWorld2D,
  DenseCircleParticleWorld2DService,
} from '@hooksjam/gl-game-lab-physics-2d';
import {
  ParticlePointRenderQueueService,
  WEBGL2_RENDERER_PLUGIN_ID,
  WebGL2RendererService,
  createSpriteCamera2D,
} from '@hooksjam/gl-game-lab-render-webgl2';
import {
  BALL_PIT_DEFAULTS,
  ballPitConfigForProfile,
  createBallPitConfig,
  type BallPitConfig,
  type BallPitMode,
} from './config.js';
import { BALL_PIT_STYLE_MANIFEST, rgbHexToRgba } from './styles.js';

const BALL_PIT_MODES: readonly BallPitMode[] = ['single', 'stream', 'interact', 'explosion'];
const MAX_PICKED_PARTICLES = 262_144;
const renderPalettes = new Map(BALL_PIT_STYLE_MANIFEST.styles.map((style) => [
  style.id,
  Object.freeze(style.palette.map(rgbHexToRgba)),
]));

export interface BallPitController extends ExperienceRuntimeController {
  readonly mode: BallPitMode;
  readonly bodyCount: number;
}

export const BallPitControllerService = createExtensionToken<BallPitController>('gl-game-lab.games.ball-pit.controller');
export const BALL_PIT_PLUGIN_ID = 'gl-game-lab.games.ball-pit';

export function createBallPitPlugin(
  config: BallPitConfig = BALL_PIT_DEFAULTS,
  launch: ExperienceLaunchOptions = {},
): EnginePlugin {
  let requestedConfig = config;
  let currentConfig = ballPitConfigForProfile(requestedConfig, launch.profile);
  let mode = validMode(launch.modeId) ?? 'single';
  let styleId = validStyleId(launch.styleId) ?? BALL_PIT_STYLE_MANIFEST.defaultStyleId;
  let spawnAccumulator = 0;
  let elapsedSeconds = 0;
  let randomState = normalizeSeed(launch.seed);
  let pickedCount = 0;
  const pickedIndices = new Int32Array(MAX_PICKED_PARTICLES);

  return {
    id: BALL_PIT_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [
      { id: WEBGL2_RENDERER_PLUGIN_ID },
      { id: DENSE_CIRCLE_PARTICLE_PLUGIN_ID },
    ],
    install: (context) => {
      const world = context.get(DenseCircleParticleWorld2DService);
      const renderer = context.get(WebGL2RendererService);
      const particles = context.get(ParticlePointRenderQueueService);
      const input = context.get(EngineInput);
      applyStyle(renderer, styleId);
      configureWorld(world, currentConfig);
      const controller: BallPitController = {
        get mode() { return mode; },
        get modeId() { return mode; },
        get styleId() { return styleId; },
        get settings() { return configRecord(requestedConfig); },
        get bodyCount() { return world.count; },
        get entityCount() { return world.count; },
        setMode: (nextModeId) => {
          const nextMode = validMode(nextModeId);
          if (!nextMode) throw new Error(`Unknown Ball Pit mode: ${nextModeId}`);
          mode = nextMode;
          spawnAccumulator = 0;
          pickedCount = 0;
        },
        setStyle: (nextStyleId) => {
          const nextStyle = validStyleId(nextStyleId);
          if (!nextStyle) throw new Error(`Unknown Ball Pit style: ${nextStyleId}`);
          styleId = nextStyle;
          applyStyle(renderer, styleId);
        },
        setSetting: (key, value) => {
          requestedConfig = createBallPitConfig({ ...configRecord(requestedConfig), [key]: value });
          currentConfig = ballPitConfigForProfile(requestedConfig, launch.profile);
          configureWorld(world, currentConfig);
        },
        reset: () => {
          world.clear(normalizeSeed(launch.seed));
          pickedCount = 0;
          spawnAccumulator = 0;
          elapsedSeconds = 0;
          randomState = normalizeSeed(launch.seed);
        },
      };
      context.provide(BallPitControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.input',
        stage: 'update',
        run: ({ time }) => {
          elapsedSeconds += time.deltaSeconds;
          const activeCamera = renderer.sprites.activeCamera;
          const width = activeCamera.viewportWidth;
          const height = activeCamera.viewportHeight;
          if (activeCamera.centerX !== width * 0.5 || activeCamera.centerY !== height * 0.5) {
            renderer.sprites.setCamera(createSpriteCamera2D(width, height, { centerX: width * 0.5, centerY: height * 0.5 }));
          }
          const floorDropped = demoFloorIsDropped(launch.profile, elapsedSeconds);
          const floorHeight = floorDropped ? height + Math.max(180, height * 1.4) : height;
          world.setBounds(width, floorHeight);
          const pointerEvents = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          routeInput(world, pointerEvents, input.snapshot.pointers, time.deltaSeconds);
          routeAutomaticSpawn(world, input.snapshot.pointers.length, width, time.deltaSeconds, floorDropped);
          if (launch.profile === 'preview' || launch.profile === 'demo') {
            world.removeBelow(height + Math.max(currentConfig.radius * 18, height * 0.28, 96));
          }
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.render',
        stage: 'renderExtract',
        run: () => {
          particles.submit({
            id: 'ball-pit.particles',
            count: world.count,
            positions: world.positions,
            radii: world.radii,
            colorSeeds: world.colorSeeds,
            palette: requirePalette(styleId),
          });
        },
      });
    },
    dispose: () => {
      pickedCount = 0;
    },
  };

  function routeInput(
    world: DenseCircleParticleWorld2D,
    events: readonly PointerInputEvent[],
    pointers: readonly { readonly x: number; readonly y: number }[],
    deltaSeconds: number,
  ): void {
    if (mode === 'single') {
      for (const event of events) if (event.phase === 'down') spawnOne(world, event.x, event.y);
      return;
    }
    if (mode === 'stream') {
      if (pointers.length === 0) spawnAccumulator = 0;
      else spawnAccumulator += deltaSeconds * currentConfig.spawnRate;
      for (const pointer of pointers) {
        while (spawnAccumulator >= 1) {
          spawnOne(world, pointer.x, pointer.y);
          spawnAccumulator -= 1;
        }
      }
      return;
    }
    if (mode === 'interact') {
      for (const event of events) {
        if (event.phase === 'down') pickedCount = world.pickNearby(event.x, event.y, currentConfig.interactionRadius, pickedIndices);
        if (event.phase === 'up' || event.phase === 'cancel') pickedCount = 0;
      }
      const pointer = pointers[0];
      if (pointer) world.dragPicked(pickedIndices, pickedCount, pointer.x, pointer.y, deltaSeconds);
      return;
    }
    for (const event of events) {
      if (event.phase === 'down') {
        world.applyExplosion(event.x, event.y, Math.max(80, currentConfig.radius * 42), currentConfig.burstCount * 0.12);
      }
    }
  }

  function routeAutomaticSpawn(
    world: DenseCircleParticleWorld2D,
    pointerCount: number,
    width: number,
    deltaSeconds: number,
    floorDropped: boolean,
  ): void {
    if ((launch.profile !== 'preview' && launch.profile !== 'demo') || pointerCount > 0 || floorDropped) return;
    const spawnRate = launch.profile === 'preview' ? 14 : currentConfig.spawnRate;
    spawnAccumulator += deltaSeconds * spawnRate;
    const spawnX = width * 0.5 + Math.sin(elapsedSeconds * 1.1) * width * 0.25;
    const spawnY = -Math.max(currentConfig.radius * 5, 18);
    while (spawnAccumulator >= 1) {
      spawnOne(world, spawnX, spawnY);
      spawnAccumulator -= 1;
    }
  }

  function spawnOne(world: DenseCircleParticleWorld2D, x: number, y: number): void {
    const noise = nextRandom() * 2 - 1;
    world.addCircle(x, y, {
      radiusNoise: noise,
      velocityX: (nextRandom() - 0.5) * 80,
      velocityY: (nextRandom() - 0.5) * 40,
      colorSeed: Math.floor(nextRandom() * 0x1_0000),
    });
  }

  function nextRandom(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x1_0000_0000;
  }
}

function configureWorld(world: DenseCircleParticleWorld2D, config: BallPitConfig): void {
  world.configure({
    maxParticles: config.maxParticles,
    radius: config.radius,
    radiusVariation: config.radiusVariation,
    gravity: config.gravity,
    solverIterations: Math.max(1, Math.floor(config.solverPasses)),
    substeps: Math.max(1, Math.floor(config.substeps)),
    wallBounce: config.wallBounce,
    boundaryRestitution: config.wallBounceAmount,
    airDrag: config.airDrag,
    solverDamping: config.solverDamping,
    collisionSoftness: config.collisionSoftness,
    maxPairPush: config.maxPairPush,
    impactBounceThreshold: config.impactBounceThreshold,
    contactFriction: config.friction,
    openTop: true,
  });
}

function applyStyle(renderer: {
  setClearColor(color: readonly [number, number, number, number]): void;
  setBloom(options: { readonly enabled: boolean; readonly threshold?: number; readonly intensity?: number; readonly radius?: number; readonly iterations?: number }): void;
  setPaletteBackdrop(options: { readonly base: readonly [number, number, number, number]; readonly palette: readonly (readonly [number, number, number, number])[]; readonly tier?: number; readonly blendStrength?: number } | undefined): void;
}, styleId: string): void {
  const style = BALL_PIT_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
  if (!style) throw new Error(`Unknown Ball Pit style: ${styleId}`);
  const background = rgbHexToRgba(style.background);
  const palette = requirePalette(styleId);
  renderer.setClearColor(background);
  renderer.setPaletteBackdrop({ base: background, palette, tier: 0.55, blendStrength: 0.12 });
  renderer.setBloom(styleId === 'neon'
    ? { enabled: true, threshold: 0.48, intensity: 1.15, radius: 1.15, iterations: 4 }
    : { enabled: false });
}

function requirePalette(styleId: string): readonly (readonly [number, number, number, number])[] {
  const palette = renderPalettes.get(styleId);
  if (!palette) throw new Error(`Unknown Ball Pit style: ${styleId}`);
  return palette;
}

function validStyleId(value: string | undefined): string | undefined {
  return value && BALL_PIT_STYLE_MANIFEST.styles.some((style) => style.id === value) ? value : undefined;
}

function validMode(value: string | undefined): BallPitMode | undefined {
  return BALL_PIT_MODES.find((mode) => mode === value);
}

function configRecord(config: BallPitConfig): Readonly<Record<string, ExperienceSettingValue>> {
  return Object.freeze({ ...config });
}

function normalizeSeed(seed: number | undefined): number {
  if (seed === undefined) return 0x51f15e;
  if (!Number.isSafeInteger(seed)) throw new Error('Ball Pit seed must be a safe integer');
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x51f15e : normalized;
}

function demoFloorIsDropped(profile: ExperienceLaunchOptions['profile'], elapsedSeconds: number): boolean {
  if (profile !== 'preview' && profile !== 'demo') return false;
  const cycleSeconds = profile === 'preview' ? 7 : 10;
  const dropSeconds = profile === 'preview' ? 1.5 : 2;
  return elapsedSeconds % cycleSeconds >= cycleSeconds - dropSeconds;
}
