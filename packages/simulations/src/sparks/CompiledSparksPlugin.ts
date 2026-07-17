import { createExtensionToken, type EnginePlugin, type PointerInputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineGpu2D,
  EngineInput,
  EngineParticleEffects,
  particleDiagnosticsSummary2D,
  EngineRender2D,
  EngineSchedule,
  ExperiencePreviewCycleControllerService,
  type ExperienceLaunchOptions,
  type ExperiencePreviewCycleRequest,
  type ExperienceRuntimeController,
  type ExperienceSettingValue,
  type ParticleEffectInstance2D,
} from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { createSparksConfig, SPARKS_DEFAULTS, sparksBloomIntensity, sparksNumber, sparksString, type SparksConfig } from './config.js';
import { SPARKS_PARTICLE_PROGRAM } from '../particlePrograms.js';
import { SPARKS_RAIL_SHADER } from './shaders.js';
import {
  createPreviewSparksConfig,
  createSparksDefaultRails,
  createSparksPreviewRails,
  type Rail,
  type SparksMode,
} from './SparksPlugin.js';
import { sparksColor3, SPARKS_STYLE_MANIFEST } from './styles.js';

const EFFECT_ID = SPARKS_PARTICLE_PROGRAM.effect.source.id;
const MAX_RAILS = 13;
const RAIL_FLOATS = 4;

interface Contact {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  strength: number;
  primaryAccumulator: number;
  coreAccumulator: number;
}

export interface CompiledSparksController extends ExperienceRuntimeController {
  readonly mode: SparksMode;
  readonly railCount: number;
  readonly particleCapacity: number;
}

export const CompiledSparksControllerService = createExtensionToken<CompiledSparksController>('gl-game-lab.simulations.sparks.compiled.controller');
export const COMPILED_SPARKS_PLUGIN_ID = 'gl-game-lab.simulations.sparks.compiled';

/** Compiled particle-graph implementation. The legacy plugin remains available as a parity rollback path. */
export function createCompiledSparksPlugin(initial: SparksConfig = SPARKS_DEFAULTS, launch: ExperienceLaunchOptions = {}): EnginePlugin {
  const autonomous = launch.profile === 'preview' || launch.profile === 'demo';
  let config = autonomous ? createPreviewSparksConfig(initial) : initial;
  let mode = autonomous ? autonomousMode(validMode(launch.modeId), normalizeSeed(launch.seed)) : validMode(launch.modeId) ?? 'welding';
  let styleId = validStyle(launch.styleId) ?? SPARKS_STYLE_MANIFEST.defaultStyleId;
  let randomState = normalizeSeed(launch.seed);
  let capacity = capacityFor(config, autonomous);
  let elapsed = 0;
  let autonomousAccumulator = 0;
  let railCount = 0;
  let railRevision = 0;
  let configuredWidth = 0;
  let configuredHeight = 0;
  let buildStartX = 0;
  let buildStartY = 0;
  let buildActive = false;
  let previewActive = false;
  let lightX = 0;
  let lightY = 0;
  let lightEnergy = 0;
  const rails = new Float32Array(MAX_RAILS * RAIL_FLOATS);
  const previewRail = new Float32Array(RAIL_FLOATS);
  const renderRails = new Float32Array(MAX_RAILS * RAIL_FLOATS);
  const contacts = new Map<number, Contact>();

  return {
    id: COMPILED_SPARKS_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      const renderer = context.get(EngineRender2D);
      const gpu = context.get(EngineGpu2D);
      const input = context.get(EngineInput);
      const effects = context.get(EngineParticleEffects);
      effects.register(SPARKS_PARTICLE_PROGRAM, { capacity });
      effects.prewarm(EFFECT_ID);
      const instance = effects.createInstance(EFFECT_ID, { seed: randomState, qualityTier: renderTier(config), preview: launch.profile === "preview" });
      applyStyle(instance);
      seedRails(instance);
      configure(instance, true);
      if (autonomous) queuePreviewWarmStart(instance);

      const controller: CompiledSparksController = {
        get mode() { return mode; },
        get modeId() { return mode; },
        get styleId() { return styleId; },
        get settings() { return Object.freeze({ ...config }); },
        get railCount() { return railCount; },
        get particleCapacity() { return capacity; },
        get entityCount() { return instance.diagnostics().activeEstimate; },
        get runtimeDiagnostics() {
          return Object.freeze({
            ...particleDiagnosticsSummary2D(instance.diagnostics()),
            railCount,
            contactCount: contacts.size,
            compiledEffect: EFFECT_ID,
          });
        },
        setMode: (value) => {
          const next = validMode(value);
          if (!next) throw new Error(`Unknown Sparks mode: ${value}`);
          mode = autonomous ? autonomousMode(next, randomState) : next;
          contacts.clear();
          buildActive = false;
          previewActive = false;
          autonomousAccumulator = 0;
        },
        setStyle: (value) => {
          const next = validStyle(value);
          if (!next) throw new Error(`Unknown Sparks style: ${value}`);
          styleId = next;
          applyStyle(instance);
        },
        setSetting: (key, value) => {
          const oldCapacity = capacity;
          const next = createSparksConfig({ ...configRecord(), [key]: value });
          config = autonomous ? createPreviewSparksConfig(next) : next;
          capacity = capacityFor(config, autonomous);
          if (capacity !== oldCapacity) effects.setCapacity(EFFECT_ID, capacity);
          configure(instance, key === 'buildRadius');
        },
        reset: () => reset(instance),
      };
      registerSimulationRuntime(context, CompiledSparksControllerService, controller, () => instance.dispose());

      if (autonomous) {
        context.provide(ExperiencePreviewCycleControllerService, {
          advancePreviewCycle: (request: ExperiencePreviewCycleRequest) => {
            randomState = normalizeSeed(request.seed);
            mode = autonomousMode(validMode(launch.modeId), randomState);
            styleId = SPARKS_STYLE_MANIFEST.styles[randomState % SPARKS_STYLE_MANIFEST.styles.length]?.id ?? styleId;
            applyStyle(instance);
            reset(instance);
            queuePreviewWarmStart(instance);
            return 'handled';
          },
        });
      }

      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.sparks.compiled.update',
        stage: 'update',
        run: ({ time }) => {
          const dt = Math.min(0.05, time.deltaSeconds);
          elapsed += dt;
          lightEnergy *= Math.exp(-dt * 4.6);
          if (renderer.viewport.width !== configuredWidth || renderer.viewport.height !== configuredHeight) {
            seedRails(instance);
            configure(instance, true);
          }
          for (const event of input.snapshot.events) if (event.kind === 'pointer') routePointer(instance, event, dt);
          updateContacts(instance, dt);
          if (autonomous && contacts.size === 0 && mode !== 'build') updateAutonomous(instance, dt);
          effects.update(dt);
        },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.simulations.sparks.compiled.render',
        stage: 'renderExtract',
        run: () => {
          submitEmissiveLighting();
          gpu.submit('sparks.compiled-particles', (target) => effects.render(target));
          submitRails();
        },
      });

      function configure(effect: ParticleEffectInstance2D, collidersChanged: boolean): void {
        const depth = simulationDepth(config);
        configuredWidth = Math.max(1, renderer.viewport.width);
        configuredHeight = Math.max(1, renderer.viewport.height);
        effect.setViewport({ width: configuredWidth, height: configuredHeight, dpr: renderer.viewport.pixelRatio ?? 1 });
        effect.setDomain({
          revision: 1,
          shape: 'rectangle',
          behavior: 'kill',
          center: [configuredWidth * 0.5, configuredHeight * 0.5],
          halfExtents: [configuredWidth * 0.5 + 160, configuredHeight * 0.5 + 160],
        });
        effect.setParameter('gravity', sparksNumber(config, 'gravity'));
        effect.setParameter('air-drag', sparksNumber(config, 'airDrag'));
        effect.setParameter('turbulence', sparksNumber(config, 'sparkTurbulence'));
        effect.setParameter('restitution', sparksNumber(config, 'bounceRestitution'));
        effect.setParameter('friction', sparksNumber(config, 'surfaceFriction'));
        effect.setParameter('collision-life-loss', sparksNumber(config, 'bounceLifeDecay'));
        effect.setParameter('core-size', sparksNumber(config, 'coreSparkSize'));
        effect.setParameter('core-size-variability', sparksNumber(config, 'coreSparkSizeVariability') * mix(0.38, 1, depth));
        effect.setParameter('core-intensity', sparksNumber(config, 'coreSparkIntensity'));
        effect.setParameter('primary-size', sparksNumber(config, 'primarySparkSize'));
        effect.setParameter('primary-size-variability', sparksNumber(config, 'primarySparkSizeVariability') * depth);
        effect.setParameter('primary-length', sparksNumber(config, 'primarySparkLength'));
        effect.setParameter('primary-length-variability', sparksNumber(config, 'primarySparkLengthVariability') * depth);
        effect.setParameter('bounce-size', sparksNumber(config, 'bounceSparkSize'));
        effect.setParameter('bounce-size-variability', sparksNumber(config, 'bounceSparkSizeVariability') * depth);
        effect.setParameter('bounce-length', sparksNumber(config, 'bounceSparkLength'));
        effect.setParameter('bounce-length-variability', sparksNumber(config, 'bounceSparkLengthVariability') * depth);
        effect.setEmitterSource('core-contact', { radius: sparksNumber(config, 'torchRadius') });
        effect.setEmitterSource('shower', { radius: sparksNumber(config, 'torchRadius') });
        effect.setEventParameters('primary', 0, {
          probability: sparksNumber(config, 'bounceBurstChance'),
          count: Math.round(sparksNumber(config, 'bounceBurstCount')),
          maxGeneration: 1,
          lifetime: Math.max(0.001, sparksNumber(config, 'bounceSparkLifespan')),
          velocityInheritance: 0.4,
          powerScale: sparksNumber(config, 'bounceBurstImpactSpeedScale') * sparksNumber(config, 'bounceSparkSpeedScale'),
          spread: sparksNumber(config, 'bounceBurstSpread') * Math.PI / 3,
          minimumSpeed: sparksNumber(config, 'bounceBurstMinSpeed'),
          countSpeedScale: sparksNumber(config, 'bounceBurstCountSpeedScale'),
          speedReference: Math.max(1, sparksNumber(config, 'sparkPower') * 1.35),
          basePower: sparksNumber(config, 'sparkPower'),
          lifetimeVariability: clamp(sparksNumber(config, 'bounceSparkLifespanVariability'), 0, 1),
          powerVariability: sparksNumber(config, 'bounceSparkSpeedVariability'),
        });
        effect.setQualityTier(renderTier(config));
        effect.setRenderScale(renderScale(config, capacity));
        const background = sparksColor3(requireStyle().background);
        effect.setRenderParameters({
          pointScale: 1,
          intensity: 1,
          trailFade: sparksNumber(config, 'trailFade'),
          trailBloom: 0.42,
          trailResolutionScale: sparksNumber(config, 'trailFidelity'),
          trailBackground: background,
          directComposite: true,
          paletteTransition: 0.18,
          streakScale: renderTier(config) === 'basic' ? 0.45 : sparksNumber(config, 'trailContinuity'),
          colorMode: 'seeded',
        });
        configurePostProcessing();
        if (collidersChanged) publishColliders(effect);
      }

      function applyStyle(effect: ParticleEffectInstance2D): void {
        const style = requireStyle();
        const background = sparksColor3(style.background);
        renderer.setClearColor([background[0], background[1], background[2], 1]);
        renderer.setBackdrop(undefined);
        effect.setPalette({ revision: nextSeed(), colors: style.palette.slice(0, 8).map(sparksColor3) });
        effect.setRenderParameters({ trailBackground: background });
        configurePostProcessing();
      }

      function configurePostProcessing(): void {
        const ultra = renderTier(config) === 'ultra';
        renderer.setBloom({
          enabled: ultra && sparksNumber(config, 'bloomStrength') > 0,
          threshold: sparksNumber(config, 'bloomThreshold'),
          intensity: sparksBloomIntensity(config),
          radius: sparksNumber(config, 'bloomRadius'),
          iterations: Math.round(sparksNumber(config, 'bloomSamples')),
          resolutionScale: sparksNumber(config, 'bloomFidelity'),
        });
        if (!ultra) renderer.setEmissiveLighting?.({ enabled: false });
      }

      function submitEmissiveLighting(): void {
        const ultra = renderTier(config) === 'ultra';
        if (!ultra || lightEnergy < 0.002) {
          renderer.setEmissiveLighting?.({ enabled: false });
          return;
        }
        const color = sparksColor3(requireStyle().palette[0] ?? 0xffffff);
        renderer.setEmissiveLighting?.({
          enabled: true,
          source: {
            x: lightX, y: lightY,
            radius: Math.max(1, sparksNumber(config, 'heatRadius') + sparksNumber(config, 'torchRadius') * 0.5),
            color,
            intensity: lightEnergy,
          },
          environmentStrength: sparksNumber(config, 'environmentLight'),
          shaftStrength: sparksNumber(config, 'lightShafts'),
          shaftLength: sparksNumber(config, 'shaftLength'),
          heatDistortion: sparksNumber(config, 'heatDistortion'),
          timeSeconds: elapsed,
          resolutionScale: sparksNumber(config, 'lightingFidelity'),
        });
      }

      function seedRails(effect: ParticleEffectInstance2D): void {
        const source = autonomous
          ? createSparksPreviewRails(Math.max(1, renderer.viewport.width), Math.max(1, renderer.viewport.height), randomState)
          : createSparksDefaultRails(Math.max(1, renderer.viewport.width), Math.max(1, renderer.viewport.height));
        railCount = 0;
        rails.fill(0);
        for (const rail of source) appendRail(rail);
        railRevision += 1;
        publishColliders(effect);
      }

      function appendRail(rail: Rail): void {
        if (railCount >= MAX_RAILS) {
          rails.copyWithin(0, RAIL_FLOATS, MAX_RAILS * RAIL_FLOATS);
          railCount = MAX_RAILS - 1;
        }
        rails.set([rail.x1, rail.y1, rail.x2, rail.y2], railCount * RAIL_FLOATS);
        railCount += 1;
      }

      function publishColliders(effect: ParticleEffectInstance2D): void {
        const circles: { x: number; y: number; radius: number }[] = [];
        const capsules: { ax: number; ay: number; bx: number; by: number; radius: number }[] = [];
        const radius = collisionRadius(config);
        for (let index = 0; index < railCount; index += 1) {
          const offset = index * RAIL_FLOATS;
          const x1 = rails[offset]!, y1 = rails[offset + 1]!, x2 = rails[offset + 2]!, y2 = rails[offset + 3]!;
          if (Math.hypot(x2 - x1, y2 - y1) < 0.5) circles.push({ x: x1, y: y1, radius });
          else capsules.push({ ax: x1, ay: y1, bx: x2, by: y2, radius });
        }
        effect.setColliders({ revision: railRevision, circles, capsules });
      }

      function routePointer(effect: ParticleEffectInstance2D, event: PointerInputEvent, dt: number): void {
        if (mode === 'build') {
          if (event.phase === 'down') {
            buildStartX = event.x;
            buildStartY = event.y;
            previewRail.set([event.x, event.y, event.x, event.y]);
            buildActive = true;
            previewActive = true;
          } else if (event.phase === 'move' && buildActive) {
            previewRail.set([buildStartX, buildStartY, event.x, event.y]);
          } else if ((event.phase === 'up' || event.phase === 'cancel') && buildActive) {
            let endX = event.x, endY = event.y;
            if (Math.hypot(endX - buildStartX, endY - buildStartY) < 8) { endX = buildStartX; endY = buildStartY; }
            appendRail({ x1: buildStartX, y1: buildStartY, x2: endX, y2: endY });
            railRevision += 1;
            publishColliders(effect);
            buildActive = false;
            previewActive = false;
          }
          return;
        }
        if (event.phase === 'down') {
          const contact: Contact = {
            x: event.x, y: event.y, previousX: event.x, previousY: event.y,
            velocityX: 0, velocityY: 0, strength: event.pressure || 1,
            primaryAccumulator: 220, coreAccumulator: 0,
          };
          contacts.set(event.id, contact);
          emitContact(effect, contact, true, 1);
        } else if (event.phase === 'move') {
          const contact = contacts.get(event.id);
          if (!contact) return;
          contact.velocityX = (event.x - contact.previousX) / Math.max(dt, 0.001);
          contact.velocityY = (event.y - contact.previousY) / Math.max(dt, 0.001);
          contact.previousX = event.x;
          contact.previousY = event.y;
          contact.x = event.x;
          contact.y = event.y;
          contact.strength = event.pressure || 1;
        } else if (event.phase === 'up' || event.phase === 'cancel') contacts.delete(event.id);
      }

      function updateContacts(effect: ParticleEffectInstance2D, dt: number): void {
        for (const contact of contacts.values()) {
          contact.primaryAccumulator += Math.max(0, sparksNumber(config, 'emissionRate')) * Math.max(0.25, contact.strength) * dt;
          const bursts = Math.min(18, Math.floor(contact.primaryAccumulator / 220));
          if (bursts > 0) {
            contact.primaryAccumulator -= bursts * 220;
            emitContact(effect, contact, false, bursts);
          }
          const coreRate = Math.max(0, sparksNumber(config, 'coreSparkRate'));
          contact.coreAccumulator += coreRate * Math.max(0.35, contact.strength) * dt;
          let flashes = Math.min(4, Math.floor(contact.coreAccumulator));
          contact.coreAccumulator -= flashes;
          while (flashes-- > 0) emitCore(effect, contact, 0.82);
        }
      }

      function emitContact(effect: ParticleEffectInstance2D, contact: Contact, burst: boolean, burstMultiplier: number): void {
        const scaledHeat = Math.max(0, sparksNumber(config, 'contactHeat')) * clamp(contact.strength, 0.3, 2.2);
        lightX = contact.x;
        lightY = contact.y;
        lightEnergy = Math.max(lightEnergy, clamp(scaledHeat * (burst ? 0.22 : 0.16), 0.08, 1.6));
        const count = Math.max(0, Math.round((burst ? 34 : 10) * scaledHeat * Math.max(1, burstMultiplier)));
        if (count <= 0) return;
        const power = sparksNumber(config, 'sparkPower') * sparksNumber(config, 'primarySparkSpeedScale');
        const inheritance = mode === 'shower' ? 0 : burst ? 0.62 : 0.32;
        const emitter = mode === 'pinwheel' ? 'pinwheel' : mode === 'shower' ? 'shower' : 'welding';
        const direction = mode === 'shower' ? Math.PI * 0.5 : -Math.PI * 0.5;
        const chaos = sparksNumber(config, 'sparkDirectionChaos');
        effect.emitter(emitter).writer()
          .position(contact.x, contact.y)
          .direction(direction + (mode === 'pinwheel' ? elapsed * 4.8 : 0))
          .spread(mode === 'shower' ? Math.PI * 0.12 * chaos : Math.PI * (0.16 + 1.64 * chaos))
          .power(power * (mode === 'pinwheel' ? 1.08 : burst ? 1.18 : 0.98))
          .inheritedVelocity(contact.velocityX * inheritance, mode === 'shower' ? 0 : contact.velocityY * inheritance - power * 0.05)
          .lifetime(Math.max(0.001, clamp(0.42 + scaledHeat * 0.1, 0.24, 0.92) * sparksNumber(config, 'primarySparkLifespan')))
          .lifetimeVariability(clamp(sparksNumber(config, 'primarySparkLifespanVariability'), 0, 1))
          .seed(nextSeed()).count(count).submit();
        const coreFlashes = burst ? Math.max(1, Math.round(sparksNumber(config, 'coreSparkRate') * 0.5)) : Math.min(4, Math.max(1, Math.round(Math.sqrt(Math.max(1, burstMultiplier)))));
        for (let index = 0; index < coreFlashes; index += 1) emitCore(effect, contact, burst ? 1.35 : 0.82);
      }

      function emitCore(effect: ParticleEffectInstance2D, contact: Contact, strengthScale: number): void {
        const variability = clamp(sparksNumber(config, 'coreSparkSizeVariability'), 0, 1);
        const variation = mix(1, mix(0.42, 2.18, nextRandom()), variability);
        const heat = Math.max(0, sparksNumber(config, 'contactHeat')) * clamp(contact.strength * strengthScale, 0.3, 2.8);
        const count = Math.max(0, Math.round((heat * 1.52 + sparksNumber(config, 'heatRadius') * 0.052 * heat) * sparksNumber(config, 'coreSparkSize') * variation));
        if (count <= 0) return;
        const positionVariation = mode === 'welding' ? sparksNumber(config, 'coreSparkTorchPositionVariability') : 0;
        effect.emitter('core-contact').writer()
          .position(contact.x + (nextRandom() * 2 - 1) * positionVariation, contact.y + (nextRandom() * 2 - 1) * positionVariation)
          .direction(nextRandom() * Math.PI * 2).spread(Math.PI * 2)
          .power(Math.max(0, sparksNumber(config, 'heatRadius') * sparksNumber(config, 'coreSparkSize')) * clamp(contact.strength * strengthScale * 0.036, 0, 0.18) * Math.sqrt(variation))
          .inheritedVelocity(contact.velocityX * 0.08, contact.velocityY * 0.08)
          .lifetime(Math.max(0.001, clamp(0.28 + sparksNumber(config, 'coreSparkAfterglow') * 0.3 + heat * 0.022, 0.22, 0.78) * sparksNumber(config, 'coreSparkLifespan')))
          .lifetimeVariability(clamp(sparksNumber(config, 'coreSparkLifespanVariability'), 0, 1))
          .seed(nextSeed()).count(count).submit();
      }

      function updateAutonomous(effect: ParticleEffectInstance2D, dt: number): void {
        autonomousAccumulator += dt * (launch.profile === 'preview' ? 7.5 : 10);
        let emitted = 0;
        while (autonomousAccumulator >= 1 && emitted < 3) {
          const sweep = elapsed * (mode === 'pinwheel' ? 1.15 : 0.82) + emitted * 0.71;
          const contact: Contact = {
            x: configuredWidth * (0.5 + Math.sin(sweep) * 0.32),
            y: configuredHeight * (mode === 'shower' ? 0.16 : 0.38 + Math.cos(sweep * 1.31) * 0.13),
            previousX: 0, previousY: 0,
            velocityX: mode === 'shower' ? 0 : Math.cos(sweep * 1.7) * 260,
            velocityY: mode === 'shower' ? 520 : Math.sin(sweep * 1.3) * 160,
            strength: 1.18, primaryAccumulator: 0, coreAccumulator: 0,
          };
          emitContact(effect, contact, emitted === 0, launch.profile === 'preview' ? 1.35 : 1.8);
          autonomousAccumulator -= 1;
          emitted += 1;
        }
      }

      function queuePreviewWarmStart(effect: ParticleEffectInstance2D): void {
        for (let index = 0; index < 4; index += 1) {
          const phase = index / 4;
          const contact: Contact = {
            x: Math.max(1, renderer.viewport.width) * (0.18 + phase * 0.64),
            y: Math.max(1, renderer.viewport.height) * (mode === 'shower' ? 0.12 : 0.28 + Math.sin(phase * Math.PI * 2 + randomState * 0.0001) * 0.09),
            previousX: 0, previousY: 0,
            velocityX: mode === 'shower' ? 0 : (phase - 0.5) * 520,
            velocityY: mode === 'shower' ? 620 : 120,
            strength: 1.35, primaryAccumulator: 0, coreAccumulator: 0,
          };
          emitContact(effect, contact, true, 2.2);
        }
      }

      function submitRails(): void {
        renderRails.fill(0);
        renderRails.set(rails.subarray(0, railCount * RAIL_FLOATS));
        let count = railCount;
        if (previewActive && count < MAX_RAILS) {
          renderRails.set(previewRail, count * RAIL_FLOATS);
          count += 1;
        }
        renderer.submitFullscreenEffect({
          id: 'sparks.compiled.rails', language: 'glsl-es-300', fragmentSource: SPARKS_RAIL_SHADER, blend: 'alpha',
          uniforms: {
            uResolution: { type: '2f', value: [renderer.viewport.width, renderer.viewport.height] },
            uSurfaceCount: { type: '1i', value: count },
            uSurfaces: { type: '4fv', value: renderRails },
            uRadius: { type: '1f', value: collisionRadius(config) },
          },
        });
      }

      function reset(effect: ParticleEffectInstance2D): void {
        elapsed = 0;
        autonomousAccumulator = 0;
        contacts.clear();
        buildActive = false;
        previewActive = false;
        lightEnergy = 0;
        renderer.setEmissiveLighting?.({ enabled: false });
        randomState = normalizeSeed(launch.seed);
        effect.restart(randomState);
        seedRails(effect);
        configure(effect, true);
        if (autonomous) queuePreviewWarmStart(effect);
      }

      function requireStyle() {
        const style = SPARKS_STYLE_MANIFEST.styles.find((candidate) => candidate.id === styleId);
        if (!style) throw new Error(`Unknown Sparks style: ${styleId}`);
        return style;
      }
    },
  };

  function configRecord(): Readonly<Record<string, ExperienceSettingValue>> { return Object.freeze({ ...config }); }
  function nextSeed(): number { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return randomState >>> 0; }
  function nextRandom(): number { return nextSeed() / 0x1_0000_0000; }
}

function renderTier(config: SparksConfig): 'basic' | 'enhanced' | 'ultra' {
  const style = sparksString(config, 'renderStyle');
  return style === 'basic' || style === 'ultra' ? style : 'enhanced';
}
function capacityFor(config: SparksConfig, autonomous: boolean): number {
  const requested = Number(sparksString(config, 'rawParticleTextureSize'));
  const size = autonomous ? Math.min(256, requested) : requested;
  return size * size;
}
function renderScale(config: SparksConfig, capacity: number): number {
  if (renderTier(config) === 'ultra') return sparksNumber(config, 'particleFidelity');
  if (renderTier(config) === 'enhanced') return Math.min(1, 393_216 / Math.max(1, capacity));
  return 1;
}
function validMode(value: string | undefined): SparksMode | undefined { return value === 'welding' || value === 'pinwheel' || value === 'shower' || value === 'build' ? value : undefined; }
function validStyle(value: string | undefined): string | undefined { return value && SPARKS_STYLE_MANIFEST.styles.some((style) => style.id === value) ? value : undefined; }
function autonomousMode(requested: SparksMode | undefined, seed: number): SparksMode {
  if (requested && requested !== 'build') return requested;
  const modes: readonly SparksMode[] = ['welding', 'pinwheel', 'shower'];
  return modes[seed % modes.length] ?? 'welding';
}
function normalizeSeed(seed: number | undefined): number {
  const value = seed ?? 760_431;
  if (!Number.isSafeInteger(value)) throw new Error('Sparks seed must be a safe integer');
  return (value >>> 0) || 760_431;
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function mix(from: number, to: number, amount: number): number { return from + (to - from) * amount; }
function simulationDepth(config: SparksConfig): number {
  const value = sparksString(config, 'simDepth');
  return value === 'flat' ? 0 : value === 'deep' ? 1 : 0.55;
}
function collisionRadius(config: SparksConfig): number { return sparksNumber(config, 'buildRadius') + mix(2, 7, simulationDepth(config)); }
