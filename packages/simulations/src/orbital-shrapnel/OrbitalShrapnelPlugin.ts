import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuParticleSystem2D, type Texture2DHandle } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createOrbitalShrapnelConfig, ORBITAL_SHRAPNEL_DEFAULTS, orbitalBoolean, orbitalNumber, orbitalString, type OrbitalShrapnelConfig } from './config.js';
import { ORBITAL_OVERLAY_SHADER, ORBITAL_POINT_FRAGMENT_SHADER, ORBITAL_POINT_VERTEX_SHADER, ORBITAL_REALISTIC_OVERLAY_SHADER, ORBITAL_STEP_SHADER } from './shaders.js';
import { asteroidLaunchVelocity, orbitalGravityWorld, stableOrbitalVelocity } from './orbitalMotion.js';
import { orbitalColor3, ORBITAL_SHRAPNEL_STYLE_MANIFEST } from './styles.js';
export type OrbitalShrapnelMode = 'add' | 'interact' | 'well' | 'asteroid';
interface Spawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  count: number;
  radius: number;
  jitter: number;
  asteroid: number;
  seed: number;
}
interface PointerField {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface OrbitalShrapnelController extends ExperienceRuntimeController {
  readonly mode: OrbitalShrapnelMode;
  readonly particleCapacity: number;
}
export const OrbitalShrapnelControllerService = createExtensionToken<OrbitalShrapnelController>('gl-game-lab.simulations.orbital-shrapnel.controller');
export const ORBITAL_SHRAPNEL_PLUGIN_ID = 'gl-game-lab.simulations.orbital-shrapnel';
const EARTH_TEXTURE_URL = new URL('./assets/earth-natural-1024.jpg', import.meta.url).href;
const MOON_TEXTURE_URL = new URL('./assets/moon-natural-512.jpg', import.meta.url).href;
export function createOrbitalShrapnelPlugin(initial: OrbitalShrapnelConfig = ORBITAL_SHRAPNEL_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode = validMode(launch.modeId) ?? 'add', styleId = validStyle(launch.styleId) ?? ORBITAL_SHRAPNEL_STYLE_MANIFEST.defaultStyleId, elapsed = 0, pendingDt = 0, cursor = 0, randomState = seedValue(launch.seed), rebuild = false, cleanup = (): void => undefined;
  let asteroidStart: {
    x: number;
    y: number;
  } | undefined;
  let activePointerId: number | undefined;
  let addEmitter: { x: number; y: number; targetX: number; targetY: number; vx: number; vy: number; active: boolean } | undefined;
  const commands: Spawn[] = [];
  const field: PointerField = {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0
  };
  const previousPointers = new Map<number, {
    x: number;
    y: number;
  }>();
  return {
    id: ORBITAL_SHRAPNEL_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let particles = createParticles(), observedGeneration = particles.generation;
      let earthTexture: Texture2DHandle | undefined, moonTexture: Texture2DHandle | undefined, disposed = false;
      void Promise.all([
        loadImageTexture(renderer, 'orbital.realistic.earth', EARTH_TEXTURE_URL),
        loadImageTexture(renderer, 'orbital.realistic.moon', MOON_TEXTURE_URL),
      ]).then(([earth, moon]) => {
        if (disposed) { renderer.destroyTexture(earth); renderer.destroyTexture(moon); return; }
        earthTexture = earth; moonTexture = moon;
      }).catch(() => undefined);
      cleanup = () => {
        disposed = true;
        particles.dispose();
        if (earthTexture) renderer.destroyTexture(earthTexture);
        if (moonTexture) renderer.destroyTexture(moonTexture);
      };
      applyStyle();
      const controller: OrbitalShrapnelController = {
        get mode() {
          return mode;
        },
        get modeId() {
          return mode;
        },
        get styleId() {
          return styleId;
        },
        get settings() {
          return Object.freeze({
            ...config
          });
        },
        get particleCapacity() {
          return particles.capacity;
        },
        get entityCount() {
          return particles.capacity;
        },
        setMode: value => {
          const next = validMode(value);
          if (!next)
            throw new Error(`Unknown Space Debris mode: ${value}`);
          mode = next;
          field.active = false;
          asteroidStart = undefined;
          addEmitter = undefined;
          activePointerId = undefined;
          previousPointers.clear();
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Space Debris style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const old = orbitalString(config, 'rawParticleTextureSize');
          config = createOrbitalShrapnelConfig({
            ...record(),
            [key]: value
          });
          rebuild ||= old !== orbitalString(config, 'rawParticleTextureSize');
        },
        reset: resetSimulation
      };
      registerSimulationRuntime(context, OrbitalShrapnelControllerService, controller, () => {
        cleanup();
        commands.length = 0;
        previousPointers.clear();
        addEmitter = undefined;
        activePointerId = undefined;
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.orbital-shrapnel.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          elapsed += dt;
          pendingDt += dt;
          field.active = false;
          for (const event of input.snapshot.events)
            if (event.kind === 'pointer')
              routePointer(event, dt);
          const heldPointer = activePointerId === undefined
            ? undefined
            : input.snapshot.pointers.find(pointer => pointer.id === activePointerId && pointer.buttons !== 0);
          if ((mode === 'interact' || mode === 'well') && heldPointer) {
            const pointer = heldPointer, point = toWorld(pointer.x, pointer.y);
            const previous = previousPointers.get(pointer.id);
            field.active = true;
            field.x = point.x;
            field.y = point.y;
            field.vx = previous ? (point.x - previous.x) / Math.max(dt, 0.001) : 0;
            field.vy = previous ? (point.y - previous.y) / Math.max(dt, 0.001) : 0;
            previousPointers.set(pointer.id, point);
          }
          if (mode === 'add' && heldPointer) {
            const pointer = heldPointer, point = toWorld(pointer.x, pointer.y);
            if (!addEmitter) addEmitter = { x: point.x, y: point.y, targetX: point.x, targetY: point.y, vx: 0, vy: 0, active: true };
            addEmitter.targetX = point.x; addEmitter.targetY = point.y; addEmitter.active = true;
            const previousX = addEmitter.x, previousY = addEmitter.y, follow = 1 - Math.exp(-dt * 16);
            addEmitter.x += (addEmitter.targetX - addEmitter.x) * follow;
            addEmitter.y += (addEmitter.targetY - addEmitter.y) * follow;
            addEmitter.vx = (addEmitter.x - previousX) / Math.max(dt, 1 / 240);
            addEmitter.vy = (addEmitter.y - previousY) / Math.max(dt, 1 / 240);
            queueDebris(addEmitter.x, addEmitter.y, addEmitter.vx, addEmitter.vy, Math.min(renderer.viewport.width, renderer.viewport.height));
          }
          else if (addEmitter) addEmitter.active = false;
          if ((launch.profile === 'preview' || launch.profile === 'demo') && !heldPointer && Math.floor((elapsed - dt) * 2) !== Math.floor(elapsed * 2)) {
            const angle = elapsed * 0.9, aspect = aspectRatio();
            queueDebris(Math.cos(angle) * aspect * 0.62, Math.sin(angle) * 0.58, -Math.sin(angle) * 0.45, Math.cos(angle) * 0.45, Math.min(renderer.viewport.width, renderer.viewport.height));
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.orbital-shrapnel.render',
        stage: 'renderExtract',
        run: () => {
          gpu.submit('orbital-shrapnel.gpu-orbits', destination => {
              if (particles.generation !== observedGeneration) { observedGeneration = particles.generation; resetAfterContextRestore(); }
              if (rebuild) {
                particles.dispose();
                particles = createParticles();
                observedGeneration = particles.generation;
                cursor = 0;
                rebuild = false;
                particles.clearTrails();
              }
              const dt = pendingDt;
              pendingDt = 0;
              if (commands.length === 0)
                runStep(dt);
              else
                commands.splice(0, 12).forEach((spawn, index) => runStep(index === 0 ? dt : 0, spawn));
              const trailTarget = particles.beginTrails(destination.width, destination.height, orbitalNumber(config, 'trailFade')), palette = paletteData();
              const realistic = styleId === 'realistic';
              particles.render(trailTarget, (g, u) => {
                g.uniform1f(u('uAspect'), destination.width / Math.max(1, destination.height));
                g.uniform1f(u('uPointSize'), orbitalNumber(config, 'debrisSize') * Math.max(1, destination.height / 720) * 2);
                g.uniform1f(u('uStreakStrength'), orbitalNumber(config, 'streakStrength'));
                g.uniform1f(u('uOpacity'), orbitalNumber(config, 'debrisOpacity') * (realistic ? 0.42 : 1));
                g.uniform1f(u('uBrightness'), orbitalNumber(config, 'bloomStrength') * (realistic ? 0.38 : 1));
                g.uniform3fv(u('uPalette[0]'), palette.data);
                g.uniform1i(u('uPaletteCount'), palette.count);
              });
              particles.compositeTrails(destination, orbitalColor3(requireStyle().background), orbitalNumber(config, 'bloomStrength') * (realistic ? 0.24 : 1));
          });
          const style = requireStyle(), palette = style.palette, planetRadius = planetRadiusWorld(), pointerRadius = (mode === 'well' ? orbitalNumber(config, 'wellRadius') : orbitalNumber(config, 'interactionRadius')) / viewportHeight() * 2;
          const realisticTextures = styleId === 'realistic' && earthTexture && moonTexture ? { earth: earthTexture, moon: moonTexture } : undefined;
          renderer.submitFullscreenEffect({
            id: 'orbital-shrapnel.planet',
            language: 'glsl-es-300',
            fragmentSource: realisticTextures ? ORBITAL_REALISTIC_OVERLAY_SHADER : ORBITAL_OVERLAY_SHADER,
            blend: 'alpha',
            uniforms: {
              uResolution: {
                type: '2f',
                value: [
                  renderer.viewport.width,
                  renderer.viewport.height
                ]
              },
              uTime: {
                type: '1f',
                value: elapsed
              },
              uPlanetRadius: {
                type: '1f',
                value: planetRadius
              },
              uPlanetA: {
                type: '3f',
                value: orbitalColor3(palette[1] ?? 1982639)
              },
              uPlanetB: {
                type: '3f',
                value: orbitalColor3(palette[2] ?? 2278750)
              },
              uPlanetLight: {
                type: '3f',
                value: orbitalColor3(palette[palette.length - 1] ?? 16777215)
              },
              uStars: {
                type: '1f',
                value: orbitalBoolean(config, 'starField') ? 1 : 0
              },
              uStarOpacity: {
                type: '1f',
                value: orbitalNumber(config, 'starFieldOpacity')
              },
              uBodyCount: {
                type: '1i',
                value: Math.round(orbitalNumber(config, 'secondaryBodyCount'))
              },
              uBodyRadius: {
                type: '1f',
                value: orbitalNumber(config, 'secondaryBodyRadius')
              },
              uBodySpeed: {
                type: '1f',
                value: orbitalNumber(config, 'secondaryBodySpeed')
              },
              uPointerActive: {
                type: '1f',
                value: field.active ? 1 : 0
              },
              uPointerMode: {
                type: '1i',
                value: mode === 'well' ? 2 : mode === 'interact' ? 1 : 0
              },
              uPointer: {
                type: '2f',
                value: [
                  field.x,
                  field.y
                ]
              },
              uPointerRadius: {
                type: '1f',
                value: pointerRadius
              },
              ...(realisticTextures ? {
                uEarthTexture: { type: 'texture' as const, value: realisticTextures.earth },
                uMoonTexture: { type: 'texture' as const, value: realisticTextures.moon },
              } : {})
            }
          });
        }
      });
      function routePointer(event: PointerInputEvent, dt: number): void {
        const point = toWorld(event.x, event.y);
        if (event.phase === 'down') {
          if (activePointerId !== undefined && activePointerId !== event.id) return;
          activePointerId = event.id;
          previousPointers.set(event.id, point);
          if (mode === 'add')
            addEmitter = { x: point.x, y: point.y, targetX: point.x, targetY: point.y, vx: 0, vy: 0, active: true };
          if (mode === 'asteroid')
            asteroidStart = point;
        }
        else if (event.phase === 'move') {
          if (event.id !== activePointerId) return;
          if (event.buttons === 0) {
            releasePointer(event.id, point);
            return;
          }
          previousPointers.set(event.id, point);
        }
        else if (event.phase === 'up' || event.phase === 'cancel') {
          if (event.id !== activePointerId) return;
          releasePointer(event.id, point);
        }
        void dt;
      }
      function releasePointer(pointerId: number, point: { x: number; y: number }): void {
          if (mode === 'asteroid' && asteroidStart) {
            const dx = point.x - asteroidStart.x, dy = point.y - asteroidStart.y;
            const velocity = asteroidLaunchVelocity(
              point.x,
              point.y,
              dx,
              dy,
              orbitalGravityWorld(orbitalNumber(config, 'gravity')),
              planetRadiusWorld(),
              orbitalNumber(config, 'rawMaxSpeed'),
            );
            commands.push({
              x: point.x,
              y: point.y,
              vx: velocity.vx,
              vy: velocity.vy,
              count: 1,
              radius: 0,
              jitter: 0,
              asteroid: 1,
              seed: nextRandom() * 10000
            });
          }
          asteroidStart = undefined;
          if (mode === 'add' && addEmitter) addEmitter.active = false;
          field.active = false;
          previousPointers.delete(pointerId);
          activePointerId = undefined;
      }
      function runStep(dt: number, spawn?: Spawn): void {
        const count = spawn ? Math.min(particles.capacity, spawn.count) : 0, start = cursor;
        if (spawn)
          cursor = (cursor + count) % particles.capacity;
        particles.step((g, u) => {
          g.uniform1i(u('uCapacity'), particles.capacity);
          g.uniform1f(u('uDt'), dt);
          g.uniform1f(u('uTime'), elapsed);
          g.uniform1f(u('uAspect'), aspectRatio());
          g.uniform1f(u('uGravity'), orbitalGravityWorld(orbitalNumber(config, 'gravity')));
          g.uniform1f(u('uDamping'), orbitalNumber(config, 'drag'));
          g.uniform1f(u('uMaxSpeed'), orbitalNumber(config, 'rawMaxSpeed'));
          g.uniform1f(u('uPlanetRadius'), planetRadiusWorld());
          g.uniform1f(u('uPlanetBounce'), 0.62);
          g.uniform1i(u('uBodyCount'), Math.round(orbitalNumber(config, 'secondaryBodyCount')));
          g.uniform1f(u('uBodyStrength'), orbitalNumber(config, 'secondaryBodyStrength') * 0.18);
          g.uniform1f(u('uBodyRadius'), orbitalNumber(config, 'secondaryBodyRadius'));
          g.uniform1f(u('uBodySpeed'), orbitalNumber(config, 'secondaryBodySpeed'));
          g.uniform1f(u('uSpawnActive'), spawn ? 1 : 0);
          g.uniform1i(u('uSpawnStart'), start);
          g.uniform1i(u('uSpawnCount'), count);
          g.uniform2f(u('uSpawnCenter'), spawn?.x ?? 0, spawn?.y ?? 0);
          g.uniform2f(u('uSpawnVelocity'), spawn?.vx ?? 0, spawn?.vy ?? 0);
          g.uniform1f(u('uSpawnVelocityScale'), orbitalNumber(config, 'addDebrisVelocity'));
          g.uniform1f(u('uSpawnRadius'), spawn?.radius ?? 0);
          g.uniform1f(u('uSpawnJitter'), spawn?.jitter ?? 0);
          g.uniform1f(u('uSpawnAsteroid'), spawn?.asteroid ?? 0);
          g.uniform1f(u('uSpawnSeed'), spawn?.seed ?? 0);
          g.uniform1f(u('uPointerActive'), field.active ? 1 : 0);
          g.uniform1i(u('uPointerMode'), mode === 'well' ? 2 : mode === 'interact' ? 1 : 0);
          g.uniform2f(u('uPointer'), field.x, field.y);
          g.uniform2f(u('uPointerVelocity'), field.vx, field.vy);
          g.uniform1f(u('uInfluenceRadius'), (mode === 'well' ? orbitalNumber(config, 'wellRadius') : orbitalNumber(config, 'interactionRadius')) / viewportHeight() * 2);
          g.uniform1f(u('uInfluenceStrength'), mode === 'well' ? orbitalNumber(config, 'wellStrength') : orbitalNumber(config, 'interactionStrength'));
        });
      }
      function createParticles(): GpuParticleSystem2D {
        const requested = Number(orbitalString(config, 'rawParticleTextureSize')), size = launch.profile === 'preview' ? Math.min(128, requested) : requested, next = gpu.createParticleSystem(`${ORBITAL_SHRAPNEL_PLUGIN_ID}.particles`, {
          capacity: size * size,
          width: size,
          height: size,
          precision: 'float',
          simulationFragmentSource: ORBITAL_STEP_SHADER,
          particleVertexSource: ORBITAL_POINT_VERTEX_SHADER,
          particleFragmentSource: ORBITAL_POINT_FRAGMENT_SHADER,
          blend: 'additive',
          trails: true,
        });
        seedRing(next);
        return next;
      }
      function seedRing(target: GpuParticleSystem2D): void {
        const positions = new Float32Array(target.width * target.height * 4), velocities = new Float32Array(positions.length), aspect = aspectRatio();
        for (let i = 0; i < target.capacity; i++) {
          const angle = i * 2.39996323 + nextRandom() * 0.08;
          const radius = 0.18 + Math.sqrt(nextRandom()) * 0.78;
          const wobble = 0.92 + nextRandom() * 0.16;
          const x = Math.cos(angle) * radius * aspect * wobble;
          const y = Math.sin(angle) * radius;
          const velocity = stableOrbitalVelocity(
            Math.cos(angle) * radius * aspect,
            y,
            aspect,
            orbitalGravityWorld(orbitalNumber(config, 'gravity')),
          );
          const o = i * 4;
          positions.set([
            x,
            y,
            0,
            nextRandom() * 10000
          ], o);
          velocities.set([
            velocity.vx,
            velocity.vy,
            1,
            nextRandom() * 10000
          ], o);
        }
        target.uploadSeed({
          positions,
          velocities
        });
      }
      function applyStyle(): void {
        const background = orbitalColor3(requireStyle().background);
        renderer.setClearColor([
          background[0],
          background[1],
          background[2],
          1
        ]);
        renderer.setBackdrop(undefined);
        renderer.setBloom({
          enabled: false
        });
        particles.clearTrails();
      }
      function resetSimulation(): void {
        randomState = seedValue(launch.seed);
        particles.dispose();
        particles = createParticles();
        observedGeneration = particles.generation;
        particles.clearTrails();
        resetCpuState();
      }
      function resetAfterContextRestore(): void {
        randomState = seedValue(launch.seed);
        resetCpuState();
      }
      function resetCpuState(): void {
        commands.length = 0;
        previousPointers.clear();
        activePointerId = undefined;
        asteroidStart = undefined;
        addEmitter = undefined;
        field.active = false;
        cursor = 0;
        elapsed = 0;
        pendingDt = 0;
      }
      function viewportHeight(): number {
        return Math.max(1, renderer.viewport.height);
      }
      function aspectRatio(): number {
        return renderer.viewport.width / viewportHeight();
      }
      function planetRadiusWorld(): number {
        return orbitalNumber(config, 'planetRadius') / viewportHeight() * 2;
      }
      function toWorld(x: number, y: number) {
        return {
          x: (x / Math.max(1, renderer.viewport.width) * 2 - 1) * aspectRatio(),
          y: 1 - y / viewportHeight() * 2
        };
      }
    }
  };
  function queueDebris(x: number, y: number, vx: number, vy: number, minViewportDimension: number): void {
    const size = Number(orbitalString(config, 'rawParticleTextureSize')), capacity = size * size, count = Math.max(1, Math.round(capacity * orbitalNumber(config, 'addDebrisVolume')));
    const inheritedLimit = orbitalNumber(config, 'addDebrisVelocity'), inheritedSpeed = Math.hypot(vx, vy), inheritedScale = inheritedSpeed > inheritedLimit && inheritedSpeed > 0 ? inheritedLimit / inheritedSpeed : 1;
    commands.push({
      x,
      y,
      vx: vx * inheritedScale,
      vy: vy * inheritedScale,
      count,
      radius: orbitalNumber(config, 'addRadius') / Math.max(1, minViewportDimension) * 2,
      jitter: orbitalNumber(config, 'addJitter'),
      asteroid: 0,
      seed: nextRandom() * 10000
    });
  }
  function paletteData() {
    const palette = requireStyle().palette.slice(0, 8), data = new Float32Array(24);
    palette.forEach((color, index) => data.set(orbitalColor3(color), index * 3));
    return {
      data,
      count: palette.length
    };
  }
  function requireStyle() {
    const style = ORBITAL_SHRAPNEL_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
    if (!style)
      throw new Error(`Unknown Space Debris style: ${styleId}`);
    return style;
  }
  function record(): Readonly<Record<string, ExperienceSettingValue>> {
    return Object.freeze({
      ...config
    });
  }
  function nextRandom(): number {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }
}
async function loadImageTexture(renderer: import('@hooksjam/gl-game-lab-engine').Render2DService, id: string, source: string): Promise<Texture2DHandle> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') throw new Error('Image textures require a browser');
  const image = new Image();
  image.decoding = 'async';
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to decode orbital texture pixels');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return renderer.createRgbaTexture(id, canvas.width, canvas.height, new Uint8Array(pixels));
}
function validMode(value: string | undefined): OrbitalShrapnelMode | undefined {
  return value === 'add' || value === 'interact' || value === 'well' || value === 'asteroid' ? value : undefined;
}
function validStyle(value: string | undefined): string | undefined {
  return value && ORBITAL_SHRAPNEL_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function seedValue(seed: number | undefined) {
  const value = seed ?? 771203;
  if (!Number.isSafeInteger(value))
    throw new Error('Space Debris seed must be a safe integer');
  return (value >>> 0) || 771203;
}
