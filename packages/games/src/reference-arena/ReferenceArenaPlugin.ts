import {
  ActionMap,
  NameComponent,
  TransformComponent,
  createComponentType,
  createExtensionToken,
  createTransform2D,
  type EnginePlugin,
  type Entity,
  type PrefabDefinition,
  type SceneDefinition,
} from '@hooksjam/gl-game-lab-core';
import {
  Camera2DComponent,
  EngineAccessibility,
  EngineAudio,
  EngineInput,
  EngineRender2D,
  EngineScenes,
  EngineSchedule,
  EngineStorage,
  EngineWorld,
  ExperienceRuntimeControllerService,
  Sprite2DComponent,
  SpriteAnimation2DComponent,
  Text2DComponent,
  createCamera2D,
  createSprite2D,
  createSpriteAnimation2D,
  createText2D,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
  type Render2DService,
  type Texture2DHandle,
} from '@hooksjam/gl-game-lab-engine';
import { PHYSICS_2D_PLUGIN_ID, PhysicsWorld2DService, type CircleBody, type PhysicsWorld2D } from '@hooksjam/gl-game-lab-physics-2d';

export const REFERENCE_ARENA_PLUGIN_ID = 'gl-game-lab.games.reference-arena';
const REFERENCE_ARENA_SCENE_ID = 'gl-game-lab.games.reference-arena.scene';
const IMPACT_AUDIO_ID = 'reference-arena.collect';
const HIGH_SCORE_KEY = 'reference-arena.high-score';

interface Collectible { value: number }
const CollectibleComponent = createComponentType<Collectible>('gl-game-lab.games.reference-arena.collectible');

export interface ReferenceArenaController extends ExperienceRuntimeController {
  readonly score: number;
  readonly highScore: number;
  readonly loaded: boolean;
}

export const ReferenceArenaControllerService = createExtensionToken<ReferenceArenaController>('gl-game-lab.games.reference-arena.controller');

const ACTION_DEFINITIONS = [
  { id: 'left', bindings: [{ kind: 'key', code: 'KeyA' }, { kind: 'key', code: 'ArrowLeft' }, { kind: 'gamepad-axis', axis: 0, direction: -1 }] },
  { id: 'right', bindings: [{ kind: 'key', code: 'KeyD' }, { kind: 'key', code: 'ArrowRight' }, { kind: 'gamepad-axis', axis: 0, direction: 1 }] },
  { id: 'up', bindings: [{ kind: 'key', code: 'KeyW' }, { kind: 'key', code: 'ArrowUp' }, { kind: 'gamepad-axis', axis: 1, direction: -1 }] },
  { id: 'down', bindings: [{ kind: 'key', code: 'KeyS' }, { kind: 'key', code: 'ArrowDown' }, { kind: 'gamepad-axis', axis: 1, direction: 1 }] },
  { id: 'dash', bindings: [{ kind: 'key', code: 'Space' }, { kind: 'gamepad-button', button: 0 }] },
] as const;

export function createReferenceArenaPlugin(): EnginePlugin {
  const actions = new ActionMap(ACTION_DEFINITIONS);
  let score = 0;
  let highScore = 0;
  let loaded = false;
  let audioReady = false;
  let playerEntity: Entity | undefined;
  let playerBody: CircleBody | undefined;
  let scoreLabel: Entity | undefined;
  let cameraEntity: Entity | undefined;
  const textures: Texture2DHandle[] = [];

  return {
    id: REFERENCE_ARENA_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: PHYSICS_2D_PLUGIN_ID }],
    install: (context) => {
      const world = context.get(EngineWorld);
      const scenes = context.get(EngineScenes);
      const schedule = context.get(EngineSchedule);
      const input = context.get(EngineInput);
      const renderer = context.get(EngineRender2D);
      const physics = context.get(PhysicsWorld2DService);
      const audio = context.get(EngineAudio);
      const storage = context.get(EngineStorage);
      const accessibility = context.get(EngineAccessibility);
      createTextures(renderer, textures);
      const scene = createArenaScene(physics, (entities) => {
        playerEntity = entities.player;
        playerBody = entities.body;
        scoreLabel = entities.scoreLabel;
        cameraEntity = entities.camera;
      });
      scenes.register(scene);

      const controller: ReferenceArenaController = {
        get modeId() { return 'play'; },
        get styleId() { return 'arena'; },
        get settings() { return Object.freeze({}); },
        get entityCount() { return [...world.entities()].length; },
        get score() { return score; },
        get highScore() { return highScore; },
        get loaded() { return loaded; },
        setMode: (value) => { if (value !== 'play') throw new Error(`Unknown Reference Arena mode: ${value}`); },
        setStyle: (value) => { if (value !== 'arena') throw new Error(`Unknown Reference Arena style: ${value}`); },
        setSetting: (key: string, _value: ExperienceSettingValue) => { throw new Error(`Unknown Reference Arena setting: ${key}`); },
        reset: () => { resetPlayer(); },
      };
      context.provide(ReferenceArenaControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);

      schedule.addSystem({
        id: 'gl-game-lab.games.reference-arena.gameplay',
        stage: 'update',
        access: { writes: ['engine.transform', 'engine.render-2d.text'] },
        run: ({ time }) => {
          if (!loaded || !playerEntity || !playerBody) return;
          const actionState = actions.update(input.snapshot);
          const horizontal = (actionState.right?.value ?? 0) - (actionState.left?.value ?? 0);
          const vertical = (actionState.down?.value ?? 0) - (actionState.up?.value ?? 0);
          const length = Math.hypot(horizontal, vertical) || 1;
          const acceleration = 760;
          playerBody.velocityX += horizontal / length * acceleration * time.deltaSeconds;
          playerBody.velocityY += vertical / length * acceleration * time.deltaSeconds;
          const damping = Math.exp(-4.5 * time.deltaSeconds);
          playerBody.velocityX *= damping;
          playerBody.velocityY *= damping;
          if (actionState.dash?.pressed) { playerBody.velocityX *= 2.2; playerBody.velocityY *= 2.2; }
          const transform = world.get(playerEntity, TransformComponent);
          transform.translation.x = playerBody.x;
          transform.translation.y = playerBody.y;
          if (cameraEntity) {
            const camera = world.get(cameraEntity, TransformComponent);
            camera.translation.x += (playerBody.x - camera.translation.x) * Math.min(1, time.deltaSeconds * 6);
            camera.translation.y += (playerBody.y - camera.translation.y) * Math.min(1, time.deltaSeconds * 6);
            if (scoreLabel) {
              const label = world.get(scoreLabel, TransformComponent);
              label.translation.x = camera.translation.x - 230;
              label.translation.y = camera.translation.y - 242;
            }
          }
          for (const { entity, components: [collectibleTransform, collectible] } of world.query(TransformComponent, CollectibleComponent)) {
            if (Math.hypot(collectibleTransform.translation.x - playerBody.x, collectibleTransform.translation.y - playerBody.y) > 26) continue;
            score += collectible.value;
            highScore = Math.max(highScore, score);
            relocateCollectible(collectibleTransform, entity.index + score);
            if (scoreLabel) world.get(scoreLabel, Text2DComponent).text = `SCORE ${score}  BEST ${highScore}`;
            accessibility.announce(`Score ${score}`);
            accessibility.setStatus(`Reference Arena score ${score}, best ${highScore}`);
            if (audioReady) { try { audio.play(IMPACT_AUDIO_ID, { volume: 0.18 }); } catch { audioReady = false; } }
            void storage.set(HIGH_SCORE_KEY, highScore).catch(() => undefined);
          }
        },
      });

      function resetPlayer(): void {
        score = 0;
        actions.reset();
        if (playerBody) { playerBody.x = 480; playerBody.y = 270; playerBody.velocityX = 0; playerBody.velocityY = 0; }
        if (scoreLabel) world.get(scoreLabel, Text2DComponent).text = `SCORE 0  BEST ${highScore}`;
      }
    },
    start: async (context) => {
      const storage = context.get(EngineStorage);
      const savedHighScore: unknown = await storage.get<number>(HIGH_SCORE_KEY);
      highScore = typeof savedHighScore === 'number' && Number.isFinite(savedHighScore) && savedHighScore >= 0 ? savedHighScore : 0;
      const audio = context.get(EngineAudio);
      try {
        await audio.load(IMPACT_AUDIO_ID, SILENT_WAV_DATA_URL);
        audioReady = true;
      } catch { audioReady = false; }
      await context.get(EngineScenes).load(REFERENCE_ARENA_SCENE_ID, { activate: true, exclusive: true });
      if (scoreLabel) context.get(EngineWorld).get(scoreLabel, Text2DComponent).text = `SCORE 0  BEST ${highScore}`;
      loaded = true;
      context.get(EngineAccessibility).setStatus(`Reference Arena score 0, best ${highScore}.`);
    },
    dispose: async (context) => {
      loaded = false;
      actions.reset();
      const scenes = context.get(EngineScenes);
      if (scenes.snapshot(REFERENCE_ARENA_SCENE_ID)) await scenes.unload(REFERENCE_ARENA_SCENE_ID);
      const renderer = context.get(EngineRender2D);
      for (const texture of textures.splice(0)) renderer.destroyTexture(texture);
      context.get(EngineAudio).unload(IMPACT_AUDIO_ID);
    },
  };
}

function createArenaScene(physics: PhysicsWorld2D, ready: (entities: { player: Entity; body: CircleBody; scoreLabel: Entity; camera: Entity }) => void): SceneDefinition {
  const collectiblePrefab: PrefabDefinition<{ readonly x: number; readonly y: number; readonly value: number }> = {
    id: 'gl-game-lab.games.reference-arena.collectible-prefab',
    name: 'Arena collectible',
    build: ({ world, root }, props) => {
      const transform = world.get(root, TransformComponent);
      transform.translation.x = props.x; transform.translation.y = props.y;
      world.insert(root, Sprite2DComponent, createSprite2D('reference-arena.collectible', 18, 18, { zIndex: 2 }));
      world.insert(root, CollectibleComponent, { value: props.value });
    },
  };
  return {
    id: REFERENCE_ARENA_SCENE_ID,
    name: 'Reference Arena',
    setup: (scene) => {
      physics.clear();
      physics.setBounds({ left: 0, top: 0, right: 960, bottom: 540 });
      scene.spawn([
        { type: NameComponent, value: 'Arena backdrop' },
        { type: TransformComponent, value: createTransform2D(480, 270, 0, 1, 1, -10) },
        { type: Sprite2DComponent, value: createSprite2D('reference-arena.backdrop', 960, 540, { zIndex: -10 }) },
      ]);
      const player = scene.spawn([
        { type: NameComponent, value: 'Player' },
        { type: TransformComponent, value: createTransform2D(480, 270) },
        { type: Sprite2DComponent, value: createSprite2D('reference-arena.player', 30, 30, { uv: [0, 0, 0.5, 1], zIndex: 5 }) },
        { type: SpriteAnimation2DComponent, value: createSpriteAnimation2D([[0, 0, 0.5, 1], [0.5, 0, 1, 1]], 5) },
      ]);
      const body = physics.createCircle({ x: 480, y: 270, radius: 14, restitution: 0.35, friction: 0.1 });
      const camera = scene.spawn([
        { type: NameComponent, value: 'Primary camera' },
        { type: TransformComponent, value: createTransform2D(480, 270) },
        { type: Camera2DComponent, value: createCamera2D(1) },
      ]);
      const scoreLabel = scene.spawn([
        { type: NameComponent, value: 'Score UI' },
        { type: TransformComponent, value: createTransform2D(250, 28, 0, 1, 1, 20) },
        { type: Text2DComponent, value: createText2D('SCORE 0  BEST 0', 18, { zIndex: 20 }) },
      ]);
      [[330,190],[630,190],[330,350],[630,350],[480,135],[480,405]].forEach(([x, y], index) => {
        scene.instantiate(collectiblePrefab, { x: x ?? 0, y: y ?? 0, value: 10 + index * 5 });
      });
      ready({ player, body, scoreLabel, camera });
    },
    teardown: () => { physics.clear(); },
  };
}

function createTextures(renderer: Render2DService, textures: Texture2DHandle[]): void {
  textures.push(renderer.createRgbaTexture('reference-arena.backdrop', 4, 4, checkerPixels()));
  textures.push(renderer.createRgbaTexture('reference-arena.player', 16, 8, playerPixels()));
  textures.push(renderer.createRgbaTexture('reference-arena.collectible', 8, 8, collectiblePixels()));
}

function checkerPixels(): Uint8Array {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
    const offset = (y * 4 + x) * 4, bright = (x + y) % 2 === 0;
    pixels.set(bright ? [18, 28, 48, 255] : [12, 20, 36, 255], offset);
  }
  return pixels;
}

function playerPixels(): Uint8Array {
  const pixels = new Uint8Array(16 * 8 * 4);
  for (let frame = 0; frame < 2; frame += 1) for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const distance = Math.hypot(x - 3.5, y - 3.5), offset = (y * 16 + frame * 8 + x) * 4;
    if (distance > 3.6) continue;
    pixels.set(frame === 0 ? [72, 220, 255, 255] : [125, 245, 210, 255], offset);
  }
  return pixels;
}

function collectiblePixels(): Uint8Array {
  const pixels = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const offset = (y * 8 + x) * 4;
    if (Math.hypot(x - 3.5, y - 3.5) <= 3.4) pixels.set([255, 196, 72, 255], offset);
  }
  return pixels;
}

function relocateCollectible(transform: ReturnType<typeof createTransform2D>, seed: number): void {
  transform.translation.x = 120 + ((seed * 193) % 720);
  transform.translation.y = 90 + ((seed * 137) % 360);
}

const SILENT_WAV_DATA_URL = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
