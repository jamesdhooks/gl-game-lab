import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineInput, EngineSchedule } from '@hooksjam/gl-game-lab-engine';
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
import { BALL_PIT_DEFAULTS, type BallPitConfig, type BallPitMode } from './config.js';

const PALETTE = [
  [0.545, 0.361, 0.965, 1],
  [0.133, 0.827, 0.933, 1],
  [1, 0.42, 0.616, 1],
  [0.29, 0.871, 0.502, 1],
  [0.984, 0.573, 0.235, 1],
] as const;

export interface BallPitController {
  readonly mode: BallPitMode;
  readonly bodyCount: number;
  setMode(mode: BallPitMode): void;
  reset(): void;
}

export const BallPitControllerService = createExtensionToken<BallPitController>('gl-game-lab.games.ball-pit.controller');
export const BALL_PIT_PLUGIN_ID = 'gl-game-lab.games.ball-pit';

export function createBallPitPlugin(config: BallPitConfig = BALL_PIT_DEFAULTS): EnginePlugin {
  let texture: ManagedSpriteTexture | undefined;
  let mode: BallPitMode = 'single';
  let needsSeed = true;
  let spawnAccumulator = 0;
  let randomState = 0x51f15e;
  const colors = new Map<number, readonly [number, number, number, number]>();

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
      const controller: BallPitController = {
        get mode() { return mode; },
        get bodyCount() { return physics.bodyCount; },
        setMode: (nextMode) => { mode = nextMode; },
        reset: () => {
          physics.clear();
          colors.clear();
          needsSeed = true;
          spawnAccumulator = 0;
          randomState = 0x51f15e;
        },
      };
      context.provide(BallPitControllerService, controller);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.input',
        stage: 'update',
        run: ({ time }) => {
          const activeCamera = sprites.activeCamera;
          const width = activeCamera.viewportWidth;
          const height = activeCamera.viewportHeight;
          if (activeCamera.centerX !== width * 0.5 || activeCamera.centerY !== height * 0.5) {
            sprites.setCamera(createSpriteCamera2D(width, height, { centerX: width * 0.5, centerY: height * 0.5 }));
          }
          physics.setBounds({ left: 0, top: 0, right: width, bottom: height });
          if (needsSeed) {
            seedPit(physics, colors, config, width, height, nextRandom);
            needsSeed = false;
          }
          const pointerEvents = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          if (mode === 'single') {
            for (const event of pointerEvents) if (event.phase === 'down') spawnBall(physics, colors, config, event.x, event.y, nextRandom);
          } else if (mode === 'stream') {
            const pointers = input.snapshot.pointers;
            if (pointers.length === 0) spawnAccumulator = 0;
            else spawnAccumulator += time.deltaSeconds * config.spawnRate;
            for (const pointer of pointers) {
              while (spawnAccumulator >= 1) {
                spawnBall(physics, colors, config, pointer.x, pointer.y, nextRandom);
                spawnAccumulator -= 1;
              }
            }
          } else if (mode === 'interact') {
            for (const pointer of input.snapshot.pointers) pullBodies(physics.values(), pointer.x, pointer.y, config.interactionRadius);
          } else {
            for (const event of pointerEvents) if (event.phase === 'down') explodeBodies(physics.values(), event.x, event.y, config.interactionRadius, config.burstCount);
          }
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.games.ball-pit.drag',
        stage: 'postFixed',
        run: ({ time }) => {
          const damping = Math.pow(config.airDrag * config.solverDamping, time.deltaSeconds * 60);
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
          for (const body of physics.values()) {
            sprites.submit({
              texture,
              x: body.x,
              y: body.y,
              width: body.radius * 2,
              height: body.radius * 2,
              tint: colors.get(body.id) ?? PALETTE[0],
              zIndex: body.id,
            });
          }
        },
      });
    },
    dispose: () => {
      texture?.resource.dispose();
      texture = undefined;
      colors.clear();
    },
  };

  function nextRandom(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0x1_0000_0000;
  }
}

function seedPit(
  physics: PhysicsWorld2D,
  colors: Map<number, readonly [number, number, number, number]>,
  config: BallPitConfig,
  width: number,
  height: number,
  random: () => number,
): void {
  const initialCount = Math.min(180, config.maxParticles);
  for (let index = 0; index < initialCount; index += 1) {
    spawnBall(
      physics,
      colors,
      config,
      config.radius + random() * Math.max(1, width - config.radius * 2),
      height * 0.15 + random() * height * 0.45,
      random,
    );
  }
}

function spawnBall(
  physics: PhysicsWorld2D,
  colors: Map<number, readonly [number, number, number, number]>,
  config: BallPitConfig,
  x: number,
  y: number,
  random: () => number,
): void {
  if (physics.bodyCount >= config.maxParticles) return;
  const radius = config.radius * (1 + (random() * 2 - 1) * config.radiusVariation);
  const body = physics.createCircle({
    x,
    y,
    radius,
    velocityX: (random() - 0.5) * 80,
    velocityY: (random() - 0.5) * 40,
    restitution: config.wallBounce ? config.wallBounceAmount : 0.08,
    friction: Math.min(1, config.friction),
  });
  colors.set(body.id, PALETTE[Math.floor(random() * PALETTE.length)] ?? PALETTE[0]);
}

function pullBodies(bodies: readonly CircleBody[], x: number, y: number, radius: number): void {
  for (const body of bodies) {
    const dx = x - body.x;
    const dy = y - body.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius && distance > 0) {
      const strength = (1 - distance / radius) * 35;
      body.velocityX += dx / distance * strength;
      body.velocityY += dy / distance * strength;
    }
  }
}

function explodeBodies(bodies: readonly CircleBody[], x: number, y: number, radius: number, force: number): void {
  const blastRadius = radius * 2;
  for (const body of bodies) {
    const dx = body.x - x;
    const dy = body.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance <= blastRadius && distance > 0) {
      const impulse = (1 - distance / blastRadius) * force / 100;
      body.velocityX += dx / distance * impulse;
      body.velocityY += dy / distance * impulse;
    }
  }
}
