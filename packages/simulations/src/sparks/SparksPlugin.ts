import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import { EngineGpu2D, EngineInput, EngineRender2D, EngineSchedule, ExperiencePreviewCycleControllerService, ParticleCommandQueue2D, type ExperienceLaunchOptions, type ExperiencePreviewCycleRequest, type ExperienceRuntimeController, type ExperienceSettingValue, type GpuParticleSystem2D, type GpuUniformEncoder2D, type GpuUniformLookup2D } from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createSparksConfig, SPARKS_DEFAULTS, sparksNumber, sparksString, type SparksConfig } from './config.js';
import { SPARKS_POINT_FRAGMENT_SHADER, SPARKS_POINT_VERTEX_SHADER, SPARKS_RAIL_SHADER, SPARKS_STEP_SHADER, SPARKS_TRAIL_FRAGMENT_SHADER, SPARKS_TRAIL_VERTEX_SHADER } from './shaders.js';
import { sparksColor3, SPARKS_STYLE_MANIFEST } from './styles.js';
import { SPARKS_PARTICLE_EFFECT } from './effect.js';
export type SparksMode = 'welding' | 'pinwheel' | 'shower' | 'build';
export interface Rail {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface SpawnCommand {
  sourceId: number | undefined;
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
interface TorchContact {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  strength: number;
  accumulator: number;
  coreAccumulator: number;
}
export interface SparksController extends ExperienceRuntimeController {
  readonly mode: SparksMode;
  readonly railCount: number;
  readonly particleCapacity: number;
}
export const SparksControllerService = createExtensionToken<SparksController>('gl-game-lab.simulations.sparks.controller');
export const SPARKS_PLUGIN_ID = 'gl-game-lab.simulations.sparks';
export function createSparksPlugin(initial: SparksConfig = SPARKS_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  const autonomousPreview = launch.profile === 'preview' || launch.profile === 'demo';
  let config = autonomousPreview ? createPreviewSparksConfig(initial) : initial;
  let settingRevision = 0;
  let lastSetting = 'initial';
  let mode = autonomousPreview ? autonomousSparksMode(validMode(launch.modeId), normalizeSeed(launch.seed)) : validMode(launch.modeId) ?? 'welding';
  let styleId = validStyle(launch.styleId) ?? SPARKS_STYLE_MANIFEST.defaultStyleId;
  let elapsed = 0, pendingDt = 0, emissionAccumulator = 0, randomState = normalizeSeed(launch.seed), rebuildState = false;
  let buildStart: {
    x: number;
    y: number;
  } | undefined;
  let previewRail: Rail | undefined;
  let cleanup = (): void => undefined;
  const commands: SpawnCommand[] = [];
  const commandQueue = new ParticleCommandQueue2D(SPARKS_PARTICLE_EFFECT);
  const rails: Rail[] = [];
  const contacts = new Map<number, TorchContact>();
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
      commandQueue.setCapacity(particles.capacity);
      cleanup = () => { particles.dispose(); };
      applyStyle();
      ensureDefaultRails();
      if (autonomousPreview) queuePreviewWarmStart();
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
        get runtimeDiagnostics() {
          return Object.freeze({
            settingRevision,
            lastSetting,
            primarySparkSize: sparksNumber(config, 'primarySparkSize'),
            primarySparkLength: sparksNumber(config, 'primarySparkLength'),
            renderStyle: sparksString(config, 'renderStyle'),
          });
        },
        setMode: value => {
          const next = validMode(value);
          if (!next)
            throw new Error(`Unknown Sparks mode: ${value}`);
          mode = autonomousPreview ? autonomousSparksMode(next, randomState) : next;
          buildStart = undefined;
          previewRail = undefined;
          emissionAccumulator = 0;
          contacts.clear();
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
          const nextConfig = createSparksConfig({
            ...configRecord(),
            [key]: value
          });
          config = autonomousPreview ? createPreviewSparksConfig(nextConfig) : nextConfig;
          settingRevision += 1;
          lastSetting = `${key}=${String(value)}`;
          rebuildState ||= oldSize !== sparksString(config, 'rawParticleTextureSize');
        },
        reset: resetSimulation
      };
      registerSimulationRuntime(context, SparksControllerService, controller, () => {
        cleanup();
        commands.length = 0;
        rails.length = 0;
        contacts.clear();
        previousPointers.clear();
      });
      if (autonomousPreview) {
        context.provide(ExperiencePreviewCycleControllerService, {
          advancePreviewCycle: (request: ExperiencePreviewCycleRequest) => {
            randomState = normalizeSeed(request.seed);
            mode = autonomousSparksMode(validMode(launch.modeId), randomState);
            commands.length = 0;
            contacts.clear();
            previousPointers.clear();
            rails.length = 0;
            seedDefaultRails();
            emissionAccumulator = 0;
            queuePreviewWarmStart();
            return 'handled';
          }
        });
      }
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.sparks.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          ensureDefaultRails();
          elapsed += dt;
          pendingDt += dt;
          const events = input.snapshot.events.filter((event): event is PointerInputEvent => event.kind === 'pointer');
          for (const event of events)
            routePointer(event, dt);
          updateContacts(dt);
          if (mode !== 'build' && input.snapshot.pointers.length > 0) {
            for (const pointer of input.snapshot.pointers) {
              const previous = previousPointers.get(pointer.id);
              const contact = contacts.get(pointer.id);
              if (contact) {
                contact.x = pointer.x;
                contact.y = pointer.y;
                contact.dx = previous ? (pointer.x - previous.x) / Math.max(dt, 0.001) : contact.dx;
                contact.dy = previous ? (pointer.y - previous.y) / Math.max(dt, 0.001) : contact.dy;
                contact.strength = pointer.pressure || 1;
              }
              previousPointers.set(pointer.id, {
                x: pointer.x,
                y: pointer.y
              });
            }
          }
          else if ((launch.profile === 'preview' || launch.profile === 'demo') && mode !== 'build') {
            emissionAccumulator += dt * (launch.profile === 'preview' ? 7.5 : 10);
            let emitted = 0;
            while ((emissionAccumulator >= 1 || (commands.length === 0 && emitted === 0)) && emitted < 3) {
              const sweep = elapsed * (mode === 'pinwheel' ? 1.15 : 0.82) + emitted * 0.71;
              const x = renderer.viewport.width * (0.5 + Math.sin(sweep) * 0.32);
              const y = renderer.viewport.height * (mode === 'shower' ? 0.16 : 0.38 + Math.cos(sweep * 1.31) * 0.13);
              const vx = mode === 'shower' ? 0 : Math.cos(sweep * 1.7) * 260;
              const vy = mode === 'shower' ? 520 : Math.sin(sweep * 1.3) * 160;
              queueContact(x, y, vx, vy, 1.18, emitted === 0, undefined, launch.profile === 'preview' ? 1.35 : 1.8);
              emissionAccumulator = Math.max(0, emissionAccumulator - 1);
              emitted += 1;
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
                commandQueue.setCapacity(particles.capacity);
                commandQueue.reset();
                rebuildState = false;
                particles.clearTrails();
              }
              const dt = pendingDt;
              pendingDt = 0;
              const pendingCommands = commands.splice(0, commandQueue.commandCapacity);
              for (const command of pendingCommands) enqueueSpawnCommand(command);
              runStep(dt);
              const renderStyle = sparksString(config, 'renderStyle');
              const palette = paletteData();
              const bindSparkRender = (
                renderTier: number,
                glowBias: number,
                primarySizeScale = 1,
                coreAlpha = 1,
              ) => (g: GpuUniformEncoder2D, u: GpuUniformLookup2D): void => {
                // Particle state is expressed in the renderer's logical CSS-pixel
                // world. The destination is DPR-scaled and must only control the
                // raster viewport, otherwise DPR 2 compresses the simulation into
                // the upper-left quarter and separates rail visuals from collision.
                g.uniform2f(u('uCanvasSize'), renderer.viewport.width, renderer.viewport.height);
                g.uniform1f(u('uPixelScale'), destination.width / Math.max(1, renderer.viewport.width));
                g.uniform1f(u('uPrimarySize'), sparksNumber(config, 'primarySparkSize'));
                g.uniform1f(u('uCoreSize'), sparksNumber(config, 'coreSparkSize'));
                g.uniform1f(u('uBounceSize'), sparksNumber(config, 'bounceSparkSize'));
                g.uniform1f(u('uPrimarySizeVariability'), sparksNumber(config, 'primarySparkSizeVariability'));
                g.uniform1f(u('uPrimaryLength'), sparksNumber(config, 'primarySparkLength'));
                g.uniform1f(u('uPrimaryLengthVariability'), sparksNumber(config, 'primarySparkLengthVariability'));
                g.uniform1f(u('uCoreSizeVariability'), sparksNumber(config, 'coreSparkSizeVariability'));
                g.uniform1f(u('uBounceLength'), sparksNumber(config, 'bounceSparkLength'));
                g.uniform1f(u('uBounceSizeVariability'), sparksNumber(config, 'bounceSparkSizeVariability'));
                g.uniform1f(u('uBounceLengthVariability'), sparksNumber(config, 'bounceSparkLengthVariability'));
                g.uniform1f(u('uTrailContinuity'), sparksNumber(config, 'trailContinuity'));
                g.uniform1f(u('uRenderTier'), renderTier);
                g.uniform1f(u('uSimDepth'), simDepthNumber(sparksString(config, 'simDepth')));
                g.uniform1f(u('uCoreIntensity'), sparksNumber(config, 'coreSparkIntensity'));
                g.uniform1f(u('uCoreAfterglow'), sparksNumber(config, 'coreSparkAfterglow'));
                g.uniform1f(u('uPrimarySizeScale'), primarySizeScale);
                g.uniform1f(u('uCoreAlpha'), coreAlpha);
                g.uniform1f(u('uGlowBias'), glowBias);
                g.uniform1f(u('uTime'), elapsed);
                g.uniform3fv(u('uPalette[0]'), palette.data);
                g.uniform1i(u('uPaletteCount'), palette.count);
              };
              if (renderStyle === 'basic') {
                particles.render(destination, bindSparkRender(0, 1));
              } else if (renderStyle === 'enhanced') {
                particles.renderPass('streaks', destination, bindSparkRender(0.5, 0.9));
                particles.render(destination, bindSparkRender(0.46, 0.82, 1.08, 0.82));
              } else {
                const trailDestination = particles.beginTrails(destination.width, destination.height, sparksNumber(config, 'trailFade'));
                particles.renderPass('streaks', trailDestination, bindSparkRender(0.88, 1.45));
                particles.render(trailDestination, bindSparkRender(0.46, 0.34, 1.05, 0.22));
                particles.renderPass('streaks', trailDestination, bindSparkRender(0.36, 0.52));
                particles.render(trailDestination, bindSparkRender(0.2, 0.16, 1.4, 0.12));
                particles.compositeTrails(destination, sparksColor3(requireStyle().background), sparksNumber(config, 'bloomStrength'));
                particles.render(destination, bindSparkRender(0.72, 1.08, 1.45));
              }
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
        if (event.phase === 'down') {
          contacts.set(event.id, {
            id: event.id,
            x: event.x,
            y: event.y,
            dx: 0,
            dy: 0,
            strength: event.pressure || 1,
            accumulator: 220,
            coreAccumulator: 0,
          });
          queueContact(event.x, event.y, 0, 0, event.pressure || 1, true, event.id);
        }
        if (event.phase === 'up' || event.phase === 'cancel') {
          contacts.delete(event.id);
          previousPointers.delete(event.id);
          flushPointerCommands(event.id);
        }
        else {
          const previous = previousPointers.get(event.id);
          previousPointers.set(event.id, {
            x: event.x,
            y: event.y
          });
          const contact = contacts.get(event.id);
          if (event.phase === 'move' && previous && contact) {
            contact.x = event.x;
            contact.y = event.y;
            contact.dx = (event.x - previous.x) / Math.max(dt, 0.001);
            contact.dy = (event.y - previous.y) / Math.max(dt, 0.001);
            contact.strength = event.pressure || 1;
          }
        }
      }
      function enqueueSpawnCommand(spawn: SpawnCommand): void {
        const shape = spawn.pattern > 1.5 ? 'shower' as const : spawn.pattern > 0.5 ? 'pinwheel' as const : undefined;
        commandQueue.enqueue({
          archetypeId: spawn.kind < 0.5 ? 'core' : spawn.kind < 1.5 ? 'primary' : 'bounce',
          count: spawn.count,
          position: [spawn.x, spawn.y],
          inheritedVelocity: [spawn.vx, spawn.vy],
          direction: -Math.PI * 0.5,
          spread: Math.PI * 0.9,
          power: spawn.power,
          seed: spawn.seed,
          paletteSeed: spawn.paletteSeed,
          ...(shape ? { shape } : {}),
          lifetimeScale: spawn.life,
          lifetimeVariability: spawn.lifeVariation,
        });
      }
      function runStep(dt: number): void {
        const railData = writeRails(false);
        particles.stepBatch(commandQueue.drain(), (g, u) => {
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
          g.uniform1f(u('uSparkPower'), sparksNumber(config, 'sparkPower') * sparksNumber(config, 'primarySparkSpeedScale'));
          g.uniform1f(u('uTime'), elapsed);
          g.uniform1f(u('uTurbulence'), sparksNumber(config, 'sparkTurbulence'));
          g.uniform2f(u('uWorldSize'), renderer.viewport.width, renderer.viewport.height);
          g.uniform1f(u('uBuildRadius'), sparksNumber(config, 'buildRadius'));
          g.uniform1f(u('uSimDepth'), simDepthNumber(sparksString(config, 'simDepth')));
          g.uniform1i(u('uBuildSurfaceCount'), Math.min(13, rails.length));
          g.uniform4fv(u('uBuildSurfaces[0]'), railData);
          g.uniform1f(u('uDirectionChaos'), sparksNumber(config, 'sparkDirectionChaos'));
        });
      }
      function createParticles(): GpuParticleSystem2D {
        const requested = Number(sparksString(config, 'rawParticleTextureSize')), size = launch.profile === 'preview' ? Math.min(256, requested) : requested;
        return gpu.createParticleSystem(`${SPARKS_PLUGIN_ID}.particles`, {
          capacity: size * size,
          width: size,
          height: size,
          precision: 'float',
          metadata: true,
          simulationFragmentSource: SPARKS_STEP_SHADER,
          particleVertexSource: SPARKS_POINT_VERTEX_SHADER,
          particleFragmentSource: SPARKS_POINT_FRAGMENT_SHADER,
          renderPasses: {
            streaks: {
              vertexSource: SPARKS_TRAIL_VERTEX_SHADER,
              fragmentSource: SPARKS_TRAIL_FRAGMENT_SHADER,
              blend: 'additive',
              verticesPerParticle: 6,
            },
          },
          blend: 'additive',
          trails: true,
          commandCapacity: SPARKS_PARTICLE_EFFECT.capacity.commandCapacity ?? 64,
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
        if (autonomousPreview) queuePreviewWarmStart();
      }
      function resetCpuState(): void {
        commands.length = 0;
        contacts.clear();
        previousPointers.clear();
        rails.length = 0;
        seedDefaultRails();
        elapsed = 0;
        pendingDt = 0;
        emissionAccumulator = 0;
        commandQueue.reset();
        randomState = normalizeSeed(launch.seed);
      }
      function ensureDefaultRails(): void {
        if (rails.length > 0) return;
        seedDefaultRails();
      }
      function seedDefaultRails(): void {
        rails.push(...(autonomousPreview ? createSparksPreviewRails(renderer.viewport.width, renderer.viewport.height, randomState) : createSparksDefaultRails(renderer.viewport.width, renderer.viewport.height)));
      }
      function queuePreviewWarmStart(): void {
        const width = Math.max(1, renderer.viewport.width);
        const height = Math.max(1, renderer.viewport.height);
        for (let index = 0; index < 4; index += 1) {
          const phase = index / 4;
          const x = width * (0.18 + phase * 0.64);
          const y = height * (mode === 'shower' ? 0.12 : 0.28 + Math.sin(phase * Math.PI * 2 + randomState * 0.0001) * 0.09);
          const vx = mode === 'shower' ? 0 : (phase - 0.5) * 520;
          const vy = mode === 'shower' ? 620 : 120;
          queueContact(x, y, vx, vy, 1.35, true, undefined, 2.2);
        }
      }
    }
  };
  function updateContacts(dt: number): void {
    for (const contact of contacts.values()) {
      contact.coreAccumulator = advanceCoreAccumulator(contact, dt);
      contact.accumulator += Math.max(0, sparksNumber(config, 'emissionRate')) * Math.max(0.25, contact.strength) * dt;
      const bursts = Math.min(18, Math.floor(contact.accumulator / 220));
      if (bursts <= 0) continue;
      contact.accumulator -= bursts * 220;
      queueContact(contact.x, contact.y, contact.dx, contact.dy, contact.strength, false, contact.id, bursts);
    }
  }
  function advanceCoreAccumulator(contact: TorchContact, dt: number): number {
    const rate = Math.max(0, sparksNumber(config, 'coreSparkRate'));
    if (rate <= 0) return 0;
    const variability = clamp(sparksNumber(config, 'coreSparkSizeVariability'), 0, 1);
    let next = contact.coreAccumulator + rate * Math.max(0.35, contact.strength) * dt;
    let flashes = 0;
    while (next >= 1 && flashes < 4) {
      const cost = mix(0.68, mix(0.44, 1.72, nextRandom()), variability);
      if (next < cost) break;
      next -= cost;
      flashes += 1;
    }
    for (let index = 0; index < flashes; index += 1)
      queueCore(contact.x, contact.y, contact.dx, contact.dy, contact.strength * 0.82, contact.id);
    return Math.min(4, next);
  }
  function queueCore(x: number, y: number, vx: number, vy: number, strength: number, sourceId?: number): void {
    const variability = clamp(sparksNumber(config, 'coreSparkSizeVariability'), 0, 1);
    const flashVariation = mix(1, mix(0.42, 2.18, nextRandom()), variability);
    const heat = Math.max(0, sparksNumber(config, 'contactHeat')) * clamp(strength, 0.3, 2.8);
    const count = Math.max(0, Math.round((heat * 1.52 + sparksNumber(config, 'heatRadius') * 0.052 * heat) * sparksNumber(config, 'coreSparkSize') * flashVariation));
    if (count <= 0) return;
    const jitter = sparksNumber(config, 'torchRadius') * mix(0.04, 0.32, variability);
    const angle = nextRandom() * Math.PI * 2;
    const radius = jitter * Math.pow(nextRandom(), 1.85);
    const positionVariability = mode === 'welding' ? clamp(sparksNumber(config, 'coreSparkTorchPositionVariability'), 0, 50) : 0;
    commands.push({
      sourceId,
      x: x + Math.cos(angle) * radius + (nextRandom() * 2 - 1) * positionVariability,
      y: y + Math.sin(angle) * radius + (nextRandom() * 2 - 1) * positionVariability,
      vx: vx * 0.08,
      vy: vy * 0.08,
      kind: 0,
      count,
      power: Math.max(0, sparksNumber(config, 'heatRadius') * sparksNumber(config, 'coreSparkSize')) * clamp(strength * 0.036, 0, 0.18) * Math.sqrt(flashVariation),
      pattern: 0,
      life: clamp(0.28 + sparksNumber(config, 'coreSparkAfterglow') * 0.3 + heat * 0.022, 0.22, 0.78) * Math.max(0, sparksNumber(config, 'coreSparkLifespan')),
      lifeVariation: sparksNumber(config, 'coreSparkLifespanVariability'),
      seed: nextRandom() * 10000,
      paletteSeed: nextRandom() * 50000
    });
  }
  function queueContact(x: number, y: number, vx: number, vy: number, strength: number, burst: boolean, sourceId?: number, burstMultiplier = 1): void {
    const heat = sparksNumber(config, 'contactHeat'), pattern = mode === 'pinwheel' ? 1 : mode === 'shower' ? 2 : 0;
    const scaledHeat = Math.max(0, heat) * clamp(strength, 0.3, 2.2);
    const primaryCount = Math.max(0, Math.round((burst ? 34 : 10) * scaledHeat * Math.max(1, burstMultiplier)));
    if (primaryCount <= 0) return;
    const power = sparksNumber(config, 'sparkPower') * sparksNumber(config, 'primarySparkSpeedScale');
    const inheritedVx = mode === 'shower' ? 0 : vx * (burst ? 0.62 : 0.32);
    const inheritedVy = mode === 'shower' ? 0 : vy * (burst ? 0.62 : 0.32);
    commands.push({
      sourceId,
      x,
      y,
      vx: inheritedVx,
      vy: mode === 'shower' ? 0 : inheritedVy - power * 0.05,
      kind: 1,
      count: primaryCount,
      power: power * (mode === 'pinwheel' ? 1.08 : burst ? 1.18 : 0.98),
      pattern,
      life: clamp(0.42 + scaledHeat * 0.1, 0.24, 0.92) * sparksNumber(config, 'primarySparkLifespan'),
      lifeVariation: sparksNumber(config, 'primarySparkLifespanVariability'),
      seed: nextRandom() * 10000,
      paletteSeed: nextRandom() * 50000
    });
    const coreFlashes = burst ? Math.max(1, Math.round(sparksNumber(config, 'coreSparkRate') * 0.5)) : Math.min(4, Math.max(1, Math.round(Math.sqrt(Math.max(1, burstMultiplier)))));
    for (let index = 0; index < coreFlashes; index += 1) queueCore(x, y, vx, vy, strength * (burst ? 1.35 : 0.82), sourceId);
  }
  function flushPointerCommands(pointerId: number): void {
    for (let index = commands.length - 1; index >= 0; index -= 1) {
      if (commands[index]?.sourceId === pointerId)
        commands.splice(index, 1);
    }
  }
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
  function mix(from: number, to: number, amount: number): number {
    return from + (to - from) * amount;
  }
  function simDepthNumber(value: string): number {
    if (value === 'deep') return 1;
    if (value === 'flat') return 0;
    return 0.55;
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
export function createSparksDefaultRails(width: number, height: number): readonly Rail[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64) return Object.freeze([]);
  const margin = clampDefaultRail(width * 0.08, 20, 96);
  const bottom = height - clampDefaultRail(height * 0.12, 38, 92);
  const midY = height * 0.58;
  const upperY = height * 0.42;
  const pegX = width * 0.5;
  const pegY = height * 0.66;
  return Object.freeze([
    Object.freeze({ x1: margin, y1: bottom, x2: width - margin, y2: bottom }),
    Object.freeze({ x1: width * 0.12, y1: midY, x2: width * 0.4, y2: midY + height * 0.1 }),
    Object.freeze({ x1: width * 0.6, y1: upperY + height * 0.08, x2: width * 0.88, y2: upperY - height * 0.05 }),
    Object.freeze({ x1: pegX, y1: pegY, x2: pegX, y2: pegY }),
  ]);
}
export function createSparksPreviewRails(width: number, height: number, seed: number): readonly Rail[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64) return Object.freeze([]);
  let state = normalizeSeed(seed);
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const rails: Rail[] = [
    {
      x1: width * 0.08,
      y1: height * previewMix(0.76, 0.86, random()),
      x2: width * 0.92,
      y2: height * previewMix(0.76, 0.86, random()),
    },
  ];
  const railCount = 2 + Math.floor(random() * 2);
  for (let index = 0; index < railCount; index += 1) {
    const centerX = width * previewMix(0.22, 0.78, random());
    const centerY = height * previewMix(0.36, 0.7, random());
    const length = Math.min(width, height) * previewMix(0.24, 0.42, random());
    const angle = previewMix(-0.72, 0.72, random()) + (index % 2 === 0 ? 0.18 : -0.18);
    const halfX = Math.cos(angle) * length * 0.5;
    const halfY = Math.sin(angle) * length * 0.5;
    rails.push({
      x1: clampDefaultRail(centerX - halfX, width * 0.08, width * 0.92),
      y1: clampDefaultRail(centerY - halfY, height * 0.24, height * 0.86),
      x2: clampDefaultRail(centerX + halfX, width * 0.08, width * 0.92),
      y2: clampDefaultRail(centerY + halfY, height * 0.24, height * 0.86),
    });
  }
  const pegCount = 1 + Math.floor(random() * 3);
  for (let index = 0; index < pegCount; index += 1) {
    const x = width * previewMix(0.18, 0.82, random());
    const y = height * previewMix(0.42, 0.72, random());
    rails.push({ x1: x, y1: y, x2: x, y2: y });
  }
  return Object.freeze(rails.slice(0, 7).map((rail) => Object.freeze(rail)));
}
function autonomousSparksMode(requested: SparksMode | undefined, seed: number): SparksMode {
  if (requested && requested !== 'build') return requested;
  const modes: readonly SparksMode[] = ['welding', 'pinwheel', 'shower'];
  return modes[normalizeSeed(seed) % modes.length] ?? 'welding';
}
export function createPreviewSparksConfig(config: SparksConfig): SparksConfig {
  return createSparksConfig({
    ...config,
    emissionRate: clampPreviewNumber(config, 'emissionRate', 9_000, 32_000),
    contactHeat: clampPreviewNumber(config, 'contactHeat', 4.2, 10),
    sparkPower: clampPreviewNumber(config, 'sparkPower', 1_800, 4_200),
    sparkDirectionChaos: clampPreviewNumber(config, 'sparkDirectionChaos', 0.32, 0.9),
    gravity: clampPreviewNumber(config, 'gravity', 720, 1_180),
    airDrag: clampPreviewNumber(config, 'airDrag', 0.55, 1.45),
    coreSparkRate: clampPreviewNumber(config, 'coreSparkRate', 3.5, 9),
    coreSparkSize: clampPreviewNumber(config, 'coreSparkSize', 0.82, 2.4),
    coreSparkLifespan: clampPreviewNumber(config, 'coreSparkLifespan', 0.32, 1.25),
    primarySparkSize: clampPreviewNumber(config, 'primarySparkSize', 0.16, 0.9),
    primarySparkLength: clampPreviewNumber(config, 'primarySparkLength', 3.5, 9.5),
    primarySparkLifespan: clampPreviewNumber(config, 'primarySparkLifespan', 0.75, 1.65),
    primarySparkSpeedScale: clampPreviewNumber(config, 'primarySparkSpeedScale', 0.72, 1.8),
    bounceSparkSize: clampPreviewNumber(config, 'bounceSparkSize', 0.12, 0.62),
    bounceSparkLength: clampPreviewNumber(config, 'bounceSparkLength', 2.5, 8),
    bounceSparkSpeedScale: clampPreviewNumber(config, 'bounceSparkSpeedScale', 0.35, 1.4),
    bounceBurstChance: clampPreviewNumber(config, 'bounceBurstChance', 0.28, 0.82),
    bounceBurstCount: clampPreviewNumber(config, 'bounceBurstCount', 6, 20),
    buildRadius: clampPreviewNumber(config, 'buildRadius', 14, 24),
    heatRadius: clampPreviewNumber(config, 'heatRadius', 60, 110),
    bloomStrength: clampPreviewNumber(config, 'bloomStrength', 0.35, 4.2),
    particleFidelity: clampPreviewNumber(config, 'particleFidelity', 0.25, 0.75),
    trailFidelity: clampPreviewNumber(config, 'trailFidelity', 0.25, 0.6),
    bloomFidelity: clampPreviewNumber(config, 'bloomFidelity', 0.125, 0.5),
    bloomSamples: clampPreviewNumber(config, 'bloomSamples', 1, 3),
    environmentLight: clampPreviewNumber(config, 'environmentLight', 0, 0.7),
    lightShafts: clampPreviewNumber(config, 'lightShafts', 0, 0.28),
    heatDistortion: clampPreviewNumber(config, 'heatDistortion', 0, 0.12),
    lightingFidelity: clampPreviewNumber(config, 'lightingFidelity', 0.125, 0.5),
    rawParticleTextureSize: '256',
    renderStyle: sparksString(config, 'renderStyle'),
  });
}
function clampPreviewNumber(config: SparksConfig, key: string, min: number, max: number): number {
  return Math.max(min, Math.min(max, sparksNumber(config, key)));
}
function clampDefaultRail(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function previewMix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
