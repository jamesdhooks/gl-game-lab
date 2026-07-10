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
  PHYSICS_2D_PLUGIN_ID,
  PhysicsWorld2D,
  PhysicsWorld2DService,
  type CircleBody,
} from '@hooksjam/gl-game-lab-physics-2d';
import {
  SpriteRenderQueueService,
  WEBGL2_RENDERER_PLUGIN_ID,
  WebGL2RendererService,
  createCircleSpriteTexture,
  createSpriteCamera2D,
  type ManagedSpriteTexture,
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
  let texture: ManagedSpriteTexture | undefined;
  let requestedConfig = config;
  let currentConfig = ballPitConfigForProfile(requestedConfig, launch.profile);
  let mode = validMode(launch.modeId) ?? 'single';
  let styleId = validStyleId(launch.styleId) ?? BALL_PIT_STYLE_MANIFEST.defaultStyleId;
  let spawnAccumulator = 0;
  let elapsedSeconds = 0;
  let randomState = normalizeSeed(launch.seed);
  const colorSeeds = new Map<number, number>();
  const radiusNoise = new Map<number, number>();
  const pickedBodyIds = new Set<number>();

  return {
    id: BALL_PIT_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [
      { id: WEBGL2_RENDERER_PLUGIN_ID },
      { id: PHYSICS_2D_PLUGIN_ID },
    ],
    install: (context) => {
      const physics = context.get(PhysicsWorld2DService);
      const renderer = context.get(WebGL2RendererService);
      const sprites = context.get(SpriteRenderQueueService);
      const input = context.get(EngineInput);
      texture = createCircleSpriteTexture(renderer.device, 'ball-pit.circle');
      applyStyle(renderer, styleId);
      configurePhysics(physics, currentConfig);
      const controller: BallPitController = {
        get mode() { return mode; },
        get modeId() { return mode; },
        get styleId() { return styleId; },
        get settings() { return configRecord(requestedConfig); },
        get bodyCount() { return physics.bodyCount; },
        get entityCount() { return physics.bodyCount; },
        setMode: (nextModeId) => {
          const nextMode = validMode(nextModeId);
          if (!nextMode) throw new Error(`Unknown Ball Pit mode: ${nextModeId}`);
          mode = nextMode;
          spawnAccumulator = 0;
          pickedBodyIds.clear();
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
          for (const body of physics.values()) {
            body.radius = currentConfig.radius * (1 + (radiusNoise.get(body.id) ?? 0) * currentConfig.radiusVariation);
            body.friction = currentConfig.friction;
            body.restitution = currentConfig.wallBounce ? currentConfig.wallBounceAmount : 0;
          }
          if (physics.bodyCount > currentConfig.maxParticles) {
            for (const body of physics.values().slice(currentConfig.maxParticles)) {
              physics.remove(body);
              colorSeeds.delete(body.id);
              radiusNoise.delete(body.id);
            }
          }
          configurePhysics(physics, currentConfig);
        },
        reset: () => {
          physics.clear();
          colorSeeds.clear();
          radiusNoise.clear();
          pickedBodyIds.clear();
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
          const activeCamera = sprites.activeCamera;
          const width = activeCamera.viewportWidth;
          const height = activeCamera.viewportHeight;
          if (activeCamera.centerX !== width * 0.5 || activeCamera.centerY !== height * 0.5) {
            sprites.setCamera(createSpriteCamera2D(width, height, { centerX: width * 0.5, centerY: height * 0.5 }));
          }
          physics.setBounds({ left: 0, top: 0, right: width, bottom: height });
          const pointerEvents = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          if (mode === 'single') {
            for (const event of pointerEvents) if (event.phase === 'down') spawnBall(physics, colorSeeds, radiusNoise, currentConfig, event.x, event.y, nextRandom);
          } else if (mode === 'stream') {
            const pointers = input.snapshot.pointers;
            if (pointers.length === 0) spawnAccumulator = 0;
            else spawnAccumulator += time.deltaSeconds * currentConfig.spawnRate;
            for (const pointer of pointers) {
              while (spawnAccumulator >= 1) {
                spawnBall(physics, colorSeeds, radiusNoise, currentConfig, pointer.x, pointer.y, nextRandom);
                spawnAccumulator -= 1;
              }
            }
          } else if (mode === 'interact') {
            for (const event of pointerEvents) {
              if (event.phase === 'down') pickBodies(physics.values(), pickedBodyIds, event.x, event.y, currentConfig.interactionRadius);
              if (event.phase === 'up' || event.phase === 'cancel') pickedBodyIds.clear();
            }
            const pointer = input.snapshot.pointers[0];
            if (pointer) dragPickedBodies(physics.values(), pickedBodyIds, pointer.x, pointer.y, time.deltaSeconds);
          } else {
            for (const event of pointerEvents) if (event.phase === 'down') explodeBodies(physics.values(), event.x, event.y, currentConfig.radius, currentConfig.burstCount);
          }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0) {
            const spawnRate = launch.profile === 'preview' ? 14 : currentConfig.spawnRate;
            spawnAccumulator += time.deltaSeconds * spawnRate;
            const spawnX = width * 0.5 + Math.sin(elapsedSeconds * 1.1) * width * 0.25;
            const spawnY = -Math.max(currentConfig.radius * 5, 18);
            while (spawnAccumulator >= 1) {
              spawnBall(physics, colorSeeds, radiusNoise, currentConfig, spawnX, spawnY, nextRandom);
              spawnAccumulator -= 1;
            }
          }
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.drag',
        stage: 'postFixed',
        run: ({ time }) => {
          const damping = Math.pow(currentConfig.airDrag * currentConfig.solverDamping, time.deltaSeconds * 60);
          for (const body of physics.values()) {
            body.velocityX *= damping;
            body.velocityY *= damping;
          }
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.render',
        stage: 'update',
        after: ['gl-game-lab.games.ball-pit.input'],
        run: () => {
          if (!texture) return;
          const style = requireStyle(styleId);
          for (const body of physics.values()) {
            const colorIndex = (colorSeeds.get(body.id) ?? 0) % style.palette.length;
            sprites.submit({
              texture,
              x: body.x,
              y: body.y,
              width: body.radius * 2,
              height: body.radius * 2,
              tint: rgbHexToRgba(style.palette[colorIndex] ?? style.palette[0] ?? 0xffffff),
              zIndex: body.id,
            });
          }
        },
      });
    },
    dispose: () => {
      texture?.resource.dispose();
      texture = undefined;
      colorSeeds.clear();
      radiusNoise.clear();
      pickedBodyIds.clear();
    },
  };

  function nextRandom(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x1_0000_0000;
  }
}

function spawnBall(
  physics: PhysicsWorld2D,
  colorSeeds: Map<number, number>,
  radiusNoise: Map<number, number>,
  config: BallPitConfig,
  x: number,
  y: number,
  random: () => number,
): void {
  if (physics.bodyCount >= config.maxParticles) return;
  const noise = random() * 2 - 1;
  const radius = config.radius * (1 + noise * config.radiusVariation);
  const body = physics.createCircle({
    x,
    y,
    radius,
    velocityX: (random() - 0.5) * 80,
    velocityY: (random() - 0.5) * 40,
    restitution: config.wallBounce ? config.wallBounceAmount : 0,
    friction: config.friction,
  });
  colorSeeds.set(body.id, Math.floor(random() * 0x1_0000_0000));
  radiusNoise.set(body.id, noise);
}

function pickBodies(bodies: readonly CircleBody[], picked: Set<number>, x: number, y: number, radius: number): void {
  picked.clear();
  for (const body of bodies) {
    if (Math.hypot(x - body.x, y - body.y) <= radius) picked.add(body.id);
  }
}

function dragPickedBodies(
  bodies: readonly CircleBody[],
  picked: ReadonlySet<number>,
  x: number,
  y: number,
  deltaSeconds: number,
): void {
  const strength = Math.min(1, deltaSeconds * 18);
  for (const body of bodies) {
    if (!picked.has(body.id)) continue;
    body.velocityX += (x - body.x) * strength;
    body.velocityY += (y - body.y) * strength;
    body.velocityX *= 0.84;
    body.velocityY *= 0.84;
  }
}

function explodeBodies(bodies: readonly CircleBody[], x: number, y: number, radius: number, force: number): void {
  const blastRadius = Math.max(80, radius * 42);
  const strength = force * 0.12;
  for (const body of bodies) {
    const dx = body.x - x;
    const dy = body.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance <= blastRadius && distance > 0) {
      const falloff = 1 - distance / blastRadius;
      const impulse = strength * falloff * falloff;
      body.velocityX += dx / distance * impulse;
      body.velocityY += dy / distance * impulse;
    }
  }
}

function configurePhysics(physics: PhysicsWorld2D, config: BallPitConfig): void {
  physics.configure({
    gravityY: config.gravity,
    solverIterations: Math.max(1, Math.floor(config.solverPasses)),
    substeps: Math.max(1, Math.floor(config.substeps)),
    boundaryRestitution: config.wallBounce ? config.wallBounceAmount : 0,
    collisionSoftness: config.collisionSoftness,
    maxPairPush: config.maxPairPush,
    impactBounceThreshold: config.impactBounceThreshold,
    openTop: true,
  });
}

function applyStyle(renderer: { setClearColor(color: readonly [number, number, number, number]): void }, styleId: string): void {
  renderer.setClearColor(rgbHexToRgba(requireStyle(styleId).background));
}

function requireStyle(styleId: string) {
  const style = BALL_PIT_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
  if (!style) throw new Error(`Unknown Ball Pit style: ${styleId}`);
  return style;
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
