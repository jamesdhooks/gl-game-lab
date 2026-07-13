import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, type ExperienceLaunchOptions, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuParticleSystem2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createSparksConfig, SPARKS_DEFAULTS, sparksNumber, sparksString, type SparksConfig } from './config.js';
import { SPARKS_POINT_FRAGMENT_SHADER, SPARKS_POINT_VERTEX_SHADER, SPARKS_RAIL_SHADER, SPARKS_STEP_SHADER } from './shaders.js';
import { sparksColor3, SPARKS_STYLE_MANIFEST } from './styles.js';
export type SparksMode = 'welding' | 'pinwheel' | 'shower' | 'build';
interface Rail {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface SpawnCommand {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: number;
  count: number;
  power: number;
  pattern: number;
  life: number;
  lifeVariation: number;
  seed: number;
  paletteSeed: number;
}
export interface SparksController extends ExperienceRuntimeController {
  readonly mode: SparksMode;
  readonly railCount: number;
  readonly particleCapacity: number;
}
export const SparksControllerService = createExtensionToken<SparksController>('gl-game-lab.simulations.sparks.controller');
export const SPARKS_PLUGIN_ID = 'gl-game-lab.simulations.sparks';
export function createSparksPlugin(initial: SparksConfig = SPARKS_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  let config = initial;
  let mode = validMode(launch.modeId) ?? 'welding';
  let styleId = validStyle(launch.styleId) ?? SPARKS_STYLE_MANIFEST.defaultStyleId;
  let elapsed = 0, pendingDt = 0, emissionAccumulator = 0, cursor = 0, randomState = normalizeSeed(launch.seed), rebuildState = false;
  let buildStart: {
    x: number;
    y: number;
  } | undefined;
  let previewRail: Rail | undefined;
  let cleanup = (): void => undefined;
  const commands: SpawnCommand[] = [];
  const rails: Rail[] = [];
  const previousPointers = new Map<number, {
    x: number;
    y: number;
  }>();
  return {
    id: SPARKS_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: context => {
      const renderer = context.get(EngineRender2D), gpu = context.get(EngineGpu2D), input = context.get(EngineInput);
      let particles = createParticles(), observedGeneration = particles.generation;
      cleanup = () => { particles.dispose(); };
      seedRails(renderer.viewport.width, renderer.viewport.height);
      applyStyle();
      const controller: SparksController = {
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
        get railCount() {
          return rails.length;
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
            throw new Error(`Unknown Sparks mode: ${value}`);
          mode = next;
          buildStart = undefined;
          previewRail = undefined;
          emissionAccumulator = 0;
        },
        setStyle: value => {
          const next = validStyle(value);
          if (!next)
            throw new Error(`Unknown Sparks style: ${value}`);
          styleId = next;
          applyStyle();
        },
        setSetting: (key, value) => {
          const oldSize = sparksString(config, 'rawParticleTextureSize');
          config = createSparksConfig({
            ...configRecord(),
            [key]: value
          });
          rebuildState ||= oldSize !== sparksString(config, 'rawParticleTextureSize');
        },
        reset: resetSimulation
      };
      registerSimulationRuntime(context, SparksControllerService, controller, () => {
        cleanup();
        commands.length = 0;
        rails.length = 0;
        previousPointers.clear();
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.sparks.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds) * sparksNumber(config, 'timeScale');
          elapsed += dt;
          pendingDt += dt;
          const events = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          for (const event of events)
            routePointer(event, dt);
          if (mode !== 'build' && input.snapshot.pointers.length > 0) {
            emissionAccumulator += dt * sparksNumber(config, 'emissionRate') / 220;
            for (const pointer of input.snapshot.pointers) {
              const previous = previousPointers.get(pointer.id);
              while (emissionAccumulator >= 1) {
                queueContact(pointer.x, pointer.y, previous ? (pointer.x - previous.x) / Math.max(dt, 0.001) : 0, previous ? (pointer.y - previous.y) / Math.max(dt, 0.001) : 0, false);
                emissionAccumulator -= 1;
              }
              previousPointers.set(pointer.id, {
                x: pointer.x,
                y: pointer.y
              });
            }
          }
          else if ((launch.profile === 'preview' || launch.profile === 'demo') && mode !== 'build') {
            emissionAccumulator += dt * (launch.profile === 'preview' ? 5 : 9);
            while (emissionAccumulator >= 1) {
              const x = renderer.viewport.width * (0.5 + Math.sin(elapsed * 0.7) * 0.28), y = renderer.viewport.height * (0.58 + Math.cos(elapsed * 0.9) * 0.12);
              queueContact(x, y, Math.cos(elapsed * 2) * 120, Math.sin(elapsed * 1.7) * 80, false);
              emissionAccumulator -= 1;
            }
          }
        }
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.sparks.render',
        stage: 'renderExtract',
        run: () => {
          gpu.submit('sparks.gpu-field', destination => {
              if (particles.generation !== observedGeneration) { observedGeneration = particles.generation; resetCpuState(); }
              if (rebuildState) {
                particles.dispose();
                particles = createParticles();
                observedGeneration = particles.generation;
                cursor = 0;
                rebuildState = false;
                particles.clearTrails();
              }
              const dt = pendingDt;
              pendingDt = 0;
              if (commands.length === 0)
                runStep(dt);
              else
                commands.splice(0, 16).forEach((command, index) => runStep(index === 0 ? dt : 0, command));
              const renderStyle = sparksString(config, 'renderStyle');
              const fade = renderStyle === 'ultra' ? sparksNumber(config, 'trailFade') : renderStyle === 'enhanced' ? 0.82 : 0;
              const trailDestination = particles.beginTrails(destination.width, destination.height, fade);
              const palette = paletteData();
              particles.render(trailDestination, (g, u) => {
                // Particle state is expressed in the renderer's logical CSS-pixel
                // world. The destination is DPR-scaled and must only control the
                // raster viewport, otherwise DPR 2 compresses the simulation into
                // the upper-left quarter and separates rail visuals from collision.
                g.uniform2f(u('uCanvasSize'), renderer.viewport.width, renderer.viewport.height);
                g.uniform1f(u('uPrimarySize'), sparksNumber(config, 'primarySparkSize'));
                g.uniform1f(u('uCoreSize'), sparksNumber(config, 'coreSparkSize'));
                g.uniform1f(u('uBounceSize'), sparksNumber(config, 'bounceSparkSize'));
                g.uniform1f(u('uSizeVariability'), sparksNumber(config, 'primarySparkSizeVariability'));
                g.uniform1f(u('uPrimaryLength'), sparksNumber(config, 'primarySparkLength'));
                g.uniform1f(u('uBounceLength'), sparksNumber(config, 'bounceSparkLength'));
                g.uniform1f(u('uLengthVariability'), sparksNumber(config, 'primarySparkLengthVariability'));
                g.uniform1f(u('uRenderTier'), renderStyle === 'basic' ? 0 : renderStyle === 'enhanced' ? 1 : 2);
                g.uniform1f(u('uCoreIntensity'), sparksNumber(config, 'coreSparkIntensity'));
                g.uniform1f(u('uGlowBias'), 1.18);
                g.uniform3fv(u('uPalette[0]'), palette.data);
                g.uniform1i(u('uPaletteCount'), palette.count);
              });
              particles.compositeTrails(destination, sparksColor3(requireStyle().background), renderStyle === 'ultra' ? sparksNumber(config, 'bloomStrength') : renderStyle === 'enhanced' ? 0.9 : 0.35);
          });
          const surfaceData = writeRails();
          renderer.submitFullscreenEffect({
            id: 'sparks.rails',
            language: 'glsl-es-300',
            fragmentSource: SPARKS_RAIL_SHADER,
            blend: 'alpha',
            uniforms: {
              uResolution: {
                type: '2f',
                value: [
                  renderer.viewport.width,
                  renderer.viewport.height
                ]
              },
              uSurfaceCount: {
                type: '1i',
                value: Math.min(13, rails.length + (previewRail ? 1 : 0))
              },
              uSurfaces: {
                type: '4fv',
                value: surfaceData
              },
              uRadius: {
                type: '1f',
                value: sparksNumber(config, 'buildRadius')
              }
            }
          });
        }
      });
      function routePointer(event: PointerInputEvent, dt: number): void {
        if (mode === 'build') {
          if (event.phase === 'down') {
            buildStart = {
              x: event.x,
              y: event.y
            };
            previewRail = {
              x1: event.x,
              y1: event.y,
              x2: event.x,
              y2: event.y
            };
          }
          else if (event.phase === 'move' && buildStart) {
            previewRail = {
              x1: buildStart.x,
              y1: buildStart.y,
              x2: event.x,
              y2: event.y
            };
          }
          else if ((event.phase === 'up' || event.phase === 'cancel') && buildStart) {
            let endX = event.x, endY = event.y;
            if (Math.hypot(endX - buildStart.x, endY - buildStart.y) < 8) {
              endX = buildStart.x;
              endY = buildStart.y;
            }
            rails.push({
              x1: buildStart.x,
              y1: buildStart.y,
              x2: endX,
              y2: endY
            });
            while (rails.length > 13)
              rails.shift();
            buildStart = undefined;
            previewRail = undefined;
          }
          return;
        }
        if (event.phase === 'down')
          queueContact(event.x, event.y, 0, 0, true);
        if (event.phase === 'up' || event.phase === 'cancel')
          previousPointers.delete(event.id);
        else {
          const previous = previousPointers.get(event.id);
          previousPointers.set(event.id, {
            x: event.x,
            y: event.y
          });
          if (event.phase === 'move' && previous)
            void dt;
        }
      }
      function runStep(dt: number, spawn?: SpawnCommand): void {
        const count = spawn ? Math.min(spawn.count, particles.capacity) : 0, start = cursor;
        if (spawn)
          cursor = (cursor + count) % particles.capacity;
        const railData = writeRails(false);
        particles.step((g, u) => {
          g.uniform1i(u('uCapacity'), particles.capacity);
          g.uniform1f(u('uDt'), dt);
          g.uniform1f(u('uGravity'), sparksNumber(config, 'gravity'));
          g.uniform1f(u('uDamping'), sparksNumber(config, 'airDrag'));
          g.uniform1f(u('uRestitution'), sparksNumber(config, 'bounceRestitution'));
          g.uniform1f(u('uSurfaceFriction'), sparksNumber(config, 'surfaceFriction'));
          g.uniform1f(u('uBounceLifeDecay'), sparksNumber(config, 'bounceLifeDecay'));
          g.uniform1f(u('uBounceBurstChance'), sparksNumber(config, 'bounceBurstChance'));
          g.uniform1f(u('uBounceBurstMinSpeed'), sparksNumber(config, 'bounceBurstMinSpeed'));
          g.uniform1f(u('uBounceBurstCount'), sparksNumber(config, 'bounceBurstCount'));
          g.uniform1f(u('uBounceBurstCountSpeedScale'), sparksNumber(config, 'bounceBurstCountSpeedScale'));
          g.uniform1f(u('uBounceBurstImpactSpeedScale'), sparksNumber(config, 'bounceBurstImpactSpeedScale'));
          g.uniform1f(u('uBounceBurstSpread'), sparksNumber(config, 'bounceBurstSpread'));
          g.uniform1f(u('uBounceSparkSpeedScale'), sparksNumber(config, 'bounceSparkSpeedScale'));
          g.uniform1f(u('uBounceSparkSpeedVariability'), sparksNumber(config, 'bounceSparkSpeedVariability'));
          g.uniform1f(u('uBounceSparkLifespan'), sparksNumber(config, 'bounceSparkLifespan'));
          g.uniform1f(u('uBounceSparkLifespanVariability'), sparksNumber(config, 'bounceSparkLifespanVariability'));
          g.uniform1f(u('uTime'), elapsed);
          g.uniform1f(u('uTurbulence'), sparksNumber(config, 'sparkTurbulence'));
          g.uniform2f(u('uWorldSize'), renderer.viewport.width, renderer.viewport.height);
          g.uniform1f(u('uBuildRadius'), sparksNumber(config, 'buildRadius'));
          g.uniform1i(u('uBuildSurfaceCount'), Math.min(13, rails.length));
          g.uniform4fv(u('uBuildSurfaces[0]'), railData);
          g.uniform1f(u('uSpawnActive'), spawn ? 1 : 0);
          g.uniform1i(u('uSpawnStart'), start);
          g.uniform1i(u('uSpawnCount'), count);
          g.uniform2f(u('uSpawnPosition'), spawn?.x ?? 0, spawn?.y ?? 0);
          g.uniform2f(u('uSpawnVelocity'), spawn?.vx ?? 0, spawn?.vy ?? 0);
          g.uniform1f(u('uSpawnKind'), spawn?.kind ?? 0);
          g.uniform1f(u('uSpawnSeed'), spawn?.seed ?? 0);
          g.uniform1f(u('uSpawnPaletteSeed'), spawn?.paletteSeed ?? 0);
          g.uniform1f(u('uSpawnPower'), spawn?.power ?? 0);
          g.uniform1f(u('uSpawnPattern'), spawn?.pattern ?? 0);
          g.uniform1f(u('uDirectionChaos'), sparksNumber(config, 'sparkDirectionChaos'));
          g.uniform1f(u('uLifeScale'), spawn?.life ?? 1);
          g.uniform1f(u('uLifeVariability'), spawn?.lifeVariation ?? 0);
        });
      }
      function createParticles(): GpuParticleSystem2D {
        const requested = Number(sparksString(config, 'rawParticleTextureSize')), size = launch.profile === 'preview' ? Math.min(256, requested) : requested;
        return gpu.createParticleSystem(`${SPARKS_PLUGIN_ID}.particles`, {
          capacity: size * size,
          width: size,
          height: size,
          precision: 'float',
          simulationFragmentSource: SPARKS_STEP_SHADER,
          particleVertexSource: SPARKS_POINT_VERTEX_SHADER,
          particleFragmentSource: SPARKS_POINT_FRAGMENT_SHADER,
          blend: 'additive',
          trails: true,
        });
      }
      function applyStyle(): void {
        const background = sparksColor3(requireStyle().background);
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
        particles.clear();
        particles.clearTrails();
        resetCpuState();
      }
      function resetCpuState(): void {
        commands.length = 0;
        previousPointers.clear();
        rails.length = 0;
        seedRails(renderer.viewport.width, renderer.viewport.height);
        elapsed = 0;
        pendingDt = 0;
        emissionAccumulator = 0;
        cursor = 0;
        randomState = normalizeSeed(launch.seed);
      }
    }
  };
  function queueContact(x: number, y: number, vx: number, vy: number, burst: boolean): void {
    const heat = sparksNumber(config, 'contactHeat'), pattern = mode === 'pinwheel' ? 1 : mode === 'shower' ? 2 : 0;
    const primaryCount = Math.max(1, Math.round((burst ? 18 : 7) + heat * (burst ? 18 : 7)));
    commands.push({
      x,
      y,
      vx,
      vy,
      kind: 1,
      count: primaryCount,
      power: sparksNumber(config, 'sparkPower') * sparksNumber(config, 'primarySparkSpeedScale'),
      pattern,
      life: sparksNumber(config, 'primarySparkLifespan'),
      lifeVariation: sparksNumber(config, 'primarySparkLifespanVariability'),
      seed: nextRandom() * 10000,
      paletteSeed: nextRandom() * 10000
    });
    const coreCount = Math.max(1, Math.round(sparksNumber(config, 'coreSparkRate') * heat));
    commands.push({
      x: x + (nextRandom() * 2 - 1) * sparksNumber(config, 'coreSparkTorchPositionVariability'),
      y: y + (nextRandom() * 2 - 1) * sparksNumber(config, 'coreSparkTorchPositionVariability'),
      vx,
      vy,
      kind: 0,
      count: coreCount,
      power: sparksNumber(config, 'torchRadius'),
      pattern,
      life: sparksNumber(config, 'coreSparkLifespan'),
      lifeVariation: sparksNumber(config, 'coreSparkLifespanVariability'),
      seed: nextRandom() * 10000,
      paletteSeed: nextRandom() * 10000
    });
  }
  function seedRails(viewportWidth: number, viewportHeight: number): void {
    const width = Math.max(1, viewportWidth);
    const height = Math.max(1, viewportHeight);
    const count = 4 + Math.floor(nextRandom() * 3);
    for (let index = 0; index < count; index += 1) {
      const centerX = randomRange(width * 0.18, width * 0.82);
      const centerY = randomRange(height * 0.46, height * 0.82);
      const length = randomRange(width * 0.18, width * 0.42);
      const angle = randomRange(-0.52, 0.52);
      const dx = Math.cos(angle) * length * 0.5;
      const dy = Math.sin(angle) * length * 0.5;
      rails.push({
        x1: clamp(centerX - dx, width * 0.06, width * 0.94),
        y1: clamp(centerY - dy, height * 0.3, height * 0.88),
        x2: clamp(centerX + dx, width * 0.06, width * 0.94),
        y2: clamp(centerY + dy, height * 0.3, height * 0.88)
      });
    }
  }
  function randomRange(min: number, max: number): number { return min + nextRandom() * (max - min); }
  function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
  function writeRails(includePreview = true): Float32Array {
    const values = new Float32Array(13 * 4);
    const list = includePreview && previewRail ? [
      ...rails,
      previewRail
    ] : rails;
    list.slice(-13).forEach((rail, index) => values.set([
      rail.x1,
      rail.y1,
      rail.x2,
      rail.y2
    ], index * 4));
    return values;
  }
  function paletteData() {
    const palette = requireStyle().palette.slice(0, 8), data = new Float32Array(24);
    palette.forEach((color, index) => data.set(sparksColor3(color), index * 3));
    return {
      data,
      count: palette.length
    };
  }
  function requireStyle() {
    const style = SPARKS_STYLE_MANIFEST.styles.find(candidate => candidate.id === styleId);
    if (!style)
      throw new Error(`Unknown Sparks style: ${styleId}`);
    return style;
  }
  function configRecord(): Readonly<Record<string, ExperienceSettingValue>> {
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
function validMode(value: string | undefined): SparksMode | undefined {
  return value === 'welding' || value === 'pinwheel' || value === 'shower' || value === 'build' ? value : undefined;
}
function validStyle(value: string | undefined): string | undefined {
  return value && SPARKS_STYLE_MANIFEST.styles.some(style => style.id === value) ? value : undefined;
}
function normalizeSeed(seed: number | undefined): number {
  const value = seed ?? 760431;
  if (!Number.isSafeInteger(value))
    throw new Error('Sparks seed must be a safe integer');
  return (value >>> 0) || 760431;
}
