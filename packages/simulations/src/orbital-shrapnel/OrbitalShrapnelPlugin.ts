import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, ExperienceRuntimeControllerService, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuParticleSystem2D } from '@hooksjam/gl-game-lab-engine';
import { createOrbitalShrapnelConfig, ORBITAL_SHRAPNEL_DEFAULTS, orbitalBoolean, orbitalNumber, orbitalString, type OrbitalShrapnelConfig } from './config.js';
import { ORBITAL_OVERLAY_SHADER, ORBITAL_POINT_FRAGMENT_SHADER, ORBITAL_POINT_VERTEX_SHADER, ORBITAL_STEP_SHADER } from './shaders.js';
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
export function createOrbitalShrapnelPlugin(initial: OrbitalShrapnelConfig = ORBITAL_SHRAPNEL_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial, mode = validMode(launch.modeId) ?? 'add', styleId = validStyle(launch.styleId) ?? ORBITAL_SHRAPNEL_STYLE_MANIFEST.defaultStyleId, elapsed = 0, pendingDt = 0, cursor = 0, randomState = seedValue(launch.seed), rebuild = false, cleanup = (): void => undefined;
  let asteroidStart: {
    x: number;
    y: number;
  } | undefined;
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
      cleanup = () => { particles.dispose(); };
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
      context.provide(OrbitalShrapnelControllerService, controller);
      context.provide(ExperienceRuntimeControllerService, controller);
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
          if ((mode === 'interact' || mode === 'well') && input.snapshot.pointers[0]) {
            const pointer = input.snapshot.pointers[0], point = toWorld(pointer.x, pointer.y);
            const previous = previousPointers.get(pointer.id);
            field.active = true;
            field.x = point.x;
            field.y = point.y;
            field.vx = previous ? (point.x - previous.x) / Math.max(dt, 0.001) : 0;
            field.vy = previous ? (point.y - previous.y) / Math.max(dt, 0.001) : 0;
            previousPointers.set(pointer.id, point);
          }
          if (mode === 'add' && input.snapshot.pointers[0]) {
            const pointer = input.snapshot.pointers[0], point = toWorld(pointer.x, pointer.y), previous = previousPointers.get(pointer.id);
            queueDebris(point.x, point.y, previous ? (point.x - previous.x) / Math.max(dt, 0.001) : 0, previous ? (point.y - previous.y) / Math.max(dt, 0.001) : 0);
            previousPointers.set(pointer.id, point);
          }
          if ((launch.profile === 'preview' || launch.profile === 'demo') && input.snapshot.pointers.length === 0 && Math.floor((elapsed - dt) * 2) !== Math.floor(elapsed * 2)) {
            const angle = elapsed * 0.9, aspect = aspectRatio();
            queueDebris(Math.cos(angle) * aspect * 0.62, Math.sin(angle) * 0.58, -Math.sin(angle) * 0.45, Math.cos(angle) * 0.45);
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
              particles.render(trailTarget, (g, u) => {
                g.uniform1f(u('uAspect'), destination.width / Math.max(1, destination.height));
                g.uniform1f(u('uPointSize'), orbitalNumber(config, 'debrisSize') * Math.max(1, destination.height / 720) * 2);
                g.uniform1f(u('uStreakStrength'), orbitalNumber(config, 'streakStrength'));
                g.uniform1f(u('uOpacity'), orbitalNumber(config, 'debrisOpacity'));
                g.uniform1f(u('uBrightness'), orbitalNumber(config, 'bloomStrength'));
                g.uniform3fv(u('uPalette[0]'), palette.data);
                g.uniform1i(u('uPaletteCount'), palette.count);
              });
              particles.compositeTrails(destination, orbitalColor3(requireStyle().background), orbitalNumber(config, 'bloomStrength'));
          });
          const style = requireStyle(), palette = style.palette, planetRadius = planetRadiusWorld(), pointerRadius = (mode === 'well' ? orbitalNumber(config, 'wellRadius') : orbitalNumber(config, 'interactionRadius')) / viewportHeight() * 2;
          renderer.submitFullscreenEffect({
            id: 'orbital-shrapnel.planet',
            language: 'glsl-es-300',
            fragmentSource: ORBITAL_OVERLAY_SHADER,
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
              }
            }
          });
        }
      });
      function routePointer(event: PointerInputEvent, dt: number): void {
        const point = toWorld(event.x, event.y), previous = previousPointers.get(event.id);
        if (event.phase === 'down') {
          previousPointers.set(event.id, point);
          if (mode === 'add')
            queueDebris(point.x, point.y, 0, 0);
          if (mode === 'asteroid')
            asteroidStart = point;
        }
        else if (event.phase === 'move') {
          previousPointers.set(event.id, point);
        }
        else if (event.phase === 'up' || event.phase === 'cancel') {
          if (mode === 'asteroid' && asteroidStart) {
            const dx = point.x - asteroidStart.x, dy = point.y - asteroidStart.y, r = Math.max(0.08, Math.hypot(asteroidStart.x, asteroidStart.y)), tangent = {
              x: -asteroidStart.y / r,
              y: asteroidStart.x / r
            };
            commands.push({
              x: asteroidStart.x,
              y: asteroidStart.y,
              vx: tangent.x * 0.8 - dx * 2.4,
              vy: tangent.y * 0.8 - dy * 2.4,
              count: 1,
              radius: 0,
              jitter: 0,
              asteroid: 1,
              seed: nextRandom() * 10000
            });
          }
          asteroidStart = undefined;
          previousPointers.delete(event.id);
        }
        void previous;
        void dt;
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
          g.uniform1f(u('uGravity'), orbitalNumber(config, 'gravity'));
          g.uniform1f(u('uDamping'), orbitalNumber(config, 'drag'));
          g.uniform1f(u('uMaxSpeed'), orbitalNumber(config, 'rawMaxSpeed'));
          g.uniform1f(u('uPlanetRadius'), planetRadiusWorld());
          g.uniform1f(u('uPlanetBounce'), 0.62);
          g.uniform1i(u('uBodyCount'), Math.round(orbitalNumber(config, 'secondaryBodyCount')));
          g.uniform1f(u('uBodyStrength'), orbitalNumber(config, 'secondaryBodyStrength'));
          g.uniform1f(u('uBodyRadius'), orbitalNumber(config, 'secondaryBodyRadius'));
          g.uniform1f(u('uBodySpeed'), orbitalNumber(config, 'secondaryBodySpeed'));
          g.uniform1f(u('uSpawnActive'), spawn ? 1 : 0);
          g.uniform1i(u('uSpawnStart'), start);
          g.uniform1i(u('uSpawnCount'), count);
          g.uniform2f(u('uSpawnCenter'), spawn?.x ?? 0, spawn?.y ?? 0);
          g.uniform2f(u('uSpawnVelocity'), spawn?.vx ?? 0, spawn?.vy ?? 0);
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
          const angle = nextRandom() * Math.PI * 2, radius = 0.18 + Math.sqrt(nextRandom()) * 0.74, x = Math.cos(angle) * radius * aspect, y = Math.sin(angle) * radius, speed = Math.min(orbitalNumber(config, 'rawMaxSpeed') * 0.82, Math.sqrt(orbitalNumber(config, 'gravity') * 0.00042 / Math.max(0.05, radius))), o = i * 4;
          positions.set([
            x,
            y,
            0,
            nextRandom() * 10000
          ], o);
          velocities.set([
            -Math.sin(angle) * speed,
            Math.cos(angle) * speed,
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
    },
    dispose: () => {
      cleanup();
      commands.length = 0;
      previousPointers.clear();
    }
  };
  function queueDebris(x: number, y: number, vx: number, vy: number): void {
    const size = Number(orbitalString(config, 'rawParticleTextureSize')), capacity = size * size, count = Math.max(1, Math.round(capacity * orbitalNumber(config, 'addDebrisVolume') * 0.018));
    commands.push({
      x,
      y,
      vx: vx * orbitalNumber(config, 'addDebrisVelocity'),
      vy: vy * orbitalNumber(config, 'addDebrisVelocity'),
      count,
      radius: orbitalNumber(config, 'addRadius') / 720 * 2,
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
