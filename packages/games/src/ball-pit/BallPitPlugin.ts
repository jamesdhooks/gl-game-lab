import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  applyPaletteGradientBackdrop2D,
  EngineInput,
  InteractionRadiusIndicator2D,
  EngineQuality,
  EngineRender2D,
  EngineRenderer,
  EngineSchedule,
  ExperiencePreviewCycleControllerService,
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
  BALL_PIT_DEFAULTS,
  ballPitConfigForProfile,
  ballPitConfigForQuality,
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
  let profileConfig = ballPitConfigForProfile(requestedConfig, launch.profile);
  let currentConfig = profileConfig;
  let appliedTier: 'desktop' | 'mobile' = 'desktop';
  let mode = validMode(launch.modeId) ?? 'single';
  let styleId = validStyleId(launch.styleId) ?? BALL_PIT_STYLE_MANIFEST.defaultStyleId;
  let spawnAccumulator = 0;
  let elapsedSeconds = 0;
  let previewFloorDropRemaining = 0;
  let floorDroppedLastFrame = false;
  let randomState = normalizeSeed(launch.seed);
  let pickedCount = 0;
  const pickedIndices = new Int32Array(MAX_PICKED_PARTICLES);
  const interactionIndicator = new InteractionRadiusIndicator2D('ball-pit.interaction-radius');

  return {
    id: BALL_PIT_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [
      { id: DENSE_CIRCLE_PARTICLE_PLUGIN_ID },
    ],
    install: (context) => {
      const world = context.get(DenseCircleParticleWorld2DService);
      const renderer = context.get(EngineRender2D);
      const renderBackend = context.get(EngineRenderer);
      const input = context.get(EngineInput);
      const quality = context.get(EngineQuality);
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
          profileConfig = ballPitConfigForProfile(requestedConfig, launch.profile);
          applyQuality(true);
        },
        reset: () => {
          world.clear(normalizeSeed(launch.seed));
          renderBackend.requestRender();
          pickedCount = 0;
          spawnAccumulator = 0;
          elapsedSeconds = 0;
          previewFloorDropRemaining = 0;
          floorDroppedLastFrame = false;
          randomState = normalizeSeed(launch.seed);
        },
      };
      context.provide(BallPitControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
      context.provide(ExperiencePreviewCycleControllerService, {
        advancePreviewCycle: () => {
          if (launch.profile !== 'preview') return 'restart';
          previewFloorDropRemaining = 1.5;
          return 'handled';
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.input',
        stage: 'update',
        run: ({ time }) => {
          applyQuality(false);
          elapsedSeconds += time.deltaSeconds;
          previewFloorDropRemaining = Math.max(0, previewFloorDropRemaining - time.deltaSeconds);
          const width = renderer.viewport.width;
          const height = renderer.viewport.height;
          renderer.setCamera({ centerX: width * 0.5, centerY: height * 0.5, zoom: 1 });
          const floorDropped = launch.profile === 'preview'
            ? previewFloorDropRemaining > 0
            : demoFloorIsDropped(launch.profile, elapsedSeconds);
          if (floorDropped && !floorDroppedLastFrame) {
            world.clear();
            renderBackend.requestRender();
            pickedCount = 0;
            spawnAccumulator = 0;
          }
          floorDroppedLastFrame = floorDropped;
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
      function applyQuality(force: boolean): void {
        if (!force && appliedTier === quality.tier) return;
        appliedTier = quality.tier;
        currentConfig = ballPitConfigForQuality(profileConfig, appliedTier, launch.profile);
        configureWorld(world, currentConfig);
      }
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.render',
        stage: 'renderExtract',
        run: () => {
          renderer.submitParticles({
            id: 'ball-pit.particles',
            count: world.count,
            positions: world.positions,
            radii: world.radii,
            colorSeeds: world.colorSeeds,
            palette: requirePalette(styleId),
          });
          if (mode === 'interact') {
            interactionIndicator.submit(renderer, input.snapshot.pointers, currentConfig.interactionRadius);
          }
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
    const spawnY = -Math.max(currentConfig.radius * 5, 18) + Math.sin(elapsedSeconds * 1.7) * currentConfig.radius;
    while (spawnAccumulator >= 1) {
      spawnOne(world, spawnX, spawnY);
      spawnAccumulator -= 1;
    }
  }

  function spawnOne(world: DenseCircleParticleWorld2D, x: number, y: number): void {
    const noise = nextRandom() * 2 - 1;
    const spread = currentConfig.radius * 2.8;
    const offsetX = (nextRandom() * 2 - 1) * spread;
    const offsetY = (nextRandom() * 2 - 1) * spread;
    const colorSeed = nextRandom() * 10_000;
    const velocityX = nextRandom() * 180 - 90;
    const velocityY = nextRandom() * 140 - 60;
    world.addCircle(
      x + offsetX,
      y + offsetY,
      {
        radiusNoise: noise,
        velocityX,
        velocityY,
        colorSeed,
      },
    );
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
    wallBounce: true,
    boundaryRestitution: config.wallBounceAmount,
    particleRestitution: config.wallBounceAmount,
    velocityContactResponse: true,
    airDrag: config.airDrag,
    solverDamping: config.solverDamping,
    collisionSoftness: config.collisionSoftness,
    maxPairPush: config.maxPairPush,
    impactBounceThreshold: config.impactBounceThreshold,
    contactFriction: config.friction,
    openTop: true,
  });
}

function applyStyle(renderer: import('@hooksjam/gl-game-lab-engine').Render2DService, styleId: string): void {
  const style = BALL_PIT_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
  if (!style) throw new Error(`Unknown Ball Pit style: ${styleId}`);
  applyPaletteGradientBackdrop2D(renderer, style);
  renderer.setBloom({ enabled: false });
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
  if (profile !== 'demo') return false;
  const cycleSeconds = 10;
  const dropSeconds = 2;
  return elapsedSeconds % cycleSeconds >= cycleSeconds - dropSeconds;
}
